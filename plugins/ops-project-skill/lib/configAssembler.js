'use strict';

const { slug } = require('./projectScanner');
const { groupRoutes, overviewHubs, bindFlowKeys, pathPrefix } = require('./flowBinding');

const SCHEMA_ID = 'ops-project/v1';
const TEMPLATE_VERSION = '1.0.0';

function emptyOverviewFlow(name) {
  return {
    key: 'overview',
    name: '项目总览',
    description: `${name || '本项目'}按能力分簇：有业务衔接的模块连在一起，无衔接的单独成簇。目录/路由只进入自己绑定的那一条流程，不能进全部流程。`,
    ref_path: '',
    nodes: [
      { id: 'start', name: '开始', type: 'start', description: '', x: 80, y: 200 },
      { id: 'end', name: '结束', type: 'end', description: '', x: 900, y: 200 },
    ],
    edges: [],
  };
}

function pageFlow(groupKey, routes, index) {
  const first = routes[0] || {};
  const title = routes.length === 1
    ? (first.meta?.title || first.name || first.path || `页面 ${index + 1}`)
    : `${first.meta?.title || first.name || groupKey} 等 ${routes.length} 个入口`;
  const nodes = [
    { id: 'start', name: '开始', type: 'start', description: '', x: 80, y: 180 },
  ];
  const edges = [];
  routes.forEach((route, offset) => {
    const id = `p${offset + 1}`;
    nodes.push({
      id,
      name: route.meta?.title || route.name || route.path,
      type: 'page',
      description: `路由 ${route.path || ''}。只属于本流程 ${groupKey}，不进入其他流程`,
      x: 260 + (offset % 3) * 200,
      y: 80 + Math.floor(offset / 3) * 120,
    });
    edges.push({
      id: `e-s-${offset + 1}`,
      source: offset === 0 ? 'start' : `p${offset}`,
      target: id,
      label: offset === 0 ? '进入' : '同能力',
      type: offset === 0 ? 'next' : 'branch',
    });
  });
  nodes.push({
    id: 'act',
    name: '本能力操作',
    type: 'action',
    description: '只描述本能力；请求对端时写「进入后端/Agent（黑盒）」，不展开对端内部',
    x: 260,
    y: 280,
  });
  nodes.push({ id: 'end', name: '结束', type: 'end', description: '', x: 520, y: 280 });
  const lastPage = `p${routes.length}`;
  edges.push({ id: 'e-act', source: lastPage, target: 'act', label: '', type: 'next' });
  edges.push({ id: 'e-end', source: 'act', target: 'end', label: '完成', type: 'success' });

  return {
    key: groupKey,
    name: title,
    description: `本流程入口：${routes.map(item => item.path || item.name).join('、')}`,
    ref_path: first.path || '',
    nodes,
    edges,
  };
}

function collectPageFiles(nodes, prefix = '') {
  const list = [];
  for (const node of nodes || []) {
    const rel = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === 'file' && /\.(vue|jsx|tsx)$/i.test(node.name) && /\/(views|pages|routes)\//i.test(rel)) {
      list.push({ ...node, rel });
    }
    if (node.children?.length) list.push(...collectPageFiles(node.children, rel));
  }
  return list;
}

function buildOverview(name, featureFlows, routes) {
  const overview = emptyOverviewFlow(name);
  const hubs = overviewHubs(routes);
  const prefixOf = new Map();
  for (const flow of featureFlows) {
    const sample = (routes || []).find(item => item.flow_key === flow.key);
    prefixOf.set(flow.key, pathPrefix(sample?.path || flow.ref_path || flow.key));
  }

  const prefixIds = new Map();
  let hubIndex = 0;
  for (const prefix of hubs.keys()) {
    const id = `hub-${slug(prefix)}`;
    prefixIds.set(prefix, id);
    overview.nodes.splice(overview.nodes.length - 1, 0, {
      id,
      name: `${prefix} 入口`,
      type: 'decision',
      description: `同一路径前缀下的能力。目录 ${prefix} 若子能力不唯一则不绑 flow_key，避免「一个目录进所有流程」`,
      x: 220,
      y: 80 + hubIndex * 140,
    });
    overview.edges.push({
      id: `e-hub-${hubIndex + 1}`,
      source: 'start',
      target: id,
      label: prefix,
      type: 'branch',
    });
    hubIndex += 1;
  }

  featureFlows.forEach((flow, index) => {
    const id = `feat-${index + 1}`;
    const prefix = prefixOf.get(flow.key) || 'root';
    const hubId = prefixIds.get(prefix);
    const siblings = featureFlows.filter(item => prefixOf.get(item.key) === prefix);
    const isolated = siblings.length === 1 && hubs.size > 1;
    overview.nodes.splice(overview.nodes.length - 1, 0, {
      id,
      name: flow.name,
      type: 'page',
      description: `对应流程 ${flow.key}。${isolated ? '与其它前缀无衔接，单独成簇' : '与同前缀能力关联'}`,
      x: 460 + (index % 2) * 200,
      y: 80 + Math.floor(index / 2) * 120,
    });
    if (hubId) {
      overview.edges.push({
        id: `e-feat-${index + 1}`,
        source: hubId,
        target: id,
        label: isolated ? '独立能力' : '进入本流程',
        type: isolated ? 'branch' : 'next',
      });
    }
  });

  const lastFeat = featureFlows.length ? `feat-${featureFlows.length}` : null;
  if (lastFeat) {
    overview.edges.push({
      id: 'e-end',
      source: lastFeat,
      target: 'end',
      label: '梳理结束',
      type: 'success',
    });
  } else {
    overview.nodes.splice(1, 0, {
      id: 'n-empty',
      name: '待梳理入口',
      type: 'page',
      description: '扫描未识别到可绑定页面，先补路由或目录再生成',
      x: 320,
      y: 200,
    });
    overview.edges.push(
      { id: 'e1', source: 'start', target: 'n-empty', label: '', type: 'next' },
      { id: 'e2', source: 'n-empty', target: 'end', label: '', type: 'success' },
    );
  }
  return overview;
}

function assembleDocument({ scan, basic, hint }) {
  const name = String(basic.name || pathName(scan.source_path) || '未命名项目').trim();
  const type = [ 'frontend', 'backend', 'fullstack', 'agent' ].includes(basic.type || basic.project_type)
    ? (basic.type || basic.project_type)
    : (scan.guessed_type || 'frontend');
  const routes = (type === 'backend' || type === 'agent') ? [] : [ ...(scan.routes || []) ];
  const directory_tree = scan.directory_tree || [];

  let workingRoutes = routes;
  if (!workingRoutes.length && type !== 'backend' && type !== 'agent') {
    workingRoutes = collectPageFiles(directory_tree).slice(0, 24).map((file, index) => ({
      path: `/${slug(file.rel || file.name)}`,
      name: slug(pathParse(file.name)),
      component: pathParse(file.name),
      meta: { title: pathParse(file.name), auth: false },
      flow_key: '',
      children: [],
    }));
  }

  const groups = groupRoutes(workingRoutes);
  const featureFlows = [];
  let index = 0;
  for (const [ key, list ] of groups.entries()) {
    list.forEach(route => { route.flow_key = key; });
    featureFlows.push(pageFlow(key, list, index));
    index += 1;
  }

  const overview = buildOverview(name, featureFlows, workingRoutes);
  if (hint) {
    overview.description = `${overview.description}；补充：${String(hint).slice(0, 200)}`;
  }

  const document = {
    schema: SCHEMA_ID,
    version: TEMPLATE_VERSION,
    name,
    type,
    description: String(basic.description || ''),
    repo_url: String(basic.repo_url || ''),
    source_path: scan.source_path,
    status: basic.status || 'draft',
    directory_tree,
    routes: workingRoutes,
    flows: [ overview, ...featureFlows ],
  };
  return bindFlowKeys(document);
}

function pathName(sourcePath) {
  if (!sourcePath) return '';
  const parts = String(sourcePath).replace(/\\/g, '/').split('/');
  return parts.filter(Boolean).pop() || '';
}

function pathParse(name) {
  return String(name || '').replace(/\.[^.]+$/, '');
}

function mergeHintIntoDocument(document, hint) {
  if (!hint || !document?.flows?.[0]) return document;
  const overview = document.flows.find(flow => flow.key === 'overview') || document.flows[0];
  overview.description = `${overview.description || ''}；补充：${hint}`.slice(0, 400);
  return document;
}

function isValidDocument(raw) {
  return raw && typeof raw === 'object' && Array.isArray(raw.directory_tree) && Array.isArray(raw.flows);
}

module.exports = {
  SCHEMA_ID,
  assembleDocument,
  mergeHintIntoDocument,
  isValidDocument,
  emptyOverviewFlow,
};

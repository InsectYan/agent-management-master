'use strict';

/**
 * 扫描后把风险/警告标到已有业务节点上。
 * 风险不是节点类型：page/api/action/decision 都可以是风险点。
 */

const RISK_RE = /(wipe|reset|destroy|purge|drop|force-?delete|prod:reset|cloud-data|RESET_CLOUD_DATA|rm\b|medical-boundary|training-safety)/i;
const WARN_RE = /(login|signin|register|auth|admin|deploy|migrate|ops|audit|mfa|password|secret|token)/i;
const DELETE_RE = /\bdelete\b|\bdestroy\b|force-?delete/i;

function blobOf(route) {
  return [ route.path, route.name, route.component, route.meta?.title ].filter(Boolean).join(' ');
}

function classifyText(text) {
  const raw = String(text || '');
  if (RISK_RE.test(raw)) return 'risk';
  if (WARN_RE.test(raw) || DELETE_RE.test(raw)) return 'warning';
  return '';
}

function classifyRoutes(routes) {
  let level = '';
  for (const route of routes || []) {
    const hit = classifyText(blobOf(route));
    if (hit === 'risk') return 'risk';
    if (hit === 'warning') level = 'warning';
    if (route.component && /DELETE/i.test(route.component)) level = level || 'warning';
  }
  return level;
}

function walkTreeHints(nodes, prefix, acc) {
  for (const node of nodes || []) {
    const rel = prefix ? `${prefix}/${node.name}` : node.name;
    const hit = classifyText(`${node.name} ${rel} ${node.description || ''}`);
    if (hit) acc.push({ rel, level: hit, name: node.name });
    if (node.children?.length) walkTreeHints(node.children, rel, acc);
  }
  return acc;
}

function isFailTerminal(node) {
  return node.id === 'fail' || /失败收口|失败风险|失败码/.test(node.name || '');
}

function annotate(node, severity, riskNote) {
  if (!node) return;
  if (node.severity === 'risk' && severity === 'warning') {
    if (riskNote && !node.risk_note) node.risk_note = riskNote;
    return;
  }
  node.severity = severity;
  if (riskNote) node.risk_note = riskNote;
}

function coerceLegacyType(node) {
  if (node.type === 'risk' || node.type === 'warning') {
    if (!node.severity) node.severity = node.type;
    if (!node.risk_note) node.risk_note = node.description || '';
    node.type = 'action';
  }
}

function markFailAsRisk(flow) {
  for (const node of flow.nodes || []) {
    coerceLegacyType(node);
    const failLike = isFailTerminal(node)
      || /失败|错误|不可逆|清空|删除数据|wipe/i.test(node.name || '');
    if (!failLike) continue;
    if (node.type === 'risk' || node.type === 'warning') node.type = 'action';
    annotate(
      node,
      'risk',
      node.risk_note || '失败若被当成成功结束，会写错账、重复执行或丢掉错误码。对照 extra_json.errors 排障，边用 fail。',
    );
    if (node.name === '失败' || node.name === '失败风险') node.name = '失败收口';
  }
}

function pickAnnotateTarget(flow, preferIds) {
  for (const id of preferIds || []) {
    const hit = (flow.nodes || []).find(item => item.id === id);
    if (hit) return hit;
  }
  const pages = (flow.nodes || []).filter(item => item.type === 'page' || item.type === 'api' || item.type === 'action');
  return pages[pages.length - 1] || (flow.nodes || []).find(item => item.id === 'start');
}

function decorateFeatureFlow(flow, routes) {
  const level = classifyRoutes(routes);
  markFailAsRisk(flow);
  const hasRisk = (flow.nodes || []).some(node => node.severity === 'risk' && !isFailTerminal(node));
  const hasWarn = (flow.nodes || []).some(node => node.severity === 'warning');
  if (level === 'risk' && !hasRisk) {
    annotate(
      pickAnnotateTarget(flow, [ 'start', 'api' ]),
      'risk',
      '该能力涉及不可逆 / 清数据 / 生产写。未确认权限、备份与环境就继续，会造成数据丢失且难以回滚。',
    );
  } else if (level === 'warning' && !hasWarn) {
    annotate(
      pickAnnotateTarget(flow, [ 'api', 'start' ]),
      'warning',
      '该入口涉及登录、管理员或密钥。未开通 / 越权若仍走成功分支，会把敏感操作落到错误身份上。',
    );
  }
}

function decorateOverview(overview, featureFlows) {
  for (const flow of featureFlows) {
    const featId = `feat-${featureFlows.indexOf(flow) + 1}`;
    const feat = (overview.nodes || []).find(node => node.id === featId);
    if (!feat) continue;
    const marked = (flow.nodes || []).filter(node => (
      (node.severity === 'risk' || node.severity === 'warning') && !isFailTerminal(node)
    ));
    if (!marked.length) continue;
    const level = marked.some(node => node.severity === 'risk') ? 'risk' : 'warning';
    const hint = marked.find(node => node.severity === level) || marked[0];
    annotate(
      feat,
      level,
      hint.risk_note || (level === 'risk'
        ? '对应分流程含不可逆或安全闸门。漏标会导致生产误操作。'
        : '对应分流程含鉴权或敏感入口。漏标会把越权当成正常成功。'),
    );
  }
}

function collectRiskCatalog(flows) {
  const catalog = {};
  for (const flow of flows || []) {
    for (const node of flow.nodes || []) {
      const level = node.severity === 'risk' || node.severity === 'warning' ? node.severity : '';
      if (!level) continue;
      const code = `${flow.key}-${node.id}`.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64);
      catalog[code] = {
        level,
        when: node.risk_note || node.name,
        flow_key: flow.key,
        node_id: node.id,
      };
    }
  }
  return catalog;
}

function applyFlowRisks(document, scan) {
  if (!document?.flows) return document;
  const routes = document.routes || [];
  const treeHints = walkTreeHints(document.directory_tree || scan?.directory_tree || [], '', []);
  const byFlow = new Map();
  for (const route of routes) {
    const key = route.flow_key;
    if (!key || key === 'overview') continue;
    if (!byFlow.has(key)) byFlow.set(key, []);
    byFlow.get(key).push(route);
  }

  const featureFlows = document.flows.filter(flow => flow.key !== 'overview');
  for (const flow of featureFlows) {
    decorateFeatureFlow(flow, byFlow.get(flow.key) || []);
    const treeHit = treeHints.find(item => item.level === 'risk' && (
      classifyText(`${flow.key} ${flow.name}`) === 'risk'
      || String(flow.ref_path || '').includes(item.name)
      || String(flow.key || '').toLowerCase().includes(String(item.name || '').toLowerCase())
    ));
    if (treeHit && !(flow.nodes || []).some(node => node.severity === 'risk' && !isFailTerminal(node))) {
      annotate(
        pickAnnotateTarget(flow, [ 'start' ]),
        'risk',
        `目录 ${treeHit.rel} 名称暗示不可逆操作。未当风险点标注会在生产误跑清数据类步骤。`,
      );
    }
  }

  const overview = document.flows.find(flow => flow.key === 'overview') || document.flows[0];
  decorateOverview(overview, featureFlows);
  (document.flows || []).forEach(flow => {
    (flow.nodes || []).forEach(coerceLegacyType);
  });

  document.extra_json = document.extra_json && typeof document.extra_json === 'object'
    ? document.extra_json
    : {};
  document.extra_json.risks = collectRiskCatalog(document.flows);
  if (!/红=风险/.test(document.extra_json.node_legend || '')) {
    document.extra_json.node_legend = `${document.extra_json.node_legend || ''}；类型=业务形态；红描边=风险标注；橙描边=警告标注；原因写在 risk_note`.replace(/^；/, '');
  }
  return document;
}

module.exports = {
  classifyText,
  classifyRoutes,
  applyFlowRisks,
  collectRiskCatalog,
};

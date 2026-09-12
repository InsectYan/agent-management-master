'use strict';

/**
 * 目录 / 路由 ↔ 流程 只允许「点对点」绑定。
 * 禁止：把 overview 写到叶子上冒充「可进所有流程」；
 * 禁止：工具目录、组件目录带 flow_key。
 */

const { slug } = require('./projectScanner');

const GENERIC_NAMES = new Set([
  'src', 'components', 'component', 'assets', 'styles', 'style', 'css',
  'utils', 'util', 'helpers', 'helper', 'composables', 'hooks',
  'store', 'stores', 'lib', 'libs', 'plugins', 'plugin',
  'config', 'configs', 'static', 'public', 'common', 'shared',
  'node_modules', 'test', 'tests', '__tests__', 'types', 'typings',
  'directives', 'mixins', 'filters', 'locale', 'i18n',
  'mock', 'mocks', 'fixtures', 'docs', 'deploy', 'scripts',
  'service', 'services', 'api', 'apis', 'constants', 'enum',
]);

const SKIP_SEGMENTS = new Set([
  'pages', 'page', 'views', 'view', 'src', 'routes', 'router',
  'subpackages', 'subpackage', 'frontend', 'backend', 'app',
]);

const CRUD_LEAF = /^(create|edit|detail|new|list|index|add|update|:id|:[a-zA-Z_][\w]*)$/i;

const CLUSTERS = [
  { key: 'auth', re: /(^|\/|-)(login|signin|signup|register|invite|identity|unopened|oauth)(\/|-|$)/i },
  { key: 'assess', re: /(assess|screening|questionnaire|body-composition|circumference|fitness-test|joint-screen)/i },
  { key: 'settings', re: /(settings|account-security|feedback|about)$/i },
];

function existingFlowKeys(flows) {
  return new Set((flows || []).map(item => item.key).filter(key => key && key !== 'overview'));
}

function featureKeyFromPath(routePath, name) {
  const raw = String(routePath || '').replace(/\\/g, '/');
  for (const cluster of CLUSTERS) {
    if (cluster.re.test(raw) || cluster.re.test(String(name || ''))) {
      return cluster.key;
    }
  }
  let parts = raw.split('/').filter(Boolean)
    .filter(part => !SKIP_SEGMENTS.has(part.toLowerCase()) && !part.startsWith(':'));
  if (parts.length >= 2 && parts[parts.length - 1] === parts[parts.length - 2]) {
    parts.pop();
  }
  if (parts.length > 1 && CRUD_LEAF.test(parts[parts.length - 1])) {
    parts.pop();
  }
  const key = parts.slice(-2).join('-') || name || 'page';
  return slug(key);
}

function groupRoutes(routes) {
  const groups = new Map();
  for (const route of routes || []) {
    const key = `feat-${featureKeyFromPath(route.path, route.name)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(route);
  }
  return groups;
}

function pathPrefix(routePath) {
  const parts = String(routePath || '').replace(/\\/g, '/').split('/').filter(Boolean)
    .filter(part => !SKIP_SEGMENTS.has(part.toLowerCase()));
  return parts[0] || 'root';
}

function isPageLikeFile(nodeName, rel) {
  if (!/\.(vue|jsx|tsx)$/i.test(nodeName) && !/(Page|View)\.(js|ts)$/i.test(nodeName)) return false;
  const posix = String(rel || '').replace(/\\/g, '/');
  return /\/(views|pages|routes)\//i.test(posix) || /(Page|View)$/i.test(nodeName.replace(/\.[^.]+$/, ''));
}

function routeMatchesNode(route, nodeName, rel) {
  const base = String(nodeName || '').replace(/\.[^.]+$/, '');
  if (!base || !isPageLikeFile(nodeName, rel)) return false;
  const comp = String(route.component || '');
  const rname = String(route.name || '');
  if (comp && (comp === base || comp.endsWith(`/${base}`) || comp.endsWith(`\\${base}`))) return true;
  if (rname && (rname === base || slug(rname) === slug(base))) return true;
  const posix = String(rel || '').replace(/\\/g, '/').toLowerCase();
  const pathHint = String(route.path || '').replace(/^\//, '').toLowerCase();
  const hintParts = pathHint.split('/').filter(part => part && !part.startsWith(':'));
  const relParts = posix.split('/').filter(Boolean);
  if (hintParts.length >= 2 && hintParts.every(part => relParts.includes(part))) return true;
  const leaf = hintParts[hintParts.length - 1];
  return !!(leaf && slug(leaf) === slug(base));
}

function collectBoundKeys(nodes) {
  const set = new Set();
  for (const node of nodes || []) {
    if (node.flow_key) set.add(node.flow_key);
    collectBoundKeys(node.children).forEach(key => set.add(key));
  }
  return set;
}

function bindTree(nodes, routes, validKeys, prefix = '') {
  for (const node of nodes || []) {
    const rel = prefix ? `${prefix}/${node.name}` : node.name;
    const generic = GENERIC_NAMES.has(String(node.name || '').toLowerCase());

    if (node.type === 'file') {
      if (generic) {
        node.flow_key = '';
      } else {
        const hit = (routes || []).find(route => routeMatchesNode(route, node.name, rel));
        const key = hit && validKeys.has(hit.flow_key) ? hit.flow_key : '';
        node.flow_key = key;
      }
    } else {
      bindTree(node.children, routes, validKeys, rel);
      if (generic) {
        node.flow_key = '';
      } else {
        const childKeys = collectBoundKeys(node.children);
        node.flow_key = childKeys.size === 1 ? [ ...childKeys ][0] : '';
      }
    }
  }
}

function sanitizeTree(nodes, validKeys) {
  for (const node of nodes || []) {
    if (node.flow_key && !validKeys.has(node.flow_key)) node.flow_key = '';
    if (GENERIC_NAMES.has(String(node.name || '').toLowerCase())) node.flow_key = '';
    sanitizeTree(node.children, validKeys);
  }
}

function resolveRouteKey(route, validKeys) {
  const current = String(route.flow_key || '').trim();
  if (current && current !== 'overview' && validKeys.has(current)) return current;
  const guessed = `feat-${featureKeyFromPath(route.path, route.name)}`;
  if (validKeys.has(guessed)) return guessed;
  const nameKey = slug(route.name);
  if (nameKey && validKeys.has(nameKey)) return nameKey;
  if (nameKey && validKeys.has(`page-${nameKey}`)) return `page-${nameKey}`;
  const pathLeaf = slug(String(route.path || '').split('/').filter(Boolean).pop());
  for (const key of validKeys) {
    if (nameKey && (key === nameKey || key.endsWith(`-${nameKey}`))) return key;
    if (pathLeaf && key.endsWith(`-${pathLeaf}`)) return key;
  }
  return '';
}

function applyRouteKeys(routes, validKeys) {
  for (const route of routes || []) {
    route.flow_key = resolveRouteKey(route, validKeys);
  }
}

function bindFlowKeys(document) {
  if (!document || typeof document !== 'object') return document;
  const flows = document.flows || [];
  const routes = document.routes || [];
  const validKeys = existingFlowKeys(flows);

  applyRouteKeys(routes, validKeys);

  const tree = document.directory_tree || [];
  sanitizeTree(tree, validKeys);
  bindTree(tree, routes, validKeys);
  return document;
}

function overviewHubs(routes) {
  const hubs = new Map();
  for (const route of routes || []) {
    const prefix = pathPrefix(route.path);
    if (!hubs.has(prefix)) hubs.set(prefix, []);
    hubs.get(prefix).push(route);
  }
  return hubs;
}

module.exports = {
  GENERIC_NAMES,
  featureKeyFromPath,
  groupRoutes,
  pathPrefix,
  bindFlowKeys,
  overviewHubs,
  existingFlowKeys,
};

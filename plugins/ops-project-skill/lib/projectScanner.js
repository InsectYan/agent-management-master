'use strict';

const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.output',
  '.nuxt', '.next', '.turbo', '.cache', '.idea', '.vscode',
  '__pycache__', 'vendor', 'tmp', 'temp', 'logs',
  'workspaces',
]);

const SKIP_FILES = new Set([ '.DS_Store', 'Thumbs.db' ]);

const PAGE_FILE_RE = /\.(vue|jsx|tsx|js|ts)$/i;
const ROUTER_HINT_RE = /(createRouter|createWebHistory|routes\s*[:=]|router\.(get|post|put|patch|delete|resources)|app\.(get|post|put|patch|delete|use)\()/;
const ROUTE_PATH_RE = /path\s*:\s*['"`]([^'"`]+)['"`]/;
const ROUTE_NAME_RE = /name\s*:\s*['"`]([^'"`]+)['"`]/;
const ROUTE_COMP_RE = /component\s*:\s*(?:\(\)\s*=>\s*import\(['"`]([^'"`]+)['"`]\)|([A-Za-z0-9_]+))/;
const ROUTE_TITLE_RE = /title\s*:\s*['"`]([^'"`]+)['"`]/;
const ROUTE_REDIRECT_RE = /redirect\s*:/;
const EGG_ROUTE_RE = /router\.(get|post|put|patch|delete|resources|redirect)\(\s*['"`]([^'"`]+)['"`]/gi;

function findMatching(text, start) {
  const open = text[start];
  const close = open === '{' ? '}' : open === '[' ? ']' : null;
  if (!close) return -1;
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"' || ch === '\'' || ch === '`') {
      const quote = ch;
      i += 1;
      while (i < text.length && text[i] !== quote) {
        if (text[i] === '\\') i += 1;
        i += 1;
      }
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findObjectBlocks(text, maxLen = 20000) {
  const blocks = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '{') continue;
    const end = findMatching(text, i);
    if (end < 0) continue;
    const block = text.slice(i, end + 1);
    if (block.length <= maxLen && ROUTE_PATH_RE.test(block)) {
      blocks.push({ block, start: i, end: end + 1 });
    }
    i = end;
  }
  return blocks;
}

function topLevelBlocks(blocks) {
  return blocks.filter((item, index) => !blocks.some((other, j) => (
    j !== index && other.start < item.start && other.end > item.end
  )));
}

function joinRoutePaths(parent, child) {
  const leaf = String(child || '').trim();
  if (!leaf || leaf === '*') return '';
  if (leaf.startsWith('/')) return leaf.replace(/\/+/g, '/');
  const base = String(parent || '').replace(/\/$/, '');
  if (!base || base === '/') return `/${leaf.replace(/^\//, '')}`;
  return `${base}/${leaf}`.replace(/\/+/g, '/');
}

function extractNamedArrays(text, name) {
  const re = new RegExp(`${name}\\s*:\\s*\\[`, 'g');
  const arrays = [];
  let match;
  while ((match = re.exec(text))) {
    const start = match.index + match[0].length - 1;
    const end = findMatching(text, start);
    if (end > start) arrays.push(text.slice(start, end + 1));
  }
  return arrays;
}
const MAX_NODES = 800;
const MAX_FILE_READ = 96;
const MAX_FILE_BYTES = 220_000;

function safeStat(target) {
  try {
    return fs.statSync(target);
  } catch {
    return null;
  }
}

function shouldSkipDir(name) {
  if (SKIP_DIRS.has(name)) return true;
  if (name === '.pi') return false;
  return name.startsWith('.');
}

function slug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'item';
}

function guessType(absPath) {
  const { looksLikeAgent } = require('./agentScan');
  if (looksLikeAgent(absPath)) return 'agent';
  const hasSkill = fs.existsSync(path.join(absPath, 'SKILL.md'));
  const hasPlugins = fs.existsSync(path.join(absPath, 'plugins'));
  const pkg = path.join(absPath, 'package.json');
  let frontend = false;
  let backend = false;
  if (fs.existsSync(pkg)) {
    try {
      const json = JSON.parse(fs.readFileSync(pkg, 'utf8'));
      const deps = { ...json.dependencies, ...json.devDependencies };
      const scripts = JSON.stringify(json.scripts || {});
      frontend = !!(deps.vue || deps['vue-router'] || deps.vite || deps.react);
      backend = !!(deps.egg || deps['egg-core'] || /egg/.test(scripts) || deps.express || deps.koa);
    } catch {
      /* ignore */
    }
  }
  if (fs.existsSync(path.join(absPath, 'app', 'router.js'))) backend = true;
  if (fs.existsSync(path.join(absPath, 'src', 'router'))) frontend = true;
  if (hasSkill && !frontend && !backend) return 'agent';
  if (frontend && backend) return 'fullstack';
  if (frontend) return 'frontend';
  if (backend) return 'backend';
  if (hasSkill || hasPlugins) return 'agent';
  return 'fullstack';
}

function walkTree(absPath, rel, depth, acc) {
  if (acc.nodes >= MAX_NODES || depth > 8) return null;
  const name = rel ? path.basename(rel) : path.basename(absPath);
  const stat = safeStat(absPath);
  if (!stat) return null;

  if (stat.isFile()) {
    if (SKIP_FILES.has(name)) return null;
    acc.nodes += 1;
    acc.files.push({ name, rel, abs: absPath });
    return {
      name,
      type: 'file',
      description: describeFile(name, rel),
      flow_key: '',
      children: [],
    };
  }

  if (!stat.isDirectory()) return null;
  acc.nodes += 1;
  const children = [];
  let entries = [];
  try {
    entries = fs.readdirSync(absPath, { withFileTypes: true });
  } catch {
    return {
      name,
      type: 'dir',
      description: describeDir(name, rel),
      flow_key: '',
      children: [],
    };
  }

  const sorted = entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of sorted) {
    if (entry.isDirectory() && shouldSkipDir(entry.name)) continue;
    if (entry.isFile() && SKIP_FILES.has(entry.name)) continue;
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    const child = walkTree(path.join(absPath, entry.name), childRel, depth + 1, acc);
    if (child) children.push(child);
  }

  return {
    name,
    type: 'dir',
    description: describeDir(name, rel),
    flow_key: '',
    children,
  };
}

function isPageFile(name, rel) {
  if (!PAGE_FILE_RE.test(name)) return false;
  const posix = rel.replace(/\\/g, '/');
  return /\/(views|pages|routes)\//i.test(posix)
    || /(Page|View|Index)\.(vue|jsx|tsx)$/i.test(name);
}

function describeDir(name, rel) {
  const map = {
    src: '源码根目录',
    views: '页面',
    pages: '页面',
    components: '组件',
    router: '路由',
    services: '接口调用',
    store: '状态',
    stores: '状态',
    utils: '工具',
    composables: '组合式逻辑',
    assets: '静态资源',
    styles: '样式',
    config: '配置',
    app: '应用入口 / Egg 应用',
    controller: 'HTTP 控制器',
    service: '业务服务',
    model: '数据模型',
    lib: '内部库',
    plugins: '插件 / Skill',
    database: '数据库脚本',
    docs: '文档',
    deploy: '部署',
    test: '测试',
    frontend: '前端',
    backend: '后端',
    harness: '回合编排',
    pi: 'Pi 灶台',
    extensions: 'Pi 插件',
    memory: '手写本',
    wiki: '百科只读',
    http: '接套壳电话',
    shell: '打给套壳',
    'workspaces-templates': '三角色菜谱模板',
  };
  return map[name] || (rel ? `${rel}` : '');
}

function describeFile(name, rel) {
  if (name === 'package.json') return '依赖与脚本';
  if (name === 'router.js' || name === 'index.js' && /router/.test(rel)) return '路由表';
  if (name === 'main.js' || name === 'main.ts') return '应用入口';
  if (name === 'App.vue') return '根组件';
  if (/Page\.(vue|jsx|tsx)$/i.test(name)) return '页面';
  return '';
}

function pushRoute(routes, seen, fileRel, fullPath, block, extra = {}) {
  if (!fullPath || fullPath === '*' || /pathMatch\(/.test(fullPath) || seen.has(fullPath)) return;
  if (ROUTE_REDIRECT_RE.test(block) && !ROUTE_NAME_RE.test(block) && !ROUTE_COMP_RE.test(block)) return;
  const nameMatch = block.match(ROUTE_NAME_RE);
  const compMatch = block.match(ROUTE_COMP_RE);
  const titleMatch = block.match(ROUTE_TITLE_RE);
  const component = extra.component
    || (compMatch?.[1] && path.basename(compMatch[1], path.extname(compMatch[1])))
    || compMatch?.[2]
    || '';
  if (!nameMatch && !component && !extra.allowBare) return;
  if (fullPath === '/' && !nameMatch && !extra.allowBare) return;
  seen.add(fullPath);
  const name = extra.name || nameMatch?.[1] || slug(fullPath.replace(/^\//, '') || 'home');
  routes.push({
    path: fullPath.startsWith('/') ? fullPath : `/${fullPath}`,
    name,
    component,
    meta: { title: extra.title || titleMatch?.[1] || name, auth: extra.auth ?? /auth\s*:\s*true/.test(block) },
    flow_key: '',
    children: [],
    _from: fileRel,
  });
}

function collectVueRouteObjects(text, parentPath, routes, seen, fileRel) {
  const blocks = topLevelBlocks(findObjectBlocks(text));
  for (const item of blocks) {
    const pathMatch = item.block.match(ROUTE_PATH_RE);
    const routePath = pathMatch?.[1];
    const fullPath = joinRoutePaths(parentPath, routePath);
    const childArrays = extractNamedArrays(item.block, 'children');
    if (fullPath) {
      pushRoute(routes, seen, fileRel, fullPath, item.block, { allowBare: childArrays.length > 0 });
    }
    const nextParent = fullPath || parentPath;
    for (const arr of childArrays) {
      collectVueRouteObjects(arr, nextParent, routes, seen, fileRel);
    }
  }
}

function extractEggRoutes(text, fileRel, seen) {
  const routes = [];
  const re = new RegExp(EGG_ROUTE_RE.source, 'gi');
  let match;
  while ((match = re.exec(text))) {
    const method = match[1].toUpperCase();
    const raw = match[2];
    if (!raw.startsWith('/') || raw === '/') continue;
    const routePath = raw.replace(/\/:[^/]+/g, '/:id');
    if (seen.has(`${method}:${routePath}`)) continue;
    seen.add(`${method}:${routePath}`);
    if (seen.has(routePath)) {
      const existed = routes.find(item => item.path === routePath);
      if (existed && !existed.component.includes(method)) {
        existed.component = `${existed.component}|${method}`;
        existed.meta.title = `${existed.component} ${routePath}`;
      }
      continue;
    }
    seen.add(routePath);
    const name = slug(routePath.replace(/^\//, '').replace(/:/g, ''));
    routes.push({
      path: routePath,
      name,
      component: method,
      meta: { title: `${method} ${routePath}`, auth: !/^\/api\/(health|auth\/(login|register|logout))/.test(routePath) },
      flow_key: '',
      children: [],
      _from: fileRel,
    });
  }
  return routes;
}

function extractRoutesFromText(text, fileRel) {
  const routes = [];
  const seen = new Set();
  const routeArrays = extractNamedArrays(text, 'routes');
  if (routeArrays.length) {
    for (const arr of routeArrays) {
      collectVueRouteObjects(arr, '', routes, seen, fileRel);
    }
  } else {
    collectVueRouteObjects(text, '', routes, seen, fileRel);
  }
  routes.push(...extractEggRoutes(text, fileRel, seen));
  return routes;
}

function pathParseName(name) {
  return String(name || '').replace(/\.[^.]+$/, '');
}

function extractFileBasedRoutes(files, pathSet) {
  const routes = [];
  for (const file of files || []) {
    if (!isPageFile(file.name, file.rel)) continue;
    const posix = file.rel.replace(/\\/g, '/');
    const parts = posix.split('/');
    const viewsIdx = parts.findIndex(part => /^(views|pages|routes)$/i.test(part));
    const segs = (viewsIdx >= 0 ? parts.slice(viewsIdx + 1) : [ file.name ])
      .map(part => pathParseName(part))
      .filter(part => part && !/^index$/i.test(part));
    const routePath = `/${segs.map(part => slug(part)).join('/')}`.replace(/\/+/g, '/') || '/';
    if (pathSet.has(routePath) || routePath === '/') continue;
    pathSet.add(routePath);
    const name = slug(pathParseName(file.name));
    routes.push({
      path: routePath,
      name,
      component: pathParseName(file.name),
      meta: { title: pathParseName(file.name), auth: false },
      flow_key: '',
      children: [],
      _from: file.rel,
    });
  }
  return routes.slice(0, 40);
}

const SKIP_APPJSON = new Set([ 'pages', 'subpackages' ]);

function extractMiniappRoutes(absRoot, files) {
  const appFile = (files || []).find(item => {
    const posix = item.rel.replace(/\\/g, '/');
    return item.name === 'app.json' && !posix.includes('/');
  });
  const abs = appFile?.abs || path.join(absRoot, 'app.json');
  if (!safeStat(abs)) return [];
  try {
    const json = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const list = [];
    for (const page of json.pages || []) {
      list.push(page);
    }
    for (const sub of json.subpackages || []) {
      const root = String(sub.root || '').replace(/\\/g, '/').replace(/\/$/, '');
      for (const page of sub.pages || []) {
        list.push(`${root}/${page}`.replace(/\/+/g, '/'));
      }
    }
    return list.map(rel => {
      const posix = String(rel).replace(/\\/g, '/');
      const leaf = posix.split('/').pop();
      return {
        path: `/${posix}`,
        name: slug(posix.split('/').filter(part => !SKIP_APPJSON.has(part)).slice(-2).join('-') || leaf),
        component: leaf,
        meta: { title: leaf, auth: true },
        flow_key: '',
        children: [],
        _from: 'app.json',
      };
    });
  } catch {
    return [];
  }
}

function collectRouterFiles(files) {
  return files.filter(item => {
    const posix = item.rel.replace(/\\/g, '/');
    if (!/\.(js|ts)$/i.test(item.name)) return false;
    return /router/.test(posix)
      || item.name === 'router.js'
      || /\/app\/router\//.test(posix)
      || /\/src\/http\//.test(posix)
      || /\/src\/index\.ts$/.test(posix);
  }).slice(0, 40);
}

function resolveSourcePath(sourcePath) {
  const input = String(sourcePath || '').trim();
  if (!input) {
    const err = new Error('缺少 source_path');
    err.status = 400;
    throw err;
  }
  const candidates = [];
  const normalized = input.replace(/\\/g, '/');
  candidates.push(path.resolve(input));
  candidates.push(normalized);

  const hostRoot = process.env.HOST_PROJECTS_ROOT || '/host-projects';
  const afterProjects = normalized.match(/\/projects\/(.+)$/i);
  if (afterProjects) {
    candidates.push(path.posix.join(hostRoot, afterProjects[1]));
  }
  const drive = normalized.match(/^([A-Za-z]):\/(.*)$/);
  if (drive) {
    candidates.push(`/mnt/${drive[1].toLowerCase()}/${drive[2]}`);
    candidates.push(`/host-drive/${drive[2]}`);
  }

  const seen = new Set();
  for (const candidate of candidates) {
    const abs = path.resolve(candidate);
    if (seen.has(abs)) continue;
    seen.add(abs);
    const stat = safeStat(abs);
    if (stat && stat.isDirectory()) return abs;
  }

  const err = new Error(
    `项目路径不存在或容器内不可见：${sourcePath}。Docker 下请把宿主机项目根挂到 HOST_PROJECTS_ROOT（默认 /host-projects）`,
  );
  err.status = 400;
  throw err;
}

function scanProject(sourcePath) {
  const resolved = resolveSourcePath(sourcePath);
  const stat = safeStat(resolved);

  const acc = { nodes: 0, files: [] };
  const root = walkTree(resolved, '', 0, acc);
  const directory_tree = root ? (root.children || []) : [];

  const routes = [];
  const routerFiles = collectRouterFiles(acc.files);
  let readCount = 0;
  for (const file of routerFiles) {
    if (readCount >= MAX_FILE_READ) break;
    try {
      const size = safeStat(file.abs)?.size || 0;
      if (size > MAX_FILE_BYTES) continue;
      const text = fs.readFileSync(file.abs, 'utf8');
      readCount += 1;
      if (!ROUTER_HINT_RE.test(text) && !/path\s*:/.test(text) && !/router\.(get|post)/.test(text)) {
        continue;
      }
      routes.push(...extractRoutesFromText(text, file.rel));
    } catch {
      /* skip unreadable */
    }
  }

  routes.push(...extractMiniappRoutes(resolved, acc.files));

  const uniqueRoutes = [];
  const pathSet = new Set();
  for (const route of routes) {
    if (pathSet.has(route.path)) continue;
    pathSet.add(route.path);
    uniqueRoutes.push(route);
  }
  if (uniqueRoutes.length < 2) {
    uniqueRoutes.push(...extractFileBasedRoutes(acc.files, pathSet));
  }

  const { scanAgentAssets } = require('./agentScan');
  const agent = scanAgentAssets(resolved, acc.files);
  for (const route of agent.http_routes || []) {
    if (pathSet.has(route.path)) continue;
    pathSet.add(route.path);
    uniqueRoutes.push(route);
  }

  return {
    source_path: resolved,
    guessed_type: guessType(resolved),
    directory_tree,
    routes: uniqueRoutes,
    file_count: acc.files.length,
    node_count: acc.nodes,
    router_files: routerFiles.map(item => item.rel),
    agent,
  };
}

module.exports = {
  scanProject,
  slug,
  isPageFile,
  extractRoutesFromText,
  extractFileBasedRoutes,
};

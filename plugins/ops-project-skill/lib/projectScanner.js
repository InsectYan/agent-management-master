'use strict';

const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.output',
  '.nuxt', '.next', '.turbo', '.cache', '.idea', '.vscode',
  '__pycache__', 'vendor', 'tmp', 'temp', 'logs',
]);

const SKIP_FILES = new Set([ '.DS_Store', 'Thumbs.db' ]);

const PAGE_FILE_RE = /\.(vue|jsx|tsx|js|ts)$/i;
const ROUTER_HINT_RE = /(createRouter|createWebHistory|routes\s*[:=])/;
const ROUTE_PATH_RE = /path\s*:\s*['"`]([^'"`]+)['"`]/;
const ROUTE_NAME_RE = /name\s*:\s*['"`]([^'"`]+)['"`]/;
const ROUTE_COMP_RE = /component\s*:\s*(?:\(\)\s*=>\s*import\(['"`]([^'"`]+)['"`]\)|([A-Za-z0-9_]+))/;
const ROUTE_TITLE_RE = /title\s*:\s*['"`]([^'"`]+)['"`]/;
const ROUTE_REDIRECT_RE = /redirect\s*:/;

function extractObjectBlocks(text) {
  const blocks = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '{') continue;
    let depth = 0;
    for (let j = i; j < text.length; j += 1) {
      if (text[j] === '{') depth += 1;
      else if (text[j] === '}') {
        depth -= 1;
        if (depth === 0) {
          const block = text.slice(i, j + 1);
          if (
            ROUTE_PATH_RE.test(block)
            && block.length < 800
            && !/children\s*:/.test(block)
          ) {
            blocks.push(block);
          }
          break;
        }
      }
    }
  }
  return blocks;
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
  return SKIP_DIRS.has(name) || name.startsWith('.');
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
  const pkg = path.join(absPath, 'package.json');
  if (fs.existsSync(pkg)) {
    try {
      const json = JSON.parse(fs.readFileSync(pkg, 'utf8'));
      const deps = { ...json.dependencies, ...json.devDependencies };
      const scripts = JSON.stringify(json.scripts || {});
      if (deps.vue || deps['vue-router'] || deps.vite) return 'frontend';
      if (deps.egg || deps['egg-core'] || /egg/.test(scripts)) return 'backend';
    } catch {
      /* ignore */
    }
  }
  if (fs.existsSync(path.join(absPath, 'app', 'router.js'))) return 'backend';
  if (fs.existsSync(path.join(absPath, 'src', 'router'))) return 'frontend';
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

function extractRoutesFromText(text, fileRel) {
  const routes = [];
  const seen = new Set();
  for (const block of extractObjectBlocks(text)) {
    if (ROUTE_REDIRECT_RE.test(block) && !ROUTE_NAME_RE.test(block)) continue;
    const pathMatch = block.match(ROUTE_PATH_RE);
    const routePath = pathMatch?.[1];
    if (!routePath || routePath === '*' || seen.has(routePath)) continue;
    const nameMatch = block.match(ROUTE_NAME_RE);
    const compMatch = block.match(ROUTE_COMP_RE);
    const titleMatch = block.match(ROUTE_TITLE_RE);
    const component = (compMatch?.[1] && path.basename(compMatch[1], path.extname(compMatch[1])))
      || compMatch?.[2]
      || '';
    if (!nameMatch && !component) continue;
    if (routePath === '/' && !nameMatch) continue;
    seen.add(routePath);
    const name = nameMatch?.[1] || slug(routePath.replace(/^\//, '') || 'home');
    routes.push({
      path: routePath.startsWith('/') ? routePath : `/${routePath}`,
      name,
      component,
      meta: { title: titleMatch?.[1] || name, auth: /auth\s*:\s*true/.test(block) },
      flow_key: '',
      children: [],
      _from: fileRel,
    });
  }
  return routes;
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
    return /router/.test(posix) || item.name === 'router.js';
  }).slice(0, 12);
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
      if (!ROUTER_HINT_RE.test(text) && !/path\s*:/.test(text)) continue;
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

  return {
    source_path: resolved,
    guessed_type: guessType(resolved),
    directory_tree,
    routes: uniqueRoutes,
    file_count: acc.files.length,
    node_count: acc.nodes,
    router_files: routerFiles.map(item => item.rel),
  };
}

module.exports = {
  scanProject,
  slug,
  isPageFile,
};

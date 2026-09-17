'use strict';

const fs = require('fs');
const path = require('path');

const HTTP_PREFIX_BY_FILE = [
  { re: /http[/\\]ops[/\\]cloudData/, prefix: '/v1/agent/internal/ops' },
  { re: /http[/\\]internal\.ts$/, prefix: '/v1/agent/internal' },
  { re: /http[/\\]chatShell/, prefix: '/v1/agent/chat' },
  { re: /http[/\\]llmProfiles/, prefix: '/v1/agent/llm' },
  { re: /http[/\\]ledger/, prefix: '/v1/agent/chat' },
];

const RISK_SKILLS = {
  'training-safety-pain': 'risk',
  'medical-boundary': 'risk',
  'memory-persist': 'warning',
  'wiki-knowledge': 'warning',
  'record-archival': 'warning',
};

function posix(rel) {
  return String(rel || '').replace(/\\/g, '/');
}

function filePrefix(rel) {
  const raw = posix(rel);
  for (const item of HTTP_PREFIX_BY_FILE) {
    if (item.re.test(raw)) return item.prefix;
  }
  return '';
}

function joinPath(prefix, leaf) {
  let p = String(leaf || '');
  if (!p.startsWith('/')) p = `/${p}`;
  if (!prefix || p.startsWith('/v1') || p.startsWith(prefix)) return p.replace(/\/+/g, '/');
  return `${prefix}${p}`.replace(/\/+/g, '/');
}

function extractExpressRoutes(text, fileRel) {
  const routes = [];
  const seen = new Set();
  const prefix = filePrefix(fileRel);
  const re = /(?:router|app)\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/gi;
  let match;
  while ((match = re.exec(text))) {
    const method = match[1].toUpperCase();
    const full = joinPath(prefix, match[2]);
    if (!full || full === '/' || seen.has(`${method}:${full}`)) continue;
    seen.add(`${method}:${full}`);
    routes.push({
      path: full,
      name: slugPath(full),
      component: method,
      meta: {
        title: `${method} ${full}`,
        auth: !/^\/(health|ready)$/.test(full),
      },
      flow_key: '',
      children: [],
      _from: fileRel,
    });
  }
  return routes;
}

function slugPath(full) {
  return String(full || '')
    .replace(/^\//, '')
    .replace(/\/:[^/]+/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'http';
}

function parseFrontmatter(text) {
  const match = String(text || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const out = {};
  for (const line of match[1].split(/\r?\n/)) {
    const hit = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (hit) out[hit[1]] = hit[2].replace(/^['"]|['"]$/g, '').trim();
  }
  return out;
}

function parseBacktickTable(text) {
  const map = {};
  const re = /^\|\s*`([a-z][a-z0-9_]*)`\s*\|\s*([^|\n]+)\|/gim;
  let match;
  while ((match = re.exec(text))) {
    map[match[1]] = match[2].trim();
  }
  return map;
}

function parseMarkers(text) {
  const set = new Set();
  const re = /\[([A-Z][A-Z0-9_]{3,})\]/g;
  let match;
  while ((match = re.exec(text))) set.add(match[1]);
  return [ ...set ];
}

function roleFromRel(rel) {
  const hit = posix(rel).match(/workspaces-templates\/(coach|member|manager)(?:\/|$)/);
  return hit ? hit[1] : '';
}

function looksLikeAgent(absPath) {
  return fs.existsSync(path.join(absPath, 'workspaces-templates'))
    || fs.existsSync(path.join(absPath, 'src', 'harness'))
    || fs.existsSync(path.join(absPath, 'src', 'pi', 'runTurn.ts'))
    || fs.existsSync(path.join(absPath, 'src', 'pi', 'runTurn.js'));
}

function scanAgentAssets(resolved, files) {
  const skills = [];
  const message_types = {};
  const markers = new Set();
  const tools = {};
  const roles = new Set();
  const http_routes = [];

  for (const file of files || []) {
    const rel = posix(file.rel);
    let text = '';
    const want = file.name === 'SKILL.md'
      || file.name === 'AGENTS.md'
      || /\/src\/http\//.test(`/${rel}`)
      || /\/src\/index\.ts$/.test(`/${rel}`);
    if (!want) continue;
    try {
      text = fs.readFileSync(file.abs, 'utf8');
    } catch {
      continue;
    }

    if (/\/src\/http\//.test(`/${rel}`) || /\/src\/index\.ts$/.test(`/${rel}`)) {
      http_routes.push(...extractExpressRoutes(text, rel));
    }

    const role = roleFromRel(rel);
    if (role) roles.add(role);

    if (file.name === 'SKILL.md') {
      const meta = parseFrontmatter(text);
      const name = meta.name || path.basename(path.dirname(file.abs));
      const level = RISK_SKILLS[name] || '';
      skills.push({
        name,
        role: role || 'shared',
        description: meta.description || '',
        rel,
        level,
      });
      parseMarkers(text).forEach(item => markers.add(item));
    }

    if (file.name === 'AGENTS.md') {
      const mtBlock = text.match(/\|\s*message_type\s*\|\s*用途[\s\S]*?(?=\n## |\n\*\*删除)/i);
      Object.assign(message_types, parseBacktickTable(mtBlock ? mtBlock[0] : ''));
      const toolBlock = text.match(/\|\s*工具\s*\|\s*用途[\s\S]*?(?=\n## )/i);
      Object.assign(tools, parseBacktickTable(toolBlock ? toolBlock[0] : ''));
      parseMarkers(text).forEach(item => markers.add(item));
    }
  }

  const uniqueHttp = [];
  const seen = new Set();
  for (const route of http_routes) {
    const key = `${route.component}:${route.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueHttp.push(route);
  }

  return {
    is_agent: looksLikeAgent(resolved),
    roles: [ ...roles ],
    skills,
    message_types,
    markers: [ ...markers ].sort(),
    tools,
    http_routes: uniqueHttp,
  };
}

module.exports = {
  looksLikeAgent,
  scanAgentAssets,
  extractExpressRoutes,
  RISK_SKILLS,
};

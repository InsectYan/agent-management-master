/**
 * @file search.js
 * @description 在单个项目目录内按文件名和正文检索。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { projectRoot } = require('./read');

function walk(dir, out, depth) {
  if (depth > 6 || !fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.')) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(full, out, depth + 1);
      continue;
    }
    if (ent.isFile()) out.push(full);
  }
}

/**
 * @param {string} knowledgeRoot
 * @param {string} projectId
 * @param {string} query
 * @param {number} [limit=5]
 */
function search(knowledgeRoot, projectId, query, limit = 5) {
  const base = projectRoot(knowledgeRoot, projectId);
  const q = String(query || '').trim().toLowerCase();
  const files = [];
  walk(base, files, 0);
  const hits = [];
  for (const file of files) {
    const rel = path.relative(base, file).replace(/\\/g, '/');
    let text = '';
    try {
      text = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    const hay = `${rel}\n${text}`.toLowerCase();
    if (q && !hay.includes(q)) continue;
    const idx = q ? text.toLowerCase().indexOf(q) : 0;
    const start = Math.max(0, idx);
    hits.push({
      page: rel,
      snippet: text.slice(start, start + 240),
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

module.exports = { search };

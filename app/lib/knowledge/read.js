/**
 * @file read.js
 * @description 按项目读取知识页。拒绝跳出项目目录。
 */

'use strict';

const fs = require('fs');
const path = require('path');

function sanitize(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function projectRoot(knowledgeRoot, projectId) {
  const id = sanitize(projectId);
  if (!id) {
    const err = new Error('知识库缺少 projectId');
    err.code = 'KNOWLEDGE_PROJECT';
    throw err;
  }
  return path.resolve(knowledgeRoot, id);
}

/**
 * @param {string} knowledgeRoot
 * @param {string} projectId
 * @param {string} page 相对项目根的路径
 * @returns {string}
 */
function readPage(knowledgeRoot, projectId, page) {
  const base = projectRoot(knowledgeRoot, projectId);
  const raw = String(page || '');
  if (path.isAbsolute(raw) || /^[a-zA-Z]:/.test(raw)) {
    const err = new Error('知识库路径越界');
    err.code = 'KNOWLEDGE_ESCAPE';
    throw err;
  }
  const rel = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rel || rel.split('/').some(part => part === '..' || part === '.')) {
    const err = new Error('知识库路径越界');
    err.code = 'KNOWLEDGE_ESCAPE';
    throw err;
  }
  const target = path.resolve(base, rel);
  if (target !== base && !target.startsWith(base + path.sep)) {
    const err = new Error('知识库路径越界');
    err.code = 'KNOWLEDGE_ESCAPE';
    throw err;
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    const err = new Error('知识页不存在');
    err.code = 'KNOWLEDGE_NOT_FOUND';
    throw err;
  }
  return fs.readFileSync(target, 'utf-8');
}

module.exports = {
  readPage,
  projectRoot,
  sanitize,
};

/**
 * @file docParser.js
 * @description 从 Markdown / 纯文本文档提取结构化信息，供 Loop 上下文使用
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { truncateField, FIELD_MAX_LEN } = require('./testTypeQuota');

/**
 * 提取 Markdown 二级标题段落
 * @param {string} md
 * @returns {{ heading: string, body: string }[]}
 */
function extractSections(md) {
  const sections = [];
  const parts = md.split(/\n(?=##\s+)/);
  for (const part of parts) {
    const m = part.match(/^##\s*(.+?)\s*\n([\s\S]*)/);
    if (m) {
      sections.push({ heading: m[1].trim(), body: m[2].trim() });
    }
  }
  return sections;
}

/**
 * 提取 API 端点行（简易启发式）
 * @param {string} text
 * @returns {string[]}
 */
function extractApiEndpoints(text) {
  const endpoints = [];
  const patterns = [
    /`(GET|POST|PUT|PATCH|DELETE)\s+(\/[\w\-/{}\.:]+)`/gi,
    /(GET|POST|PUT|PATCH|DELETE)\s+(\/[\w\-/{}\.:]+)/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      endpoints.push(`${m[1].toUpperCase()} ${m[2]}`);
    }
  }
  return [ ...new Set(endpoints) ];
}

/**
 * 解析文档为结构化摘要
 * @param {string} content
 * @param {Object} [options]
 */
function parseDocument(content, options = {}) {
  const text = String(content || '').trim();
  const sections = extractSections(text);
  const endpoints = extractApiEndpoints(text);

  const requirements = [];
  for (const sec of sections) {
    if (/需求|功能|接口|API|用例|场景/i.test(sec.heading)) {
      requirements.push({ section: sec.heading, excerpt: sec.body.slice(0, 500) });
    }
  }

  return {
    title: options.title || guessTitle(text, sections),
    charCount: text.length,
    sectionCount: sections.length,
    sections: sections.map(s => ({ heading: s.heading, length: s.body.length })),
    endpoints,
    requirements,
    preview: text.slice(0, options.previewLen || 800),
  };
}

/**
 * @param {string} text
 * @param {{ heading: string }[]} sections
 */
function guessTitle(text, sections) {
  const h1 = text.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim();
  if (sections[0]) return sections[0].heading;
  return text.split('\n')[0]?.slice(0, 80) || '未命名文档';
}

/**
 * 从 Skill fixtures 或绝对路径读取文档
 * @param {string} skillDir
 * @param {string} docPath
 */
function loadDocumentFile(skillDir, docPath) {
  const resolved = path.isAbsolute(docPath)
    ? docPath
    : path.join(skillDir, docPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`文档不存在: ${docPath}`);
  }
  const content = fs.readFileSync(resolved, 'utf8');
  return { content, path: resolved };
}

/**
 * 规范化 LLM 输出的测试用例数组（单字段最长 300 字）
 * @param {unknown} raw
 */
function normalizeTestCases(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((tc, i) => ({
    id: truncateField(tc.id || `TC-${i + 1}`, 64),
    title: truncateField(tc.title || tc.name || `用例 ${i + 1}`),
    type: truncateField(tc.type || 'functional', 32),
    priority: normalizePriority(tc.priority),
    preconditions: truncateField(tc.preconditions || tc.precondition || ''),
    steps: Array.isArray(tc.steps)
      ? tc.steps.map(s => truncateField(typeof s === 'string' ? s : (s.action || s.step || JSON.stringify(s))))
      : [ truncateField(String(tc.steps || '')) ].filter(Boolean),
    expected: truncateField(tc.expected || tc.expected_result || ''),
    tags: Array.isArray(tc.tags) ? tc.tags.map(t => truncateField(t, 64)).filter(Boolean) : [],
  }));
}

/**
 * @param {unknown} priority
 */
function normalizePriority(priority) {
  const raw = String(priority || 'medium').toLowerCase();
  const map = {
    high: 'high', h: 'high', 高: 'high',
    medium: 'medium', m: 'medium', 中: 'medium',
    low: 'low', l: 'low', 低: 'low',
  };
  return map[raw] || (raw.includes('高') ? 'high' : raw.includes('低') ? 'low' : 'medium');
}

module.exports = {
  extractSections,
  extractApiEndpoints,
  parseDocument,
  loadDocumentFile,
  normalizeTestCases,
  normalizePriority,
  truncateField,
  FIELD_MAX_LEN,
  guessTitle,
};

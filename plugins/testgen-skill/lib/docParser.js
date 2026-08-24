/**
 * @file docParser.js
 * @description 从 Markdown / 纯文本文档提取结构化信息，供 Loop 上下文使用
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { truncateField, FIELD_MAX_LEN } = require('./testTypeQuota');

const HTTP_METHODS = 'GET|POST|PUT|PATCH|DELETE';

/**
 * 提取 Markdown 二级标题段落
 * @param {string} md
 * @returns {{ heading: string, body: string }[]}
 */
function extractSections(md) {
  const sections = [];
  const parts = String(md || '').split(/\n(?=##\s+)/);
  for (const part of parts) {
    const m = part.match(/^##\s*(.+?)\s*\n([\s\S]*)/);
    if (m) {
      sections.push({ heading: m[1].trim(), body: m[2].trim() });
    }
  }
  return sections;
}

/**
 * 规范化路径：去掉 query、尾斜杠；绝对 URL 取 pathname
 * @param {string} raw
 * @returns {string}
 */
function normalizeApiPath(raw) {
  let p = String(raw || '').trim();
  if (!p) return '';
  try {
    if (/^https?:\/\//i.test(p)) {
      p = new URL(p).pathname || p;
    }
  } catch {
    // keep raw
  }
  p = p.replace(/\?.*$/, '').replace(/\/+$/, '');
  if (!p.startsWith('/')) return '';
  return p || '/';
}

/**
 * Apifox 导出风格：## 标题 + **接口URL** > /path + **请求方式** > METHOD
 * @param {string} text
 * @returns {{ method: string, path: string, title: string, key: string }[]}
 */
function extractApifoxEndpoints(text) {
  const sections = extractSections(text);
  const results = [];
  const seen = new Set();

  for (const sec of sections) {
    const body = sec.body || '';
    const pathMatch = body.match(/\*\*接口URL\*\*[\s\S]*?^>\s*(\S+)\s*$/im);
    if (!pathMatch) continue;

    const apiPath = normalizeApiPath(pathMatch[1]);
    if (!apiPath) continue;

    const methodMatch = body.match(/\*\*请求方式\*\*[\s\S]*?^>\s*(GET|POST|PUT|PATCH|DELETE)\s*$/im);
    const method = (methodMatch?.[1] || 'POST').toUpperCase();
    const key = `${method} ${apiPath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      method,
      path: apiPath,
      title: sec.heading,
      key,
    });
  }
  return results;
}

/**
 * 同行 METHOD /path（含反引号）
 * @param {string} text
 * @returns {{ method: string, path: string, title: string, key: string }[]}
 */
function extractInlineEndpoints(text) {
  const results = [];
  const seen = new Set();
  const patterns = [
    new RegExp(`\`(${HTTP_METHODS})\\s+(\\/[\\w\\-/{}.:]+)\``, 'gi'),
    new RegExp(`\\b(${HTTP_METHODS})\\s+(\\/[\\w\\-/{}.:]+)`, 'gi'),
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const method = m[1].toUpperCase();
      const apiPath = normalizeApiPath(m[2]);
      if (!apiPath) continue;
      const key = `${method} ${apiPath}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ method, path: apiPath, title: '', key });
    }
  }
  return results;
}

/**
 * 提取 API 端点详情（Apifox + 同行写法）
 * @param {string} text
 * @returns {{ method: string, path: string, title: string, key: string }[]}
 */
function extractApiEndpointDetails(text) {
  const byKey = new Map();
  for (const ep of [ ...extractApifoxEndpoints(text), ...extractInlineEndpoints(text) ]) {
    if (!byKey.has(ep.key)) byKey.set(ep.key, ep);
  }
  return [ ...byKey.values() ];
}

/**
 * 提取 API 端点行（简易启发式）
 * @param {string} text
 * @returns {string[]}
 */
function extractApiEndpoints(text) {
  return extractApiEndpointDetails(text).map(ep => ep.key);
}

/**
 * 组装供估算 / Loop 使用的接口清单文本
 * @param {{ method: string, path: string, title?: string }[]} details
 * @param {number} [maxItems]
 */
function formatEndpointCatalog(details, maxItems = 500) {
  const list = Array.isArray(details) ? details.slice(0, maxItems) : [];
  if (!list.length) return '';
  return list
    .map((ep, i) => {
      const title = ep.title ? ` — ${ep.title}` : '';
      return `${i + 1}. ${ep.method} ${ep.path}${title}`;
    })
    .join('\n');
}

/**
 * 按接口块拼装正文，优先保证清单完整，正文按预算截取
 * @param {string} fullText
 * @param {object} meta parseDocument 结果
 * @param {number} maxLen
 */
function buildDocumentContextForLlm(fullText, meta, maxLen = 8000) {
  const limit = Math.max(2000, Number(maxLen) || 8000);
  const details = meta.endpointDetails || extractApiEndpointDetails(fullText);
  const catalog = formatEndpointCatalog(details);
  const headerParts = [
    `## 接口清单（共 ${details.length} 个，已全量列出）`,
    catalog || '（未识别到标准接口行）',
    '',
    '## 文档正文（按接口块截取，可能不含全文）',
    '',
  ];
  const header = headerParts.join('\n');
  const budget = Math.max(400, limit - header.length);

  const sections = meta._sections || extractSections(fullText);
  const titleSet = new Set(details.map(d => d.title).filter(Boolean));
  let body = '';

  if (titleSet.size && sections.length) {
    for (const sec of sections) {
      if (!titleSet.has(sec.heading)) continue;
      const chunk = `## ${sec.heading}\n${sec.body}\n\n`;
      if (body.length + chunk.length > budget) {
        const remain = budget - body.length;
        if (remain > 120) {
          body += chunk.slice(0, remain) + '\n…(截断)\n';
        }
        break;
      }
      body += chunk;
    }
  }

  if (!body.trim()) {
    body = String(fullText || '').slice(0, budget);
  }

  return (header + body).slice(0, limit);
}

/**
 * 解析文档为结构化摘要
 * @param {string} content
 * @param {Object} [options]
 */
function parseDocument(content, options = {}) {
  const text = String(content || '').trim();
  const sections = extractSections(text);
  const endpointDetails = extractApiEndpointDetails(text);
  const endpoints = endpointDetails.map(ep => ep.key);

  const requirements = [];
  for (const sec of sections) {
    if (/需求|功能|接口|API|用例|场景/i.test(sec.heading) || endpointDetails.some(e => e.title === sec.heading)) {
      requirements.push({ section: sec.heading, excerpt: sec.body.slice(0, 500) });
    }
  }

  return {
    title: options.title || guessTitle(text, sections),
    charCount: text.length,
    sectionCount: sections.length,
    sections: sections.map(s => ({ heading: s.heading, length: s.body.length })),
    endpoints,
    endpointDetails,
    endpointCount: endpointDetails.length,
    requirements,
    preview: text.slice(0, options.previewLen || 800),
    /** 内部：供 buildDocumentContextForLlm 复用，避免二次 split */
    _sections: sections,
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
  extractApiEndpointDetails,
  extractApifoxEndpoints,
  formatEndpointCatalog,
  buildDocumentContextForLlm,
  normalizeApiPath,
  parseDocument,
  loadDocumentFile,
  normalizeTestCases,
  normalizePriority,
  truncateField,
  FIELD_MAX_LEN,
  guessTitle,
};

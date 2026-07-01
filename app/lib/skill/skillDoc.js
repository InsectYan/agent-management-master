/**
 * @file skillDoc.js
 * @description Skill 文档加载与解析：读取 plugins/{skill}/SKILL.md，供执行时按文档要求处理。
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * @typedef {Object} SkillDoc
 * @property {string} path - SKILL.md 绝对路径
 * @property {string} content - 全文
 * @property {string|null} purpose - 「用途」段落摘要
 * @property {SkillAction[]} actions - 可执行动作列表
 */

/**
 * @typedef {Object} SkillAction
 * @property {string} id - 动作标识，与请求 params.action 对应
 * @property {string} description - 说明
 * @property {string[]} requiredParams - 必填参数名
 */

/**
 * 读取 Skill 目录下的 SKILL.md
 * @param {string} skillDir - Skill 插件目录
 * @returns {SkillDoc|null} 无文件时返回 null
 */
function loadSkillDoc(skillDir) {
  const docPath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(docPath)) {
    return null;
  }

  const content = fs.readFileSync(docPath, 'utf8');
  return {
    path: docPath,
    content,
    purpose: extractSection(content, '用途') || extractSection(content, 'Purpose'),
    actions: parseActions(content),
  };
}

/**
 * 提取 Markdown 二级标题下的正文（到下一个 ## 为止）
 * @param {string} md
 * @param {string} heading - 标题文字（不含 ##）
 * @returns {string|null}
 */
function extractSection(md, heading) {
  const re = new RegExp(`##\\s*${escapeRegExp(heading)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i');
  const m = md.match(re);
  return m ? m[1].trim() : null;
}

/**
 * 解析「执行动作」表格或列表
 * 支持格式：
 * | action | 说明 | 必填参数 |
 * | query | ... | city |
 * @param {string} md
 * @returns {SkillAction[]}
 */
function parseActions(md) {
  const section = extractSection(md, '执行动作') || extractSection(md, 'Actions');
  if (!section) return [];

  const actions = [];
  const lines = section.split('\n').filter(l => l.trim().startsWith('|'));
  for (const line of lines) {
    if (/^\|\s*action\s*\|/i.test(line)) continue;
    if (/^\|\s*-+\s*\|/.test(line)) continue;
    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    const id = cells[0];
    if (!id || id === 'action') continue;
    actions.push({
      id,
      description: cells[1] || '',
      requiredParams: (cells[2] || '').split(/[,，]/).map(s => s.trim()).filter(Boolean),
    });
  }
  return actions;
}

/**
 * 判断请求是否满足 SKILL 必填参数（含常见别名）
 * @param {Object} params
 * @param {string} key
 */
function isParamPresent(params, key) {
  const aliases = {
    doc_content: [ 'doc_content', 'document_content', 'content' ],
    doc_id: [ 'doc_id', 'document_id' ],
    doc_title: [ 'doc_title', 'document_title', 'title' ],
  };
  const keys = aliases[key] || [ key ];
  return keys.some(k => {
    const v = params[k];
    return v !== undefined && v !== null && v !== '';
  });
}

/**
 * @param {SkillDoc|null} skillDoc
 * @param {Object} params - 请求参数
 * @param {Object} [defaults] - 默认动作映射，如 { GET: 'query' }
 * @returns {{ action: string, actionDef: SkillAction|null, errors: string[] }}
 */
function resolveAction(skillDoc, params, defaults = {}) {
  const errors = [];
  let action = (params.action || '').trim();

  if (!action && params._httpMethod && defaults[params._httpMethod]) {
    action = defaults[params._httpMethod];
  }

  if (!action && skillDoc?.actions?.length === 1) {
    action = skillDoc.actions[0].id;
  }

  if (!action) {
    errors.push('缺少 action；请传 params.action 或查阅 SKILL.md「执行动作」');
    return { action: '', actionDef: null, errors };
  }

  const actionDef = skillDoc?.actions?.find(a => a.id === action) || null;

  if (actionDef?.requiredParams?.length) {
    for (const key of actionDef.requiredParams) {
      if (isParamPresent(params, key)) continue;
      errors.push(`动作「${action}」缺少必填参数: ${key}`);
    }
  }

  return { action, actionDef, errors };
}

/**
 * @param {string} s
 */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  loadSkillDoc,
  extractSection,
  parseActions,
  resolveAction,
};

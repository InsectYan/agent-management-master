/**
 * @file testTypeQuota.js
 * @description 前端测试类型 → Agent 生成配额与 phase 映射
 */

'use strict';

const FIELD_MAX_LEN = 300;

/** @type {Record<string, { agentType: string, phase: string, defaultCount: number }>} */
const TYPE_DEFS = {
  '功能测试': { agentType: 'functional', phase: 'functional', defaultCount: 5 },
  '边界值测试': { agentType: 'edge', phase: 'edge', defaultCount: 3 },
  '安全测试': { agentType: 'security', phase: 'edge', defaultCount: 3 },
  'GDPR 合规测试': { agentType: 'compliance', phase: 'review', defaultCount: 2 },
};

/**
 * @param {string} text
 * @param {number} [max]
 */
function truncateField(text, max = FIELD_MAX_LEN) {
  const value = String(text ?? '').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

/**
 * @param {string[]} testTypes
 * @param {Record<string, number>} [typeCounts]
 */
function buildQuotaPlan(testTypes = [], typeCounts = {}) {
  const list = Array.isArray(testTypes) ? testTypes : [];
  return list.map(label => {
    const def = TYPE_DEFS[label] || { agentType: 'functional', phase: 'functional', defaultCount: 3 };
    const raw = typeCounts[label] ?? typeCounts[def.agentType] ?? def.defaultCount;
    const count = Math.min(Math.max(Number(raw) || def.defaultCount, 1), 50);
    return { label, count, ...def };
  });
}

/**
 * @param {ReturnType<typeof buildQuotaPlan>} plan
 */
function formatQuotaPrompt(plan) {
  if (!plan.length) return '';
  const lines = plan.map(p =>
    `- ${p.label}：目标 ${p.count} 条（type="${p.agentType}"，建议 phase=${p.phase}）`,
  );
  return [
    '## 各测试类型目标条数（必须尽量满足，单条用例各字段合计不超过 300 字）',
    ...lines,
  ].join('\n');
}

module.exports = {
  TYPE_DEFS,
  FIELD_MAX_LEN,
  truncateField,
  buildQuotaPlan,
  formatQuotaPrompt,
};

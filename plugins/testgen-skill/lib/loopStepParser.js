/**
 * @file loopStepParser.js
 * @description 规范 testgen Loop 每步 LLM 输出：JSON 解析、testCases salvage、phase 对齐。
 */

'use strict';

const { extractJsonObject } = require('../../../app/lib/llm/chat');
const { normalizeTestCases } = require('./docParser');

const STEP_PHASES = [ 'analyze', 'functional', 'edge', 'review' ];

/**
 * @param {string} text
 * @returns {Record<string, unknown>[]}
 */
function salvageTestCaseObjects(text) {
  const raw = String(text || '');
  const cases = [];
  const seen = new Set();

  const objectPattern = /\{[^{}]*"id"\s*:\s*"([^"]+)"[^{}]*\}/g;
  let match;
  while ((match = objectPattern.exec(raw)) !== null) {
    const chunk = match[0];
    try {
      const obj = JSON.parse(chunk);
      if (!obj.id || seen.has(obj.id)) continue;
      seen.add(obj.id);
      cases.push(obj);
    } catch {
      const titleMatch = chunk.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (titleMatch) {
        const id = match[1];
        if (!seen.has(id)) {
          seen.add(id);
          cases.push({ id, title: titleMatch[1].replace(/\\"/g, '"') });
        }
      }
    }
  }

  return cases;
}

/**
 * @param {string} text
 * @returns {unknown[]}
 */
function salvageTestCasesArray(text) {
  const raw = String(text || '');
  const marker = raw.search(/"testCases"\s*:\s*\[/i);
  if (marker >= 0) {
    const fromArray = salvageTestCaseObjects(raw.slice(marker));
    if (fromArray.length) return fromArray;
  }
  return salvageTestCaseObjects(raw);
}

/**
 * @param {string} rawText
 * @param {Object} ctx
 * @param {number} ctx.step - 0-based
 * @param {number} ctx.maxSteps
 * @param {string} ctx.expectedPhase
 * @param {Object} [ctx.state]
 * @param {Object} [ctx.input]
 */
function parseTestgenStepOutput(rawText, ctx = {}) {
  const text = String(rawText || '').trim();
  const step = Number(ctx.step) || 0;
  const maxSteps = Number(ctx.maxSteps) || STEP_PHASES.length;
  const expectedPhase = ctx.expectedPhase || STEP_PHASES[step] || 'analyze';

  let parsed = extractJsonObject(text);
  const parseOk = Boolean(parsed);
  if (!parsed) parsed = {};

  if (parsed.test_cases && !parsed.testCases) {
    parsed.testCases = parsed.test_cases;
  }

  const salvaged = salvageTestCasesArray(text);
  if (salvaged.length && (!Array.isArray(parsed.testCases) || !parsed.testCases.length)) {
    parsed.testCases = salvaged;
  }

  parsed.phase = expectedPhase;

  if (!parsed.note && text) {
    parsed.note = parseOk
      ? String(parsed.note || parsed.summary || '').slice(0, 400)
      : text.slice(0, 400);
  }
  if (!parsed.summary && parsed.note) {
    parsed.summary = String(parsed.note).slice(0, 600);
  }

  const cases = normalizeTestCases(parsed.testCases);
  parsed.testCases = cases;

  const isLastStep = step >= maxSteps - 1;
  const mustHaveCases = expectedPhase === 'functional' || expectedPhase === 'edge';

  if (mustHaveCases && !cases.length) {
    parsed.done = false;
    parsed.continue = true;
  }

  if (expectedPhase === 'analyze') {
    parsed.done = false;
    if (parsed.continue === undefined) parsed.continue = true;
  }

  if (!isLastStep && parsed.done && !cases.length) {
    parsed.done = false;
    parsed.continue = true;
  }

  if (isLastStep && expectedPhase === 'review' && !cases.length && (ctx.state?.testCases || []).length) {
    parsed.done = true;
    parsed.continue = false;
  }

  if (!parseOk && !cases.length) {
    parsed._parse_warning = 'LLM 输出非合法 JSON，未提取到 testCases';
  } else if (!parseOk && cases.length) {
    parsed._parse_warning = 'JSON 不完整，已从原文 salvage testCases';
  }

  return parsed;
}

/**
 * @param {Object} ctx
 */
function buildStepDirective(ctx = {}) {
  const phase = ctx.expectedPhase || STEP_PHASES[ctx.step] || 'analyze';
  const quotas = ctx.input?.test_type_quotas || [];
  const lines = [ `本步必须为 phase="${phase}"，只输出一个 JSON 对象，不要 markdown 代码块。` ];

  if (phase === 'analyze') {
    lines.push('analyze 阶段：testCases 可为空数组 []，完成后 continue=true。');
  }
  if (phase === 'functional' || phase === 'edge') {
    const related = quotas.filter(q => q.phase === phase);
    if (related.length) {
      for (const q of related) {
        lines.push(`${q.label}：本步或后续步累计至少 ${q.count} 条 type="${q.agentType}" 用例。`);
      }
    }
    lines.push('本步 testCases 至少 1 条，且每条含 id/title/type/steps/expected；若无则 done=false。');
  }
  if (phase === 'review') {
    lines.push('review 阶段：合并去重后输出最终 testCases，并设置 done=true, continue=false。');
  }
  return lines.join('\n');
}

module.exports = {
  STEP_PHASES,
  parseTestgenStepOutput,
  buildStepDirective,
  salvageTestCasesArray,
};

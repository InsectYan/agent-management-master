/**
 * @file loopStepParser.js
 * @description 规范 testgen Loop 每步 LLM 输出：JSON 解析、testCases salvage、phase 对齐。
 */

'use strict';

const { extractJsonObject } = require('../../../app/lib/llm/chat');
const { normalizeTestCases } = require('./docParser');
const { normalizeFitnessTestCases } = require('./fitnessFieldSchema');

const STEP_PHASES = [ 'analyze', 'functional', 'edge', 'review' ];

function isFitnessMode(ctx = {}) {
  const input = ctx.input || {};
  return input.action === 'generate_for_fitness'
    || Boolean(input.fitness_primary_context || input.template_output_format || input.scheme_id);
}

/**
 * @param {string} text
 * @param {boolean} fitness
 * @returns {Record<string, unknown>[]}
 */
function salvageTestCaseObjects(text, fitness = false) {
  const raw = String(text || '');
  const cases = [];
  const seen = new Set();

  const patterns = fitness
    ? [
      /\{[^{}]*"item_name"\s*:\s*"([^"]+)"[^{}]*\}/g,
      /\{[^{}]*"title"\s*:\s*"((?:[^"\\]|\\.)*)"[^{}]*\}/g,
    ]
    : [
      /\{[^{}]*"id"\s*:\s*"([^"]+)"[^{}]*\}/g,
    ];

  for (const objectPattern of patterns) {
    let match;
    while ((match = objectPattern.exec(raw)) !== null) {
      const chunk = match[0];
      const dedupeKey = match[1];
      if (seen.has(dedupeKey)) continue;
      try {
        const obj = JSON.parse(chunk);
        seen.add(dedupeKey);
        cases.push(obj);
      } catch {
        if (fitness && match[1]) {
          seen.add(dedupeKey);
          cases.push({ item_name: match[1].replace(/\\"/g, '"') });
        } else {
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
    }
  }

  return cases;
}

/**
 * @param {string} text
 * @param {boolean} [fitness]
 * @returns {unknown[]}
 */
function salvageTestCasesArray(text, fitness = false) {
  const raw = String(text || '');
  const marker = raw.search(/"testCases"\s*:\s*\[/i);
  if (marker >= 0) {
    const fromArray = salvageTestCaseObjects(raw.slice(marker), fitness);
    if (fromArray.length) return fromArray;
  }
  return salvageTestCaseObjects(raw, fitness);
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
  const fitness = isFitnessMode(ctx);

  let parsed = extractJsonObject(text);
  const parseOk = Boolean(parsed);
  if (!parsed) parsed = {};

  if (parsed.test_cases && !parsed.testCases) {
    parsed.testCases = parsed.test_cases;
  }

  const salvaged = salvageTestCasesArray(text, fitness);
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

  const cases = fitness
    ? normalizeFitnessTestCases(parsed.testCases)
    : normalizeTestCases(parsed.testCases);
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
  const fitness = isFitnessMode(ctx);
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
    if (fitness) {
      lines.push('本步 testCases 至少 1 条；每条必填 item_name、detail_summary、expected_observation、test_steps（字符串数组）。');
      lines.push('其他字段按需输出：未涉及的 key 不要出现；已出现的 key 须有有效值（勿写 null/空字符串占位）。');
      lines.push('HTTP/config_json/threshold_json 仅在文档或 template_output_format 涉及时填写；平台可缺省补齐。');
    } else {
      lines.push('本步 testCases 至少 1 条，且每条含 id/title/type/steps/expected；若无则 done=false。');
    }
  }
  if (phase === 'review') {
    if (fitness) {
      lines.push('review 阶段：合并去重；确保每条含 item_name/detail_summary/expected_observation/test_steps；');
      lines.push('仅校验上述必填字段，不要求补全 HTTP 或 config_json；done=true, continue=false。');
    } else {
      lines.push('review 阶段：合并去重；确保每条含 id/title/steps/expected；done=true。');
    }
  }
  return lines.join('\n');
}

module.exports = {
  STEP_PHASES,
  parseTestgenStepOutput,
  buildStepDirective,
  salvageTestCasesArray,
  isFitnessMode,
};

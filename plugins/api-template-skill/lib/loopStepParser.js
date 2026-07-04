'use strict';

const { parseDocument, loadDocumentFile } = require('../../testgen-skill/lib/docParser');
const { extractJsonObject } = require('../../../app/lib/llm/chat');

const STEP_PHASES = [ 'analyze', 'generate', 'review' ];

function salvageTemplateObjects(text) {
  const raw = String(text || '');
  const templates = [];
  const seen = new Set();
  const pattern = /\{[^{}]*"template_code"\s*:\s*"([^"]+)"[^{}]*\}/g;
  let match;
  while ((match = pattern.exec(raw)) !== null) {
    const chunk = match[0];
    const code = match[1];
    if (seen.has(code)) continue;
    try {
      templates.push(JSON.parse(chunk));
      seen.add(code);
    } catch {
      // skip malformed
    }
  }
  return templates;
}

function salvageTemplatesArray(text) {
  const raw = String(text || '');
  const marker = raw.search(/"apiTemplates"\s*:\s*\[/i);
  if (marker >= 0) {
    const fromArray = salvageTemplateObjects(raw.slice(marker));
    if (fromArray.length) return fromArray;
  }
  return salvageTemplateObjects(raw);
}

function parseApiTemplateStepOutput(rawText, ctx = {}) {
  const text = String(rawText || '').trim();
  const step = Number(ctx.step) || 0;
  const maxSteps = Number(ctx.maxSteps) || STEP_PHASES.length;
  const expectedPhase = ctx.expectedPhase || STEP_PHASES[step] || 'analyze';

  let parsed = {};
  try {
    parsed = extractJsonObject(text) || {};
  } catch {
    parsed = {};
  }

  let apiTemplates = Array.isArray(parsed.apiTemplates) ? parsed.apiTemplates : [];
  if (!apiTemplates.length) {
    apiTemplates = salvageTemplatesArray(text);
  }

  let phase = String(parsed.phase || expectedPhase).toLowerCase();
  if (!STEP_PHASES.includes(phase)) phase = expectedPhase;

  const isLastStep = step >= maxSteps - 1;
  let done = Boolean(parsed.done);
  let cont = parsed.continue !== false;

  if (phase === 'generate' && apiTemplates.length === 0) {
    done = false;
    cont = true;
  }
  if (isLastStep && apiTemplates.length > 0) {
    done = true;
    cont = false;
    phase = 'review';
  }

  return {
    continue: cont,
    done,
    phase,
    note: String(parsed.note || ''),
    summary: String(parsed.summary || ''),
    apiTemplates,
    raw_text: text.slice(0, 500),
  };
}

function buildStepDirective(ctx = {}) {
  const step = Number(ctx.step) || 0;
  const phase = STEP_PHASES[step] || 'analyze';
  const hints = {
    analyze: '分析文档中的 API 端点、请求参数与可注入字段，apiTemplates 可为空数组。',
    generate: '为每个识别到的端点输出完整 apiTemplates 条目，至少 1 条。',
    review: '去重合并、补全 inject_schema，输出最终 apiTemplates 并 done=true。',
  };
  return `[Step ${step + 1}/${STEP_PHASES.length}] phase=${phase} — ${hints[phase] || ''}`;
}

module.exports = {
  STEP_PHASES,
  parseApiTemplateStepOutput,
  buildStepDirective,
  salvageTemplatesArray,
};

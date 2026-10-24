'use strict';

const { readJsonObject } = require('../../_shared/productionSource');

const MODULES = [ 'basic', 'world', 'factions', 'characters', 'outline', 'content', 'continuity' ];

function parseReviewStep(rawText) {
  const parsed = readJsonObject(rawText);
  const findings = [];
  for (const item of Array.isArray(parsed.findings) ? parsed.findings : []) {
    if (!item || !item.message) continue;
    findings.push({
      module: MODULES.includes(item.module) ? item.module : 'basic',
      code: String(item.code || 'llm_finding').slice(0, 64),
      severity: [ 'error', 'warning', 'info' ].includes(item.severity) ? item.severity : 'warning',
      entity: String(item.entity || '').slice(0, 64),
      message: String(item.message).slice(0, 2000),
      evidence: String(item.evidence || '').slice(0, 500),
      suggestion: String(item.suggestion || '').slice(0, 1000),
      chapter_id: item.chapter_id || null,
    });
  }
  const reply = String(parsed.reply || parsed.summary || '').trim();
  return {
    continue: false,
    done: true,
    thinking: String(parsed.thinking || '').trim(),
    reply,
    summary: reply,
    findings,
  };
}

module.exports = { parseReviewStep };

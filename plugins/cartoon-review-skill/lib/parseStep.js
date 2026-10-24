'use strict';

const { readJsonObject } = require('../../_shared/productionSource');

const NODES = {
  脚本: 'script',
  分镜: 'storyboard',
  生成: 'generate',
  配音: 'voice',
  剪辑: 'compose',
  script: 'script',
  storyboard: 'storyboard',
  generate: 'generate',
  voice: 'voice',
  compose: 'compose',
};

function bannedTerms(rules) {
  const terms = [];
  for (const rule of rules || []) {
    if (rule?.kind && rule.kind !== 'banned') continue;
    String(rule?.body || '').split(/\n+/).forEach(item => {
      const text = item.trim();
      if (text.length >= 2) terms.push(text);
    });
  }
  return terms.sort((a, b) => b.length - a.length);
}

function redact(message, terms) {
  let text = String(message || '').trim();
  for (const term of terms) {
    if (text.includes(term)) text = text.split(term).join('禁用词');
  }
  return text.slice(0, 200);
}

function parseReviewStep(rawText, context = {}) {
  const parsed = readJsonObject(rawText);
  delete parsed.pass;
  delete parsed.reject;
  delete parsed.decision;
  const input = context.input || {};
  const terms = bannedTerms(input.rules);
  const shots = new Set((Array.isArray(input.shots) ? input.shots : []).map(item => String(item.id)));
  const ruleIds = new Set((Array.isArray(input.rules) ? input.rules : []).map(item => String(item.id)));
  const issues = [];
  for (const item of Array.isArray(parsed.issues) ? parsed.issues : []) {
    const shotId = item?.shot_id == null || item.shot_id === '' ? '' : String(item.shot_id);
    if (shotId && !shots.has(shotId)) continue;
    const ruleId = item?.rule_id == null || item.rule_id === '' ? '' : String(item.rule_id);
    const level = item?.level === 'block' ? 'block' : 'warning';
    issues.push({
      shot_id: shotId,
      rule_id: ruleId && ruleIds.has(ruleId) ? ruleId : '',
      level,
      message: redact(item?.message, terms),
      node: NODES[item?.node] || 'script',
    });
  }
  const reply = redact(parsed.reply || parsed.summary || '', terms);
  return {
    continue: false,
    done: true,
    thinking: '',
    reply,
    summary: reply,
    issues,
  };
}

module.exports = { parseReviewStep, redact };

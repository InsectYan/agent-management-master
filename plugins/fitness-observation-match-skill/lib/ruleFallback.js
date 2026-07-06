'use strict';

/**
 * 规则降级：期望观测文案 vs 实际响应文本
 * @param {string} expected
 * @param {string} actual
 * @param {object} [thresholdJson]
 */
function ruleBasedObservationMatch(expected, actual, thresholdJson = {}) {
  const passThreshold = Number(thresholdJson.pass_threshold ?? 0.65);
  const exp = String(expected || '').trim();
  const act = String(actual || '').trim();

  if (!exp) {
    return {
      pass: act.length > 0,
      score: act.length > 0 ? 0.7 : 0,
      reasons: [ act.length ? '无期望观测，仅检查有响应内容' : '无期望观测且无响应内容' ],
      fallback: true,
    };
  }
  if (!act) {
    return { pass: false, score: 0, reasons: [ '响应无可用文案' ], fallback: true };
  }

  const expLower = exp.toLowerCase();
  const actLower = act.toLowerCase();
  if (actLower.includes(expLower) || expLower.includes(actLower.slice(0, Math.min(40, actLower.length)))) {
    return { pass: true, score: 1, reasons: [ '实际文案包含期望观测关键词' ], fallback: true };
  }

  const segments = exp.split(/[/、，,；;|]/).map(s => s.trim()).filter(Boolean);
  const hits = segments.filter(seg => seg.length >= 2 && actLower.includes(seg.toLowerCase()));
  const ratio = segments.length ? hits.length / segments.length : 0;
  const pass = ratio >= passThreshold;

  const reasons = [
    `期望片段命中 ${hits.length}/${segments.length || 1} (${(ratio * 100).toFixed(0)}%)`,
  ];
  if (hits.length) reasons.push(`命中: ${hits.slice(0, 3).join(' · ')}`);
  if (!pass) reasons.push(`未满足阈值 ${(passThreshold * 100).toFixed(0)}%`);

  return { pass, score: Math.round(ratio * 100) / 100, reasons, fallback: true };
}

function parseMatchOutput(output, text, expected, actual, thresholdJson) {
  const passThreshold = Number(thresholdJson.pass_threshold ?? 0.65);
  const score = Number(output.score);
  const hasScore = Number.isFinite(score);
  const pass = output.pass === true || (hasScore && score >= passThreshold);
  return {
    pass,
    score: hasScore ? score : (pass ? passThreshold : 0),
    reasons: Array.isArray(output.reasons) ? output.reasons : [ output.summary || text || '' ].filter(Boolean),
  };
}

function needsRuleFallback(result) {
  const output = result.output || {};
  const meta = result.meta || {};
  if (meta.stoppedReason === 'no_llm' || output.stoppedReason === 'no_llm') return true;
  if (!result.text && output.pass == null && output.score == null) return true;
  const text = result.text || '';
  return /占位|请配置 LLM|no_llm/i.test(text);
}

module.exports = {
  ruleBasedObservationMatch,
  parseMatchOutput,
  needsRuleFallback,
};

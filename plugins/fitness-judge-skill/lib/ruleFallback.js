'use strict';

function isObservationPass(obs) {
  if (obs.pass === true || obs.passed === true || obs.verdict === 'pass') return true;
  if (obs.pass === false || obs.passed === false || obs.verdict === 'fail') return false;
  const status = Number(obs.http_status);
  if (Number.isFinite(status)) return status >= 200 && status < 300;
  return false;
}

function ruleBasedJudge(observations = [], rubric = {}, thresholdJson = {}) {
  const passThreshold = Number(thresholdJson.pass_threshold ?? rubric.pass_threshold ?? 0.7);
  const total = observations.length;
  const passed = observations.filter(isObservationPass).length;
  const score = total ? Math.round((passed / total) * 100) / 100 : 0;
  const pass = score >= passThreshold;

  const reasons = [];
  if (!total) {
    reasons.push('无观测数据，无法判定');
  } else {
    reasons.push(`${passed}/${total} 条观测通过 (${(score * 100).toFixed(0)}%)`);
    if (!pass) {
      const failed = observations.filter(o => !isObservationPass(o));
      failed.slice(0, 3).forEach((o, i) => {
        reasons.push(`失败 #${i + 1}: HTTP ${o.http_status ?? '—'} — ${o.response_excerpt || o.input_summary || ''}`.slice(0, 120));
      });
    }
  }

  return { pass, score, reasons, fallback: true };
}

function ruleBasedPreReview(materials = {}, rubric = {}) {
  const observations = materials.observations || materials.items || [];
  const dims = rubric.dimensions || [ '完整性', '准确性' ];
  const judge = ruleBasedJudge(observations, rubric, materials.threshold_json || {});

  const checklist = dims.map(dim => ({
    item: dim,
    ok: judge.score >= (rubric.pass_threshold ?? 0.7),
    note: `${dim} — 基于 ${observations.length} 条材料启发式评估`,
  }));

  if (materials.expected_observation) {
    checklist.push({
      item: '期望观测对齐',
      ok: judge.pass,
      note: String(materials.expected_observation).slice(0, 80),
    });
  }

  return {
    score: judge.score,
    checklist,
    fallback: true,
  };
}

function ruleBasedExplain(runId, observations = []) {
  const judge = ruleBasedJudge(observations, {}, { pass_threshold: 0.7 });
  const lines = [
    `## Run #${runId || '—'} 解读（规则降级）`,
    '',
    `- 通过率: ${(judge.score * 100).toFixed(0)}%`,
    `- 结论: ${judge.pass ? '整体通过' : '存在失败项'}`,
    '',
    '### 观测摘要',
    ...observations.slice(0, 8).map((o, i) =>
      `${i + 1}. [${isObservationPass(o) ? 'PASS' : 'FAIL'}] HTTP ${o.http_status ?? '—'} — ${o.input_summary || o.response_excerpt || '—'}`.slice(0, 100),
    ),
  ];
  return lines.join('\n');
}

module.exports = {
  isObservationPass,
  ruleBasedJudge,
  ruleBasedPreReview,
  ruleBasedExplain,
};

'use strict';

function isObservationPass(obs) {
  if (obs.pass === true || obs.passed === true || obs.verdict === 'pass' || obs.sub_verdict === 'pass') return true;
  if (obs.pass === false || obs.passed === false || obs.verdict === 'fail' || obs.sub_verdict === 'fail') return false;
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

function templateTroubleshooting(templateCode) {
  const map = {
    'TPL-DET': '检查单次 HTTP/CLI 响应与期望字段是否一致',
    'TPL-BND': '核对失败边界行的输入与期望区间',
    'TPL-REP': '对比重复样本间偏差，是否随机波动或系统性失败',
    'TPL-SET': '定位固定样本集中失败 index，检查样本数据',
    'TPL-CHAIN': '检查链路 extract 变量、逐步 HTTP 状态与断言',
    'TPL-API-CTX': '检查 preflight→submit→poll 各阶段与语义文案比对',
    'TPL-PAIR': '对比 A/B 输出差异是否超出对照阈值',
    'TPL-NEG': '确认注入 payload 生效且安全策略符合预期',
    'TPL-OBS': '检查 trace/journey 可观测项是否缺失',
    'TPL-LOAD': '核对 p95、错误率、吞吐与 threshold_json',
    'TPL-MAN': '补齐人工评审材料或调整 blocking 项',
  };
  return map[templateCode] || '对照期望观测与 assertion_failures 排查';
}

function ruleBasedExplain(runId, observations = [], runContext = {}) {
  const judge = ruleBasedJudge(observations, {}, { pass_threshold: 0.7 });
  const ctx = runContext || {};
  const templateCode = ctx.template_code || observations.find(o => o.template_code)?.template_code || '';
  const lines = [
    `## Run #${runId || '—'} 失败解读（规则降级）`,
    '',
    `- 运行状态: ${ctx.status ?? '—'} · 判定: ${ctx.verdict ?? '—'}`,
    `- 方案/验证: ${ctx.scheme_id ?? '—'} / ${ctx.validation_id ?? '—'}`,
    templateCode ? `- 配置模板: ${templateCode}${ctx.template_name ? ` · ${ctx.template_name}` : ''}` : '',
    ctx.item_name ? `- 用例: ${ctx.item_id} · ${ctx.item_name}` : '',
    ctx.expected_observation ? `- 期望观测: ${String(ctx.expected_observation).slice(0, 200)}` : '',
    `- 子项: 通过 ${ctx.pass_count ?? 0} · 失败 ${ctx.fail_count ?? 0} · 共 ${ctx.total_count ?? observations.length}`,
    `- 失败项通过率估算: ${(judge.score * 100).toFixed(0)}%`,
    `- 结论: ${judge.pass ? '整体通过' : '存在失败项，需排查下列子项'}`,
    '',
    '### 失败/观测明细',
    ...observations.slice(0, 12).map((o, i) => {
      const pass = o.pass === true || o.sub_verdict === 'pass' || o.verdict === 'pass';
      const parts = [
        `${i + 1}. [${pass ? 'PASS' : 'FAIL'}] #${o.sub_run_index ?? i}`,
        o.runner_type ? `[${o.runner_type}]` : '',
        o.template_code ? `[${o.template_code}]` : '',
        `HTTP ${o.http_status ?? '—'}`,
        o.input_summary || '',
        o.response_excerpt || o.output_summary || '',
      ].filter(Boolean);
      if (o.template_hints) parts.push(`线索: ${o.template_hints}`);
      if (o.semantic_summary) parts.push(`语义: ${o.semantic_summary}`);
      if (o.assertion_failures) parts.push(`断言: ${o.assertion_failures}`);
      if (o.error_message) parts.push(`错误: ${String(o.error_message).slice(0, 80)}`);
      return parts.join(' — ').slice(0, 280);
    }),
    '',
    '### 排查建议',
    `- ${templateTroubleshooting(templateCode)}`,
    '- 在运行控制台查看子项 artifacts（HTTP body / CLI stderr / poll 阶段）',
    '- 核对执行环境与 threshold_json 阈值配置',
  ];
  if (ctx.error_message) {
    lines.splice(8, 0, `- Run 级错误: ${ctx.error_message}`);
  }
  return lines.filter(Boolean).join('\n');
}

function ruleBasedSummary(planName, observations = []) {
  const total = observations.length;
  const passed = observations.filter(o => o.result_status === 'passed').length;
  const failed = observations.filter(o => o.result_status === 'failed').length;
  const pending = total - passed - failed;
  const passRate = total ? Math.round(100 * passed / total) : 0;

  const lines = [
    `## 测试计划摘要 — ${planName || '未命名计划'}`,
    '',
    `- 用例总数: ${total}`,
    `- 通过: ${passed} · 失败: ${failed} · 待执行: ${pending}`,
    `- 通过率: ${passRate}%`,
    '',
    '### 结论',
    passRate >= 80
      ? '整体质量良好，可进入发版评审。'
      : passRate >= 60
        ? '存在未通过项，建议修复后复测。'
        : '通过率偏低，不建议发版。',
    '',
    '### 明细（前 10 条）',
    ...observations.slice(0, 10).map(o =>
      `- ${o.item_id || '—'}: ${o.result_status || 'pending'}${o.validation_result ? ` (${o.validation_result})` : ''}`,
    ),
  ];
  return lines.join('\n');
}

module.exports = {
  isObservationPass,
  ruleBasedJudge,
  ruleBasedPreReview,
  ruleBasedExplain,
  ruleBasedSummary,
};

/**
 * @file perf-bottleneck-skill/index.js
 * @description React 方案 — 性能测试完成后分析 TPS/P95/错误率，输出瓶颈报告。
 */

'use strict';

const { summarize } = require('./lib/metricsNormalizer');
const store = require('./lib/store');

const ANALYZE_ACTIONS = [ 'analyze', 'analyze_load_run' ];

function resolveAnalyzeAction(action) {
  return action === 'analyze_load_run' ? 'analyze_load_run' : 'analyze';
}

module.exports = {
  name: 'perf-bottleneck-skill',
  version: '1.0.0',
  description: 'React 方案 — 性能瓶颈预测与优化建议',
  scheme: 'react',
  routes: [
    {
      path: '/api/skills/perf-bottleneck',
      method: 'POST',
      description: '性能瓶颈分析入口',
      requiresAuth: false,
    },
  ],
  dbTables: [ 'perf_bottleneck_runs' ],
  config: {
    llmDefaultProfile: 'ollama-qwen',
    actionDefaults: { POST: 'analyze' },
    react: {
      maxSteps: 3,
      stopWhen: 'llm-done',
      systemPromptFile: 'react-system.md',
      temperature: 0.3,
      maxTokens: 2048,
      jsonSchemaHint: [
        '{ "continue": boolean, "done": boolean, "summary": string,',
        '"bottlenecks": [{ "area", "severity", "evidence", "recommendation" }],',
        '"risk_level": "low|medium|high", "optimization_priority": string[] }',
      ].join(' '),
      userContextFields: [ 'stats', 'case_meta', 'env_name', 'perf_samples', 'run_type' ],
    },
  },
  callbacks: {
    async beforeExecute(ctx, params) {
      const action = params.action || 'analyze';

      if (action === 'list' || action === 'get') {
        return { ...params, action };
      }

      if (!ANALYZE_ACTIONS.includes(action)) {
        const err = new Error(`不支持的动作: ${action}`);
        err.status = 400;
        throw err;
      }

      const runId = Number(params.run_id);
      if (!runId) {
        const err = new Error(`${action} 缺少 run_id`);
        err.status = 400;
        throw err;
      }

      const samples = params.perf_samples;
      if (!Array.isArray(samples) || !samples.length) {
        const err = new Error(`${action} 缺少 perf_samples`);
        err.status = 400;
        throw err;
      }

      const stats = summarize(samples);
      return {
        ...params,
        action: resolveAnalyzeAction(action),
        run_id: runId,
        perf_samples: samples,
        stats,
        case_meta: params.case_meta || {},
        env_name: params.env_name || '',
        run_type: action === 'analyze_load_run' ? 'load' : 'perf',
      };
    },

    async enrichContext(ctx, params) {
      if (params.action === 'list') {
        const records = await store.listRuns(ctx, 15);
        return { action: 'list', perf_bottleneck_runs: records };
      }

      if (params.action === 'get') {
        const runId = Number(params.run_id);
        const row = await store.getByRunId(ctx, runId);
        if (!row) {
          const err = new Error(`分析记录不存在: run_id=${runId}`);
          err.status = 404;
          throw err;
        }
        return { action: 'get', analysis: row };
      }

      return {
        action: params.action,
        run_id: params.run_id,
        env_name: params.env_name,
        case_meta: params.case_meta,
        stats: params.stats,
        perf_samples: params.perf_samples,
        run_type: params.run_type || 'perf',
        perf_summary_text: formatSamplesForPrompt(params.perf_samples, params.stats, params.run_type),
      };
    },

    async persistResult(ctx, payload) {
      const action = payload.params?.action;
      if (action === 'list' || action === 'get') {
        return { persisted: false, reason: '只读动作' };
      }

      const output = payload.output || {};
      const report = buildReport(output, payload);

      const info = await store.insertRun(ctx, {
        run_id: payload.params?.run_id,
        report_json: report,
        risk_level: report.risk_level,
      });

      return {
        persisted: true,
        analysis_id: Number(info.lastInsertRowid),
        run_id: payload.params?.run_id,
        action: payload.params?.action,
      };
    },

    async formatResponse(ctx, result) {
      const output = result.output || {};
      const action = output.action || result.meta?.skill_action;

      if (action === 'get') {
        const analysis = output.analysis || {};
        return {
          reply: result.text || '分析详情',
          output: { report: analysis.report_json || analysis },
          meta: { ...result.meta, action: 'get', persisted: false },
        };
      }

      if (action === 'list') {
        return {
          reply: result.text || '历史分析记录',
          output: { records: output.perf_bottleneck_runs || [] },
          meta: { ...result.meta, action: 'list', persisted: false },
        };
      }

      const report = buildReport(output, result);

      return {
        reply: result.text || `性能分析完成，识别 ${report.bottlenecks.length} 处瓶颈`,
        output: { report, action },
        meta: {
          ...result.meta,
          run_id: result.meta?.run_id || output.run_id,
          analysis_id: result.meta?.analysis_id,
          skill: 'perf-bottleneck-skill',
          action,
        },
      };
    },
  },
};

function buildReport(output, payload) {
  const text = payload.text || '';
  const stats = output.stats || payload.params?.stats;
  let report = {
    summary: output.summary || text || '',
    bottlenecks: Array.isArray(output.bottlenecks) ? output.bottlenecks : [],
    risk_level: output.risk_level || 'medium',
    optimization_priority: output.optimization_priority || [],
    run_type: output.run_type || payload.params?.run_type || 'perf',
  };

  if (!report.bottlenecks.length && stats) {
    report = { ...report, ...ruleBasedLoadReport(stats, payload.params?.perf_samples || []) };
  }

  return report;
}

function ruleBasedLoadReport(stats, samples) {
  const bottlenecks = [];
  const priority = [];

  if (stats.avg_error_rate > 0.05) {
    bottlenecks.push({
      area: '错误率',
      severity: stats.avg_error_rate > 0.1 ? 'high' : 'medium',
      evidence: `平均错误率 ${(stats.avg_error_rate * 100).toFixed(2)}%`,
      recommendation: '检查 5xx/超时根因，增加熔断与重试策略',
    });
    priority.push('降低错误率');
  }

  if (stats.max_p95_ms > 1000) {
    bottlenecks.push({
      area: '延迟 P95',
      severity: stats.max_p95_ms > 3000 ? 'high' : 'medium',
      evidence: `最大 P95 ${stats.max_p95_ms}ms，平均 ${stats.avg_p95_ms}ms`,
      recommendation: '排查慢查询、下游依赖与连接池配置',
    });
    priority.push('优化 P95 延迟');
  }

  if (stats.peak_tps > 0 && stats.avg_tps < stats.peak_tps * 0.5) {
    bottlenecks.push({
      area: '吞吐稳定性',
      severity: 'medium',
      evidence: `峰值 TPS ${stats.peak_tps}，平均 ${stats.avg_tps}`,
      recommendation: '检查负载波动与资源瓶颈（CPU/IO/线程池）',
    });
    priority.push('稳定 TPS');
  }

  const risk_level = bottlenecks.some(b => b.severity === 'high')
    ? 'high'
    : bottlenecks.length ? 'medium' : 'low';

  return {
    summary: bottlenecks.length
      ? `负载 run 分析（${samples.length} 窗口）：发现 ${bottlenecks.length} 处潜在瓶颈`
      : `负载 run 指标正常（${samples.length} 窗口，平均 TPS ${stats.avg_tps}）`,
    bottlenecks,
    risk_level,
    optimization_priority: priority.length ? priority : [ '持续监控' ],
    fallback: true,
  };
}

function formatSamplesForPrompt(samples, stats, runType = 'perf') {
  const lines = samples.map((s, i) =>
    `#${i + 1} TPS=${s.tps ?? '—'} avg=${s.avg_response_time_ms ?? '—'}ms `
    + `P95=${s.p95_response_time_ms ?? '—'}ms err=${((s.error_rate || 0) * 100).toFixed(2)}%`,
  );
  const label = runType === 'load' ? '负载压测 (k6/TS-09)' : '性能测试';
  return [
    `## ${label} 统计摘要`,
    `样本窗口数: ${stats.window_count}`,
    `平均 TPS: ${stats.avg_tps}`,
    `峰值 TPS: ${stats.peak_tps}`,
    `平均 P95: ${stats.avg_p95_ms}ms`,
    `最大 P95: ${stats.max_p95_ms}ms`,
    `平均错误率: ${(stats.avg_error_rate * 100).toFixed(2)}%`,
    '## 时序窗口',
    ...lines,
  ].join('\n');
}

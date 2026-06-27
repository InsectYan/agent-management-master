/**
 * @file perf-bottleneck-skill/index.js
 * @description React 方案 — 性能测试完成后分析 TPS/P95/错误率，输出瓶颈报告。
 */

'use strict';

const { summarize } = require('./lib/metricsNormalizer');
const store = require('./lib/store');

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
      userContextFields: [ 'stats', 'case_meta', 'env_name', 'perf_samples' ],
    },
  },
  callbacks: {
    async beforeExecute(ctx, params) {
      const action = params.action || 'analyze';

      if (action === 'list' || action === 'get') {
        return { ...params, action };
      }

      if (action !== 'analyze') {
        const err = new Error(`不支持的动作: ${action}`);
        err.status = 400;
        throw err;
      }

      const runId = Number(params.run_id);
      if (!runId) {
        const err = new Error('analyze 缺少 run_id');
        err.status = 400;
        throw err;
      }

      const samples = params.perf_samples;
      if (!Array.isArray(samples) || !samples.length) {
        const err = new Error('analyze 缺少 perf_samples');
        err.status = 400;
        throw err;
      }

      const stats = summarize(samples);
      return {
        ...params,
        action,
        run_id: runId,
        perf_samples: samples,
        stats,
        case_meta: params.case_meta || {},
        env_name: params.env_name || '',
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
        action: 'analyze',
        run_id: params.run_id,
        env_name: params.env_name,
        case_meta: params.case_meta,
        stats: params.stats,
        perf_samples: params.perf_samples,
        perf_summary_text: formatSamplesForPrompt(params.perf_samples, params.stats),
      };
    },

    async persistResult(ctx, payload) {
      const action = payload.params?.action;
      if (action === 'list' || action === 'get') {
        return { persisted: false, reason: '只读动作' };
      }

      const output = payload.output || {};
      const report = {
        summary: output.summary || payload.text || '',
        bottlenecks: Array.isArray(output.bottlenecks) ? output.bottlenecks : [],
        risk_level: output.risk_level || 'medium',
        optimization_priority: output.optimization_priority || [],
      };

      const info = await store.insertRun(ctx, {
        run_id: payload.params?.run_id,
        report_json: report,
        risk_level: report.risk_level,
      });

      return {
        persisted: true,
        analysis_id: Number(info.lastInsertRowid),
        run_id: payload.params?.run_id,
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

      const report = {
        summary: output.summary || result.text || '',
        bottlenecks: output.bottlenecks || [],
        risk_level: output.risk_level || 'medium',
        optimization_priority: output.optimization_priority || [],
      };

      return {
        reply: result.text || `性能分析完成，识别 ${report.bottlenecks.length} 处瓶颈`,
        output: { report },
        meta: {
          ...result.meta,
          run_id: result.meta?.run_id || output.run_id,
          analysis_id: result.meta?.analysis_id,
          skill: 'perf-bottleneck-skill',
        },
      };
    },
  },
};

function formatSamplesForPrompt(samples, stats) {
  const lines = samples.map((s, i) =>
    `#${i + 1} TPS=${s.tps ?? '—'} avg=${s.avg_response_time_ms ?? '—'}ms `
    + `P95=${s.p95_response_time_ms ?? '—'}ms err=${((s.error_rate || 0) * 100).toFixed(2)}%`,
  );
  return [
    '## 统计摘要',
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

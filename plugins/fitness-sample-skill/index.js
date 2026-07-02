'use strict';

const { generateRuleBased } = require('./lib/sampleGenerator');

function normalizeSamples(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((s, i) => ({
    path: s.path || s.input_data?.path || '/',
    method: s.method || s.input_data?.method || 'POST',
    expect_status: s.expect_status ?? s.expected_data?.expect_status ?? 200,
    expect_blocked: s.expect_blocked,
    block_statuses: s.block_statuses,
    input_data: s.input_data || {
      runner: 'http',
      path: s.path || '/',
      method: s.method || 'POST',
      body: s.body,
      headers: s.headers,
    },
    expected_data: s.expected_data || (s.expected ? { expected: s.expected } : { expect_status: s.expect_status ?? 200 }),
    metadata: s.metadata || { index: i },
    sort_order: s.sort_order ?? i,
  }));
}

function ruleBasedForAction(action, params) {
  const generated = generateRuleBased(action, params);
  if (Array.isArray(generated)) {
    return { samples: normalizeSamples(generated), forbidden_patterns: [] };
  }
  return {
    samples: normalizeSamples(generated.samples || []),
    forbidden_patterns: generated.forbidden_patterns || [],
  };
}

function needsRuleFallback(result) {
  const output = result.output || {};
  if (result.meta?.stoppedReason === 'no_llm') return true;
  if (!Array.isArray(output.samples) || !output.samples.length) return true;
  const text = result.text || '';
  return /占位|请配置 LLM|no_llm/i.test(text);
}

module.exports = {
  name: 'fitness-sample-skill',
  version: '1.0.0',
  description: 'Fitness 样本/矩阵/对抗集生成（规则 + LLM）',
  scheme: 'react',
  routes: [
    { path: '/api/skills/fitness-sample', method: 'POST', requiresAuth: false },
  ],
  config: {
    llmDefaultProfile: 'ollama-qwen',
    actionDefaults: { POST: 'from_example' },
    react: {
      maxSteps: 2,
      stopWhen: 'llm-done',
      systemPromptFile: 'sample-system.md',
      temperature: 0.4,
      maxTokens: 4096,
      jsonSchemaHint: '{ "done": boolean, "samples": array, "forbidden_patterns": string[], "summary": string }',
      userContextFields: [ 'action', 'scheme_id', 'test_input_example', 'test_cases_text', 'matrix_dims' ],
    },
  },
  callbacks: {
    async beforeExecute(ctx, params) {
      const action = params.action || 'from_example';
      const allowed = [ 'from_example', 'expand_matrix', 'gen_adversarial', 'enrich_csv', 'enrich_samples' ];
      if (!allowed.includes(action)) {
        const err = new Error(`不支持的动作: ${action}`);
        err.status = 400;
        throw err;
      }
      return { ...params, action };
    },

    async enrichContext(ctx, params) {
      const casesText = Array.isArray(params.test_cases)
        ? params.test_cases.map(c => `- ${c.id || ''} ${c.title || ''}: ${c.expected || ''}`).join('\n')
        : '';
      return {
        action: params.action,
        scheme_id: params.scheme_id || (params.action === 'expand_matrix' ? 'TS-02-BND' : params.action === 'gen_adversarial' ? 'TS-07-NEG' : 'TS-04-SET'),
        item_id: params.item_id,
        test_input_example: params.test_input_example || '',
        test_cases_text: casesText,
        matrix_dims: params.matrix_dims || params.dimensions,
        sample_set_id: params.sample_set_id,
        csv_text: params.csv_text || '',
        items_text: Array.isArray(params.items)
          ? params.items.map(i => `- ${i.item_id}: ${i.test_input_example || i.item_name || ''}`).join('\n')
          : '',
        _params: params,
      };
    },

    async formatResponse(ctx, result) {
      const output = result.output || {};
      const action = output.action || result.meta?.skill_action || result.meta?.params?.action || 'from_example';
      const params = result.meta?.params || output._params || {};

      let samples = normalizeSamples(output.samples);
      let forbidden_patterns = output.forbidden_patterns || [];
      let fallback = false;

      if (needsRuleFallback(result)) {
        const rule = ruleBasedForAction(action, { ...params, ...output });
        samples = rule.samples;
        forbidden_patterns = rule.forbidden_patterns;
        fallback = true;
      }

      return {
        reply: result.text || `已生成 ${samples.length} 条样本`,
        output: {
          action,
          samples,
          items: samples,
          forbidden_patterns,
          summary: output.summary || result.text || (fallback ? '规则引擎生成' : ''),
        },
        meta: { ...result.meta, skill: 'fitness-sample-skill', sample_count: samples.length, fallback },
      };
    },
  },
};

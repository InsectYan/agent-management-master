'use strict';

function normalizeSamples(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((s, i) => ({
    input_data: s.input_data || {
      runner: 'http',
      path: s.path || '/',
      method: s.method || 'POST',
      body: s.body,
      headers: s.headers,
    },
    expected_data: s.expected_data || (s.expected ? { expected: s.expected } : null),
    metadata: s.metadata || { index: i },
    sort_order: s.sort_order ?? i,
  }));
}

function fallbackFromExample(params) {
  const example = params.test_input_example || '';
  const cases = params.test_cases || [];
  if (cases.length) {
    return normalizeSamples(cases.map(tc => ({
      path: tc.steps?.[0] || tc.path,
      method: tc.method || 'POST',
      body: tc.body,
      expected: tc.expected,
      metadata: { source: 'test_cases', case_id: tc.id },
    })));
  }
  return normalizeSamples([{
    input_data: {
      runner: 'http',
      path: '/',
      method: 'POST',
      body: { prompt: example.slice(0, 500) },
    },
    expected_data: { expected: '语义满足 rubric' },
    metadata: { source: 'example_fallback' },
  }]);
}

module.exports = {
  name: 'fitness-sample-skill',
  version: '1.0.0',
  description: 'Fitness 样本/矩阵/对抗集 AI 生成',
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
      userContextFields: [ 'action', 'scheme_id', 'test_input_example', 'test_cases_text' ],
    },
  },
  callbacks: {
    async beforeExecute(ctx, params) {
      const action = params.action || 'from_example';
      const allowed = [ 'from_example', 'expand_matrix', 'gen_adversarial' ];
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
        scheme_id: params.scheme_id || 'TS-04-SET',
        item_id: params.item_id,
        test_input_example: params.test_input_example || '',
        test_cases_text: casesText,
        sample_set_id: params.sample_set_id,
      };
    },

    async formatResponse(ctx, result) {
      const output = result.output || {};
      let samples = normalizeSamples(output.samples);
      if (!samples.length) {
        samples = fallbackFromExample(result.meta?.params || output);
      }
      return {
        reply: result.text || `已生成 ${samples.length} 条样本`,
        output: {
          action: output.action || 'from_example',
          samples,
          items: samples,
          forbidden_patterns: output.forbidden_patterns || [],
          summary: output.summary || result.text,
        },
        meta: { ...result.meta, skill: 'fitness-sample-skill', sample_count: samples.length },
      };
    },
  },
};

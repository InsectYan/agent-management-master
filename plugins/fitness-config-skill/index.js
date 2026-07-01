'use strict';

const { generateRuleBased } = require('./lib/configGenerator');

function needsRuleFallback(result) {
  const output = result.output || {};
  if (result.meta?.stoppedReason === 'no_llm') return true;
  if (!output.config_json || !Object.keys(output.config_json).length) return true;
  const text = result.text || '';
  return /占位|请配置 LLM|no_llm/i.test(text);
}

module.exports = {
  name: 'fitness-config-skill',
  version: '1.0.0',
  description: 'Fitness 测试配置模板自动生成（DET/BND/REP/CHAIN/PAIR/NEG/OBS/LOAD）',
  scheme: 'react',
  routes: [
    { path: '/api/skills/fitness-config', method: 'POST', requiresAuth: false },
  ],
  config: {
    llmDefaultProfile: 'ollama-qwen',
    actionDefaults: { POST: 'generate_det' },
    react: {
      maxSteps: 2,
      stopWhen: 'llm-done',
      systemPromptFile: 'config-system.md',
      temperature: 0.3,
      maxTokens: 4096,
      jsonSchemaHint: '{ "done": boolean, "config_json": object, "threshold_json": object, "summary": string }',
      userContextFields: [ 'action', 'template_code', 'scheme_id', 'item' ],
    },
  },
  callbacks: {
    async beforeExecute(ctx, params) {
      const action = params.action || 'generate_det';
      const allowed = [
        'generate_det', 'generate_bnd', 'generate_rep', 'generate_chain',
        'generate_pair', 'generate_neg', 'generate_obs', 'generate_load', 'generate_config',
      ];
      if (!allowed.includes(action)) {
        const err = new Error(`不支持的动作: ${action}`);
        err.status = 400;
        throw err;
      }
      return { ...params, action };
    },

    async enrichContext(ctx, params) {
      const item = params.item || {};
      return {
        ...params,
        item_summary: [
          `item_id: ${item.item_id || ''}`,
          `summary: ${item.detail_summary || ''}`,
          `expected: ${item.expected_observation || ''}`,
          `path: ${item.endpoint_path || ''} ${item.http_method || ''}`,
          `assertions: ${JSON.stringify(item.assertion_points || [])}`,
        ].join('\n'),
      };
    },

    async formatResponse(ctx, result) {
      const params = ctx.params || {};
      if (needsRuleFallback(result)) {
        const rule = generateRuleBased(params.action, params);
        return {
          ...result,
          output: {
            ...(result.output || {}),
            config_json: rule.config_json,
            threshold_json: rule.threshold_json,
            source: 'rule_fallback',
          },
        };
      }
      const output = result.output || {};
      return {
        ...result,
        output: {
          config_json: output.config_json || output.config || {},
          threshold_json: output.threshold_json || output.threshold || {},
          summary: output.summary || result.text,
          source: 'llm',
        },
      };
    },
  },
};

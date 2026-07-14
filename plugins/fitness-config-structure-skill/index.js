'use strict';

const { proposeConfigPatchRule } = require('./lib/proposePatch');

function needsRuleFallback(result) {
  const output = result.output || {};
  if (result.meta?.stoppedReason === 'no_llm') return true;
  if (!output.config_patch || typeof output.config_patch !== 'object') return true;
  return /占位|请配置 LLM|no_llm/i.test(result.text || '');
}

module.exports = {
  name: 'fitness-config-structure-skill',
  version: '1.0.0',
  description: 'Fitness DET 配置结构补丁（单职责）',
  scheme: 'loop',
  routes: [
    { path: '/api/skills/fitness-config-structure', method: 'POST', requiresAuth: false },
  ],
  config: {
    llmDefaultProfile: 'ollama-qwen',
    actionDefaults: { POST: 'propose_patch' },
    loop: {
      maxSteps: 2,
      stopWhen: 'llm-done',
      systemPromptFile: 'loop-system.md',
      temperature: 0.2,
      maxTokens: 4096,
      jsonSchemaHint: '{ "done": true, "config_patch": object, "sample_needs": array }',
      userContextFields: [
        'action', 'item', 'config_json', 'intent', 'fields', 'fixed', 'gaps', 'api_templates_catalog',
      ],
      stateMerge: { config_patch: 'deepMerge', sample_needs: 'replace' },
    },
  },
  callbacks: {
    async beforeExecute(ctx, params) {
      const action = params.action || 'propose_patch';
      if (action !== 'propose_patch') {
        const err = new Error(`不支持的动作: ${action}（本 Skill 仅 propose_patch）`);
        err.status = 400;
        throw err;
      }
      return { ...params, action };
    },
    async formatResponse(ctx, result) {
      const params = ctx.params || {};
      if (needsRuleFallback(result)) {
        const output = proposeConfigPatchRule(params);
        return {
          ...result,
          reply: 'config_patch ready',
          output: { ...output, source: 'rule_fallback' },
          meta: { ...(result.meta || {}), fallback: 'rule' },
        };
      }
      return {
        ...result,
        output: { ...(result.output || {}), source: 'llm' },
      };
    },
  },
};

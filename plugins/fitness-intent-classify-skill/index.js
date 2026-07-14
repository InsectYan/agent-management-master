'use strict';

const { classifyIntentRule } = require('./lib/classifyIntent');

function needsRuleFallback(result) {
  const output = result.output || {};
  if (result.meta?.stoppedReason === 'no_llm') return true;
  if (!output.intent || !Array.isArray(output.fields)) return true;
  return /占位|请配置 LLM|no_llm/i.test(result.text || '');
}

module.exports = {
  name: 'fitness-intent-classify-skill',
  version: '1.0.0',
  description: 'Fitness 执行意图与字段角色分类（单职责）',
  scheme: 'loop',
  routes: [
    { path: '/api/skills/fitness-intent-classify', method: 'POST', requiresAuth: false },
  ],
  config: {
    llmDefaultProfile: 'ollama-qwen',
    actionDefaults: { POST: 'classify' },
    loop: {
      maxSteps: 1,
      stopWhen: 'llm-done',
      systemPromptFile: 'loop-system.md',
      temperature: 0.1,
      maxTokens: 2048,
      jsonSchemaHint: '{ "done": true, "intent": object, "fields": array }',
      userContextFields: [ 'action', 'item', 'config_json', 'assertions' ],
      stateMerge: { intent: 'replace', fields: 'replace' },
    },
  },
  callbacks: {
    async beforeExecute(ctx, params) {
      const action = params.action || 'classify';
      if (action !== 'classify') {
        const err = new Error(`不支持的动作: ${action}（本 Skill 仅 classify）`);
        err.status = 400;
        throw err;
      }
      return { ...params, action };
    },
    async formatResponse(ctx, result) {
      const params = ctx.params || {};
      if (needsRuleFallback(result)) {
        const output = classifyIntentRule(params);
        return {
          ...result,
          reply: `intent=${output.intent.kind}`,
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

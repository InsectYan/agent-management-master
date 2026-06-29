'use strict';

module.exports = {
  name: 'fitness-explore-skill',
  version: '1.0.0',
  description: 'Fitness TS-05 探索式步骤规划',
  scheme: 'react',
  routes: [
    { path: '/api/skills/fitness-explore', method: 'POST', requiresAuth: false },
  ],
  config: {
    llmDefaultProfile: 'ollama-qwen',
    actionDefaults: { POST: 'plan' },
    react: {
      maxSteps: 1,
      stopWhen: 'llm-done',
      systemPromptFile: 'explore-system.md',
      temperature: 0.3,
      maxTokens: 2048,
      jsonSchemaHint: '{ "done": boolean, "step": object, "reason": string }',
      userContextFields: [ 'goal', 'history_text', 'max_explore_steps' ],
    },
  },
  callbacks: {
    async beforeExecute(ctx, params) {
      if ((params.action || 'plan') !== 'plan') {
        const err = new Error(`不支持的动作: ${params.action}`);
        err.status = 400;
        throw err;
      }
      return { ...params, action: 'plan', history: params.history || [] };
    },

    async enrichContext(ctx, params) {
      const historyText = (params.history || []).map((h, i) =>
        `#${i + 1} ${h.input || ''} => ${h.output || ''} [${h.verdict || ''}]`,
      ).join('\n');
      return {
        action: 'plan',
        goal: params.goal || '',
        history_text: historyText || '(无历史)',
        max_explore_steps: params.max_explore_steps || 5,
      };
    },

    async formatResponse(ctx, result) {
      const output = result.output || {};
      return {
        reply: result.text || output.reason || '探索步骤已规划',
        output: {
          action: 'plan',
          done: output.done === true,
          step: output.step || null,
          reason: output.reason || '',
        },
        meta: { ...result.meta, skill: 'fitness-explore-skill' },
      };
    },
  },
};

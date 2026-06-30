'use strict';

const { planFromCurrentSteps, normalizeStep } = require('./lib/planFallback');

function needsRuleFallback(result) {
  const output = result.output || {};
  if (result.meta?.stoppedReason === 'no_llm') return true;
  if (Array.isArray(output.steps) && output.steps.length) return false;
  if (output.step) return false;
  const text = result.text || '';
  return /占位|请配置 LLM|no_llm/i.test(text) || !output.steps;
}

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
      jsonSchemaHint: '{ "done": boolean, "steps": [{ "path", "method", "extract" }], "reason": string }',
      userContextFields: [ 'current_steps_text', 'env_url', 'goal', 'max_explore_steps' ],
    },
  },
  callbacks: {
    async beforeExecute(ctx, params) {
      if ((params.action || 'plan') !== 'plan') {
        const err = new Error(`不支持的动作: ${params.action}`);
        err.status = 400;
        throw err;
      }
      const currentSteps = params.current_steps || params.history || [];
      return {
        ...params,
        action: 'plan',
        current_steps: currentSteps,
        env_url: params.env_url || '',
      };
    },

    async enrichContext(ctx, params) {
      const currentSteps = params.current_steps || [];
      const currentStepsText = currentSteps.map((s, i) =>
        `#${i + 1} ${s.method || 'GET'} ${s.path || s.url || '/'} extract=${JSON.stringify(s.extract || {})}`,
      ).join('\n') || '(无已执行步骤)';

      return {
        action: 'plan',
        env_url: params.env_url || '',
        current_steps_text: currentStepsText,
        goal: params.goal || params.explore_goal || '',
        max_explore_steps: params.max_explore_steps || 5,
        _current_steps: currentSteps,
      };
    },

    async formatResponse(ctx, result) {
      const output = result.output || {};
      const params = result.meta?.params || {};
      let steps = [];
      let reason = output.reason || '';
      let fallback = false;

      if (Array.isArray(output.steps) && output.steps.length) {
        steps = output.steps.map(s => normalizeStep(s, params.env_url));
      } else if (output.step) {
        steps = [ normalizeStep(output.step, params.env_url) ];
      } else if (needsRuleFallback(result)) {
        const plan = planFromCurrentSteps(params._current_steps || params.current_steps || [], params.env_url);
        steps = plan.steps;
        reason = plan.reason;
        fallback = true;
      }

      return {
        reply: result.text || reason || '探索步骤已规划',
        output: {
          action: 'plan',
          steps,
          done: output.done === true,
          reason,
        },
        meta: { ...result.meta, skill: 'fitness-explore-skill', step_count: steps.length, fallback },
      };
    },
  },
};

'use strict';

const { resolveFixedRule } = require('./lib/resolveFixed');

function needsRuleFallback(result) {
  const output = result.output || {};
  if (result.meta?.stoppedReason === 'no_llm') return true;
  if (!Array.isArray(output.missing_fixed) && !Array.isArray(output.resolved_fixed)) return true;
  return /占位|请配置 LLM|no_llm/i.test(result.text || '');
}

module.exports = {
  name: 'fitness-fixed-resolve-skill',
  version: '1.0.0',
  description: '从项目 env/模板目录解析固定值并报告 missing_fixed（单职责）',
  scheme: 'loop',
  routes: [
    { path: '/api/skills/fitness-fixed-resolve', method: 'POST', requiresAuth: false },
  ],
  config: {
    llmDefaultProfile: 'ollama-qwen',
    actionDefaults: { POST: 'resolve' },
    loop: {
      maxSteps: 1,
      stopWhen: 'llm-done',
      systemPromptFile: 'loop-system.md',
      temperature: 0.1,
      maxTokens: 2048,
      jsonSchemaHint: '{ "done": true, "resolved_fixed": [], "bindings": {}, "missing_fixed": [], "skip_resolve_fields": [], "ready": boolean }',
      userContextFields: [ 'action', 'fields', 'intent', 'env_catalog', 'api_templates_catalog', 'project_vars' ],
      stateMerge: {
        resolved_fixed: 'replace',
        bindings: 'replace',
        missing_fixed: 'replace',
        skip_resolve_fields: 'replace',
        ready: 'replace',
      },
    },
  },
  callbacks: {
    async beforeExecute(ctx, params) {
      const action = params.action || 'resolve';
      if (action !== 'resolve') {
        const err = new Error(`不支持的动作: ${action}（本 Skill 仅 resolve）`);
        err.status = 400;
        throw err;
      }
      return { ...params, action };
    },
    async formatResponse(ctx, result) {
      const params = ctx.params || {};
      if (needsRuleFallback(result)) {
        const output = resolveFixedRule(params);
        return {
          ...result,
          reply: output.ready ? '固定值已解析' : `缺少固定字段 ${output.missing_fixed.length} 项`,
          output: { ...output, source: 'rule_fallback' },
          meta: { ...(result.meta || {}), fallback: 'rule', skill: 'fitness-fixed-resolve-skill' },
        };
      }
      return {
        ...result,
        output: {
          ...(result.output || {}),
          source: 'llm',
        },
      };
    },
  },
};

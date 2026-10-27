'use strict';

const { parseReviewStep } = require('./lib/parseStep');

module.exports = {
  name: 'novel-review-skill',
  project: 'novel',
  version: '0.1.0',
  description: '对照设定列出一致性问题，不写小说库',
  scheme: 'loop',
  routes: [
    {
      path: '/api/skills/novel-review/invoke',
      method: 'POST',
      description: '一致性补充',
      requiresAuth: false,
    },
  ],
  dbTables: [],
  memoryConfig: { enabled: true, type: 'file', scope: 'work' },
  config: {
    llmDefaultProfile: 'ollama-qwen',
    actionDefaults: { POST: 'check_consistency' },
    loop: {
      maxSteps: 1,
      stopWhen: 'llm-done',
      systemPromptFile: 'loop-system.md',
      temperature: 0.2,
      maxTokens: 4096,
      localMaxTokens: 4096,
      llmTimeoutMs: 180000,
      localLlmTimeoutMs: 180000,
      parseStepOutput: parseReviewStep,
      jsonSchemaHint: '{"done":true,"continue":false,"thinking":"","reply":"","summary":"","findings":[{"module":"characters","code":"","severity":"warning","entity":"","message":"","evidence":"","suggestion":""}]}',
      userContextFields: [ 'action', 'bound_context', 'deterministic_findings', 'module', 'chapter_id' ],
      initialState: { thinking: '', reply: '', summary: '', findings: [] },
      stateMerge: {
        thinking: 'replace',
        reply: 'replace',
        summary: 'replace',
        findings: 'replace',
      },
    },
  },
  callbacks: {
    async beforeExecute(ctx, params) {
      const action = params.action || 'check_consistency';
      const allowed = new Set([ 'check_consistency', 'validate_module', 'validate_chapter' ]);
      if (!allowed.has(action)) {
        const err = new Error('无效的核检 action');
        err.status = 400;
        throw err;
      }
      return {
        ...params,
        action,
        topic: action,
        deterministic_findings: Array.isArray(params.deterministic_findings) ? params.deterministic_findings : [],
      };
    },
    async formatResponse(ctx, result) {
      const output = result.output || {};
      return {
        reply: output.reply || output.summary || '',
        findings: Array.isArray(output.findings) ? output.findings : [],
        output: {
          reply: output.reply || '',
          findings: Array.isArray(output.findings) ? output.findings : [],
        },
        meta: result.meta,
      };
    },
  },
};

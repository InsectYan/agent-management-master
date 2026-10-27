'use strict';

const { readProductionSource } = require('../_shared/productionSource');
const { parseScriptStep } = require('./lib/parseStep');

module.exports = {
  name: 'cartoon-script-skill',
  project: 'cartoon',
  version: '0.1.0',
  description: '把章节快照整理成短剧本，不提交 ComfyUI',
  scheme: 'loop',
  routes: [
    {
      path: '/api/skills/cartoon-script/invoke',
      method: 'POST',
      description: '整理剧本',
      requiresAuth: false,
    },
  ],
  dbTables: [],
  memoryConfig: { enabled: true, type: 'file', scope: 'work' },
  config: {
    llmDefaultProfile: 'ollama-qwen',
    actionDefaults: { POST: 'draft' },
    loop: {
      maxSteps: 1,
      stopWhen: 'llm-done',
      systemPromptFile: 'loop-system.md',
      temperature: 0.4,
      maxTokens: 2048,
      localMaxTokens: 2048,
      llmTimeoutMs: 180000,
      localLlmTimeoutMs: 180000,
      parseStepOutput: parseScriptStep,
      jsonSchemaHint: '{"done":true,"continue":false,"thinking":"","reply":"","summary":"","script_data":{"summary":"","characters":[{"name":"","look":""}],"scenes":[{"title":"","summary":""}]}}',
      userContextFields: [ 'chapter_title', 'body', 'visual_style' ],
      initialState: { thinking: '', reply: '', summary: '', script_data: {} },
      stateMerge: {
        thinking: 'replace',
        reply: 'replace',
        summary: 'replace',
        script_data: 'replace',
      },
    },
  },
  callbacks: {
    async beforeExecute(ctx, params) {
      const body = String(params.body || '').trim();
      if (!body) {
        const err = new Error('需要章节正文');
        err.status = 400;
        throw err;
      }
      return {
        ...params,
        ...readProductionSource(params),
        action: 'draft',
        topic: String(params.chapter_title || '未命名章节').slice(0, 80),
        body: body.slice(0, 4000),
        visual_style: String(params.visual_style || ''),
      };
    },
  },
};

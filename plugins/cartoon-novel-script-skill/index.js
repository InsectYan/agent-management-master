'use strict';

const { parseNovelScriptStep } = require('./lib/parseStep');

module.exports = {
  name: 'cartoon-novel-script-skill',
  project: 'cartoon',
  version: '0.1.0',
  description: '把小说原文收成第一人称漫剧短视频剧本，不拆场次',
  scheme: 'loop',
  routes: [
    {
      path: '/api/skills/cartoon-novel-script/invoke',
      method: 'POST',
      description: '小说转剧本',
      requiresAuth: false,
    },
  ],
  dbTables: [],
  memoryConfig: { enabled: false, type: 'file', scope: 'work' },
  config: {
    llmDefaultProfile: 'ollama-qwen',
    actionDefaults: { POST: 'draft' },
    loop: {
      maxSteps: 2,
      stopWhen: 'llm-done',
      systemPromptFile: 'loop-system.md',
      temperature: 0.4,
      maxTokens: 32768,
      localMaxTokens: 32768,
      llmTimeoutMs: 21600000,
      localLlmTimeoutMs: 21600000,
      parseStepOutput: parseNovelScriptStep,
      jsonSchemaHint: '{"done":true,"continue":false,"thinking":"","reply":"已把小说转成剧本","summary":"已把小说转成剧本","script_text":""}',
      userContextFields: [ 'chapter_title', 'body', 'era_note' ],
      initialState: { thinking: '', reply: '', summary: '', script_text: '' },
      stateMerge: {
        thinking: 'replace',
        reply: 'replace',
        summary: 'replace',
        script_text: 'replace',
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
        action: 'draft',
        topic: String(params.chapter_title || '未命名章节').slice(0, 80),
        era_note: String(params.era_note || '').slice(0, 2000),
        body,
      };
    },
  },
};

'use strict';

const { parseStoryboardStep } = require('./lib/parseStep');

module.exports = {
  name: 'cartoon-storyboard-skill',
  project: 'cartoon',
  version: '0.1.0',
  description: '把剧本拆成分镜行，不写小说正文，不提交 ComfyUI',
  scheme: 'loop',
  routes: [
    {
      path: '/api/skills/cartoon-storyboard/invoke',
      method: 'POST',
      description: '拆分镜',
      requiresAuth: false,
    },
  ],
  dbTables: [],
  memoryConfig: { enabled: false },
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
      parseStepOutput: parseStoryboardStep,
      jsonSchemaHint: '{"done":true,"continue":false,"thinking":"","reply":"","summary":"","shots":[{"description":"","shot_size":"中景","camera_move":"固定"}]}',
      userContextFields: [ 'script_data', 'body' ],
      initialState: { thinking: '', reply: '', summary: '', shots: [] },
      stateMerge: {
        thinking: 'replace',
        reply: 'replace',
        summary: 'replace',
        shots: 'replace',
      },
    },
  },
  callbacks: {
    async beforeExecute(ctx, params) {
      const script = params.script_data;
      if (!script || typeof script !== 'object') {
        const err = new Error('需要剧本');
        err.status = 400;
        throw err;
      }
      return {
        ...params,
        action: 'draft',
        topic: '分镜',
        script_data: script,
        body: String(params.body || '').slice(0, 2000),
      };
    },
  },
};

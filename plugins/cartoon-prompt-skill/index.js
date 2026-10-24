'use strict';

const { readProductionSource } = require('../_shared/productionSource');
const { parsePromptStep } = require('./lib/parseStep');

module.exports = {
  name: 'cartoon-prompt-skill',
  project: 'cartoon',
  version: '0.1.0',
  description: '为分镜写正负提示词，不改节点图，不提交 ComfyUI',
  scheme: 'loop',
  routes: [
    {
      path: '/api/skills/cartoon-prompt/invoke',
      method: 'POST',
      description: '写提示词',
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
      parseStepOutput: parsePromptStep,
      jsonSchemaHint: '{"done":true,"continue":false,"thinking":"","reply":"","summary":"","prompts":[{"index":0,"positive_zh":"","negative_zh":""}]}',
      userContextFields: [ 'shots', 'visual_style' ],
      initialState: { thinking: '', reply: '', summary: '', prompts: [] },
      stateMerge: {
        thinking: 'replace',
        reply: 'replace',
        summary: 'replace',
        prompts: 'replace',
      },
    },
  },
  callbacks: {
    async beforeExecute(ctx, params) {
      const shots = Array.isArray(params.shots) ? params.shots : [];
      if (!shots.length) {
        const err = new Error('需要分镜');
        err.status = 400;
        throw err;
      }
      return {
        ...params,
        ...readProductionSource(params),
        action: 'draft',
        topic: '提示词',
        shots: shots.slice(0, 6),
        visual_style: String(params.visual_style || ''),
      };
    },
  },
};

'use strict';

const { parseSheetStep } = require('./lib/parseStep');

module.exports = {
  name: 'cartoon-asset-sheet-skill',
  project: 'cartoon',
  version: '0.1.0',
  description: '为人物或场景写一张设定总图的生图提示词，不写视频提示词',
  scheme: 'loop',
  routes: [
    {
      path: '/api/skills/cartoon-asset-sheet/invoke',
      method: 'POST',
      description: '写设定总图提示词',
      requiresAuth: false,
    },
  ],
  dbTables: [],
  memoryConfig: { enabled: false, type: 'file', scope: 'work' },
  config: {
    llmDefaultProfile: 'ollama-qwen',
    actionDefaults: { POST: 'draft' },
    loop: {
      maxSteps: 1,
      stopWhen: 'llm-done',
      systemPromptFile: 'loop-system.md',
      temperature: 0.3,
      maxTokens: 2048,
      localMaxTokens: 2048,
      llmTimeoutMs: 21600000,
      localLlmTimeoutMs: 21600000,
      parseStepOutput: parseSheetStep,
      jsonSchemaHint: '{"done":true,"continue":false,"thinking":"","reply":"","summary":"","prompt":""}',
      userContextFields: [ 'kind', 'name', 'look', 'note', 'visual_style_label', 'visual_style_prompt', 'sparse', 'av_nude' ],
      initialState: { thinking: '', reply: '', summary: '', prompt: '' },
      stateMerge: {
        thinking: 'replace',
        reply: 'replace',
        summary: 'replace',
        prompt: 'replace',
      },
    },
  },
  callbacks: {
    async beforeExecute(ctx, params) {
      const kind = params.kind === 'scene' ? 'scene' : (params.kind === 'character' ? 'character' : '');
      const name = String(params.name || '').trim();
      if (!kind || !name) {
        const err = new Error('需要人物或场景的名称');
        err.status = 400;
        throw err;
      }
      return {
        action: 'draft',
        topic: kind === 'scene' ? `场景设定图 ${name}` : `人物设定图 ${name}`,
        kind,
        name,
        look: String(params.look || '').slice(0, 1500),
        note: String(params.note || '').slice(0, 500),
        visual_style_label: String(params.visual_style_label || '').slice(0, 80),
        visual_style_prompt: String(params.visual_style_prompt || '').slice(0, 2000),
        sparse: params.sparse ? '1' : '0',
        av_nude: params.av_nude === true || params.av_nude === 1 || params.av_nude === '1' || params.av_nude === 'true',
      };
    },
  },
};

'use strict';

const fs = require('fs');
const path = require('path');
const { readProductionSource } = require('../_shared/productionSource');
const { parsePromptStep } = require('../cartoon-prompt-skill/lib/parseStep');

function loadBasePrompt() {
  return fs.readFileSync(path.join(__dirname, 'templates', 'loop-system.md'), 'utf8').trim();
}

module.exports = {
  name: 'cartoon-av-prompt-skill',
  project: 'cartoon',
  version: '0.1.0',
  description: '常规提示词写完后，为已开启 AV 的漫剧、短剧再收口一次画面提示词',
  scheme: 'loop',
  routes: [
    {
      path: '/api/skills/cartoon-av-prompt/invoke',
      method: 'POST',
      description: '写 AV 视频提示词',
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
      temperature: 0.3,
      maxTokens: 32768,
      localMaxTokens: 32768,
      llmTimeoutMs: 900000,
      localLlmTimeoutMs: 900000,
      parseStepOutput: parsePromptStep,
      jsonSchemaHint: '{"done":true,"continue":false,"thinking":"","reply":"","summary":"","prompts":[{"index":0,"positive_zh":"","negative_zh":"","production_note":""}]}',
      userContextFields: [
        'shots',
        'body',
        'visual_style',
        'visual_style_label',
        'visual_style_prompt',
        'content_type',
        'av_mode',
      ],
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
      const styleLine = [
        '画面风格：' + String(params.visual_style_label || params.visual_style || '未指定'),
        '风格描述：' + String(params.visual_style_prompt || ''),
      ].join('\n');
      return {
        ...params,
        ...readProductionSource(params),
        action: 'draft',
        topic: '收口 AV 视频提示词',
        shots,
        av_mode: true,
        loop_system_prompt: `${loadBasePrompt()}\n\n${styleLine}`,
      };
    },
  },
};

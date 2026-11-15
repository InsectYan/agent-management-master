'use strict';

const fs = require('fs');
const path = require('path');
const { readProductionSource } = require('../_shared/productionSource');
const { buildPromptSystemPrompt, detectXianxia } = require('../_shared/cartoonPromptKit');
const { parsePromptStep } = require('./lib/parseStep');

function loadBasePrompt() {
  const filePath = path.join(__dirname, 'templates', 'loop-system.md');
  return fs.readFileSync(filePath, 'utf8').trim();
}

module.exports = {
  name: 'cartoon-prompt-skill',
  project: 'cartoon',
  version: '0.4.0',
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
  memoryConfig: { enabled: true, type: 'file', scope: 'work' },
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
      parseStepOutput: parsePromptStep,
      jsonSchemaHint: '{"done":true,"continue":false,"thinking":"","prompts":[{"index":0,"positive_zh":"【风格】【场记】【时长】【时间轴】","frame_start_zh":"【风格】【场记】【画面】【光影】【表演】","frame_end_zh":"【风格】【场记】【画面】【光影】【表演】","negative_zh":"禁止水印，禁止字幕","production_note":""}],"reply":"已写入","summary":"已写入"}',
      userContextFields: [
        'shots',
        'body',
        'repair_note',
        'visual_style',
        'visual_style_label',
        'visual_style_prompt',
        'genre',
        'genre_subcategory',
        'is_xianxia',
        'content_type',
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
      const routeInput = {
        ...params,
        visual_style: String(params.visual_style || ''),
        visual_style_label: String(params.visual_style_label || ''),
        visual_style_prompt: String(params.visual_style_prompt || ''),
        genre: String(params.genre || ''),
        genre_subcategory: String(params.genre_subcategory || ''),
      };
      const isXianxia = detectXianxia(routeInput);
      return {
        ...params,
        ...readProductionSource(params),
        action: 'draft',
        topic: isXianxia ? '修仙漫剧提示词' : '漫剧提示词',
        shots,
        body: '',
        visual_style: routeInput.visual_style,
        visual_style_label: routeInput.visual_style_label,
        visual_style_prompt: routeInput.visual_style_prompt,
        genre: routeInput.genre,
        genre_subcategory: routeInput.genre_subcategory,
        is_xianxia: isXianxia,
        loop_system_prompt: buildPromptSystemPrompt(loadBasePrompt(), { ...routeInput, is_xianxia: isXianxia }),
      };
    },
  },
};

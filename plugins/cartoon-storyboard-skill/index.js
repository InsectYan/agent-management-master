'use strict';

const fs = require('fs');
const path = require('path');
const { readProductionSource } = require('../_shared/productionSource');
const { buildStoryboardSystemPrompt, detectXianxia } = require('../_shared/cartoonPromptKit');
const { parseStoryboardStep } = require('./lib/parseStep');

function loadTemplate(name) {
  const filePath = path.join(__dirname, 'templates', name);
  return fs.readFileSync(filePath, 'utf8').trim();
}

function truthy(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

module.exports = {
  name: 'cartoon-storyboard-skill',
  project: 'cartoon',
  version: '0.3.0',
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
  memoryConfig: { enabled: true, type: 'file', scope: 'work' },
  config: {
    llmDefaultProfile: 'ollama-qwen',
    actionDefaults: { POST: 'draft' },
    loop: {
      maxSteps: 1,
      stopWhen: 'llm-done',
      systemPromptFile: 'loop-system.md',
      temperature: 0.4,
      maxTokens: 16384,
      localMaxTokens: 16384,
      llmTimeoutMs: 300000,
      localLlmTimeoutMs: 300000,
      parseStepOutput: parseStoryboardStep,
      jsonSchemaHint: '{"done":true,"continue":false,"thinking":"","reply":"","summary":"","shots":[{"description":"","duration_sec":10,"shot_size":"中景","camera_move":"固定","dialogue":""}]}',
      userContextFields: [
        'script_data',
        'body',
        'seed_shot',
        'outline_only',
        'expand_one',
        'visual_style',
        'visual_style_label',
        'visual_style_prompt',
        'genre',
        'genre_subcategory',
        'is_xianxia',
        'content_type',
      ],
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
      const body = String(params.body || '').slice(0, 20000);
      const outlineOnly = truthy(params.outline_only);
      const expandOne = truthy(params.expand_one);
      const routeInput = {
        ...params,
        body,
        visual_style: String(params.visual_style || ''),
        visual_style_label: String(params.visual_style_label || ''),
        visual_style_prompt: String(params.visual_style_prompt || ''),
        genre: String(params.genre || ''),
        genre_subcategory: String(params.genre_subcategory || ''),
      };
      const isXianxia = detectXianxia(routeInput);
      let loopSystemPrompt;
      let topic = isXianxia ? '修仙漫剧分镜' : '漫剧分镜';
      if (outlineOnly) {
        topic = '漫剧镜头大纲';
        loopSystemPrompt = loadTemplate('outline-system.md');
      } else if (expandOne) {
        topic = '漫剧单镜扩写';
        loopSystemPrompt = [
          loadTemplate('expand-one-system.md'),
          '',
          'seed_shot：' + JSON.stringify(params.seed_shot || {}),
        ].join('\n');
      } else {
        loopSystemPrompt = buildStoryboardSystemPrompt(loadTemplate('loop-system.md'), {
          ...routeInput,
          is_xianxia: isXianxia,
        });
      }
      return {
        ...params,
        ...readProductionSource(params),
        action: 'draft',
        topic,
        script_data: script,
        body,
        seed_shot: params.seed_shot || null,
        outline_only: outlineOnly,
        expand_one: expandOne,
        visual_style: routeInput.visual_style,
        visual_style_label: routeInput.visual_style_label,
        visual_style_prompt: routeInput.visual_style_prompt,
        genre: routeInput.genre,
        genre_subcategory: routeInput.genre_subcategory,
        is_xianxia: isXianxia,
        loop_system_prompt: loopSystemPrompt,
      };
    },
  },
};

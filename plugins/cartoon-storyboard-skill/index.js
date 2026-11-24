'use strict';

const fs = require('fs');
const path = require('path');
const { readProductionSource } = require('../_shared/productionSource');
const { buildStoryboardSystemPrompt, detectXianxia } = require('../_shared/cartoonPromptKit');
const { enrichStylePrompt } = require('../_shared/styleLibrary');
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
  version: '0.3.1',
  description: '把已定稿剧本拆成分镜行，不回读章节原文，不提交 ComfyUI',
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
  memoryConfig: { enabled: false, type: 'file', scope: 'work' },
  config: {
    llmDefaultProfile: 'ollama-qwen',
    actionDefaults: { POST: 'draft' },
    loop: {
      maxSteps: 1,
      stopWhen: 'llm-done',
      systemPromptFile: 'loop-system.md',
      temperature: 0.4,
      maxTokens: 32768,
      localMaxTokens: 32768,
      llmTimeoutMs: 21600000,
      localLlmTimeoutMs: 21600000,
      parseStepOutput: parseStoryboardStep,
      jsonSchemaHint: '{"done":true,"continue":false,"thinking":"","reply":"","summary":"","shots":[{"description":"","scene_index":1,"duration_sec":10,"shot_sizes":["全景","中景","近景"],"camera_moves":["固定","推","摇"],"dialogue":""}],"omissions":[{"target":"","reason":""}]}',
      userContextFields: [
        'script_data',
        'scene_spans',
        'source_paragraphs',
        'body',
        'seed_shot',
        'outline_only',
        'expand_one',
        'min_shots',
        'scene_index',
        'visual_style',
        'visual_style_label',
        'visual_style_prompt',
        'genre',
        'genre_subcategory',
        'is_xianxia',
        'content_type',
        'av_mode',
        'asset_facts',
        'prev_shot',
        'repair_note',
      ],
      initialState: { thinking: '', reply: '', summary: '', shots: [], omissions: [] },
      stateMerge: {
        thinking: 'replace',
        reply: 'replace',
        summary: 'replace',
        shots: 'replace',
        omissions: 'replace',
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
      const outlineOnly = truthy(params.outline_only);
      const expandOne = truthy(params.expand_one);
      const body = expandOne ? '' : String(params.body || '');
      const routeInput = {
        ...params,
        body,
        visual_style: String(params.visual_style || ''),
        visual_style_label: String(params.visual_style_label || ''),
        visual_style_prompt: enrichStylePrompt(params),
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
        const seed = params.seed_shot && typeof params.seed_shot === 'object' ? { ...params.seed_shot } : {};
        delete seed.prev_shot;
        const blocks = [
          loadTemplate('expand-one-system.md'),
          '',
          'seed_shot：' + JSON.stringify(seed),
        ];
        const prevShot = params.prev_shot || params.seed_shot?.prev_shot || null;
        if (prevShot) blocks.push('prev_shot：' + JSON.stringify(prevShot));
        loopSystemPrompt = blocks.join('\n');
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
        seed_shot: params.seed_shot && typeof params.seed_shot === 'object'
          ? (({ prev_shot, ...seed }) => seed)(params.seed_shot)
          : (params.seed_shot || null),
        scene_index: outlineOnly && Number(params.scene_index) > 0 ? Math.round(Number(params.scene_index)) : undefined,
        prev_shot: (expandOne || outlineOnly) ? (params.prev_shot || params.seed_shot?.prev_shot || null) : undefined,
        source_paragraphs: outlineOnly && Array.isArray(params.source_paragraphs) ? params.source_paragraphs : undefined,
        scene_spans: outlineOnly && Array.isArray(params.scene_spans) ? params.scene_spans : undefined,
        loop_json_schema_hint: outlineOnly
          ? '{"done":true,"continue":false,"thinking":"","reply":"","summary":"","shots":[{"description":"","scene_index":1,"duration_sec":10,"shot_sizes":["中景"],"camera_moves":["固定"],"dialogue":"","source_indexes":[1]}],"omissions":[]}'
          : undefined,
        outline_only: outlineOnly,
        expand_one: expandOne,
        min_shots: outlineOnly
          ? (Number(params.min_shots) > 0
            ? Math.round(Number(params.min_shots))
            : Math.max(minStoryUnits(body.length), 1))
          : undefined,
        visual_style: routeInput.visual_style,
        visual_style_label: routeInput.visual_style_label,
        visual_style_prompt: routeInput.visual_style_prompt,
        genre: routeInput.genre,
        genre_subcategory: routeInput.genre_subcategory,
        is_xianxia: isXianxia,
        loop_system_prompt: [
          loopSystemPrompt,
          String(params.repair_note || '').trim()
            ? `上一稿被退回：\n${String(params.repair_note).trim()}`
            : '',
        ].filter(Boolean).join('\n\n'),
      };
    },
  },
};

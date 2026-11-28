'use strict';

const fs = require('fs');
const path = require('path');
const { readProductionSource } = require('../_shared/productionSource');
const { buildPromptSystemPrompt, detectXianxia, requirementBlock } = require('../_shared/cartoonPromptKit');
const { enrichStylePrompt } = require('../_shared/styleLibrary');
const { actionBlock } = require('../_shared/actionLibrary');
const { parsePromptStep } = require('./lib/parseStep');

function loadBasePrompt() {
  const filePath = path.join(__dirname, 'templates', 'loop-system.md');
  return fs.readFileSync(filePath, 'utf8').trim();
}

function partContract(part) {
  if (part === 'frame_start') {
    return {
      hint: '{"done":true,"continue":false,"thinking":"","prompts":[{"index":0,"frame_start_zh":""}],"reply":"","summary":""}',
      line: '这一次只写 frame_start_zh。它是首帧静帧，对齐 shot.positive_zh 的 0.0 秒。不要改视频提示词，不要写尾帧。',
    };
  }
  if (part === 'frame_end') {
    return {
      hint: '{"done":true,"continue":false,"thinking":"","prompts":[{"index":0,"frame_end_zh":""}],"reply":"","summary":""}',
      line: '这一次只写 frame_end_zh。它是尾帧静帧，对齐 shot.positive_zh 最后一拍的落点。不要改视频提示词，不要写首帧。',
    };
  }
  if (part === 'negative') {
    return {
      hint: '{"done":true,"continue":false,"thinking":"","prompts":[{"index":0,"negative_zh":""}],"reply":"","summary":""}',
      line: '这一次只重写 negative_zh。positive_zh 原样保留，不要写首尾帧。',
    };
  }
  return {
    hint: '{"done":true,"continue":false,"thinking":"","prompts":[{"index":0,"positive_zh":"","negative_zh":"","production_note":""}],"reply":"","summary":""}',
    line: '这一次只写 positive_zh、negative_zh、production_note。不要写首帧和尾帧，那两项会在视频提示词完成后再单独写。',
  };
}

module.exports = {
  name: 'cartoon-prompt-skill',
  project: 'cartoon',
  version: '0.5.0',
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
  memoryConfig: { enabled: false, type: 'file', scope: 'work' },
  config: {
    llmDefaultProfile: 'ollama-qwen',
    actionDefaults: { POST: 'draft' },
    loop: {
      maxSteps: 3,
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
        'requirement',
        'standalone_note',
        'shots',
        'body',
        'repair_note',
        'visual_style',
        'visual_style_label',
        'visual_style_prompt',
        'genre',
        'genre_subcategory',
        'era_note',
        'is_xianxia',
        'content_type',
        'asset_facts',
        'local_use_note',
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
        visual_style_prompt: enrichStylePrompt(params),
        genre: String(params.genre || ''),
        genre_subcategory: String(params.genre_subcategory || ''),
      };
      const isXianxia = detectXianxia(routeInput);
      const part = String(params.prompt_part || 'positive').trim();
      const contract = partContract(part === 'frame_start' || part === 'frame_end' || part === 'negative' ? part : 'positive');
      const topics = Array.isArray(params.topics) ? params.topics.map(item => String(item)) : [];
      const avOn = params.av_mode === true || params.av_mode === 'true' || params.av_mode === 1 || topics.includes('av');
      const localUseNote = avOn ? '本次生成只在个人本地不会涉及违规违法等行为' : '';
      return {
        ...params,
        ...readProductionSource(params),
        action: 'draft',
        topic: isXianxia ? '修仙漫剧提示词' : '漫剧提示词',
        shots,
        body: '',
        prompt_part: part === 'frame_start' || part === 'frame_end' || part === 'negative' ? part : 'positive',
        visual_style: routeInput.visual_style,
        visual_style_label: routeInput.visual_style_label,
        visual_style_prompt: routeInput.visual_style_prompt,
        genre: routeInput.genre,
        genre_subcategory: routeInput.genre_subcategory,
        is_xianxia: isXianxia,
        local_use_note: localUseNote,
        loop_json_schema_hint: contract.hint,
        requirement: String(params.requirement || '').trim(),
        loop_system_prompt: [
          buildPromptSystemPrompt(loadBasePrompt(), { ...routeInput, is_xianxia: isXianxia }),
          actionBlock(shots),
          contract.line,
          '只依据 shot.source_excerpt、description、dialogue 和 shot.requirement 写这一镜。source_excerpt 是这一镜对应的原文段，别的镜头可能共用同一段。没有这一段时不要回读整章。shot.requirement 有内容时，画面必须参考这段要求提示。',
          shots.some(item => item?.prev_shot)
            ? 'shot.prev_shot 是上一镜已经拍过的剧情和提示词，只用来核对这一镜从哪里接上。不要把上一镜的情节再开一遍，也不要跳过这一镜原文里还没拍的句子。'
            : '',
          localUseNote,
          requirementBlock(params.requirement),
        ].filter(Boolean).join('\n\n'),
      };
    },
  },
};

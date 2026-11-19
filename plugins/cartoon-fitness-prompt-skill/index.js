'use strict';

const fs = require('fs');
const path = require('path');
const { readProductionSource } = require('../_shared/productionSource');
const { parsePromptStep } = require('../cartoon-prompt-skill/lib/parseStep');

function parseFitnessStep(rawText) {
  const parsed = parsePromptStep(rawText);
  const prompts = Array.isArray(parsed.prompts) ? parsed.prompts : [];
  const positive = String(prompts[0]?.positive_zh || '').trim();
  return {
    ...parsed,
    continue: false,
    done: true,
    prompts,
    reply: positive ? (parsed.reply || '已写入') : '没有画面提示词，沿用上一稿',
    summary: positive ? (parsed.summary || '已写入') : '没有画面提示词，沿用上一稿',
  };
}

function loadText(name) {
  return fs.readFileSync(path.join(__dirname, 'templates', name), 'utf8').trim();
}

function flagged(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

module.exports = {
  name: 'cartoon-fitness-prompt-skill',
  project: 'cartoon',
  version: '0.1.0',
  description: '健身专题收口视频提示词。把已有动作写成可跟练的姿态路径，不改剧情和对白',
  scheme: 'loop',
  routes: [
    {
      path: '/api/skills/cartoon-fitness-prompt/invoke',
      method: 'POST',
      description: '写健身视频提示词',
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
      llmTimeoutMs: 21600000,
      localLlmTimeoutMs: 21600000,
      parseStepOutput: parseFitnessStep,
      jsonSchemaHint: '{"done":true,"continue":false,"thinking":"","prompts":[{"index":0,"positive_zh":"【风格】【场记】【时长】【时间轴】","frame_start_zh":"","frame_end_zh":"","negative_zh":"禁止水印，禁止字幕","production_note":""}],"reply":"已写入","summary":"已写入"}',
      userContextFields: [
        'shots',
        'visual_style',
        'visual_style_label',
        'visual_style_prompt',
        'content_type',
        'topics',
        'asset_facts',
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
      const topics = Array.isArray(params.topics) ? params.topics.map(item => String(item)) : [];
      if (!topics.includes('fitness') && !flagged(params.fitness)) {
        const err = new Error('项目没有勾选健身专题');
        err.status = 400;
        throw err;
      }
      const styleLine = [
        '画面风格：' + String(params.visual_style_label || params.visual_style || '未指定'),
        '风格描述：' + String(params.visual_style_prompt || ''),
      ].join('\n');
      const step = '项目已勾选健身，这一镜走收口。这一次只改写 positive_zh。时长保持这一镜已有的秒数，按镜头内容落在 5 到 15 秒，不要改成固定秒数。';
      return {
        ...params,
        ...readProductionSource(params),
        action: 'draft',
        topic: '收口健身视频提示词',
        shots,
        body: '',
        topics,
        loop_system_prompt: [
          loadText('loop-system.md'),
          styleLine,
          step,
        ].join('\n\n'),
      };
    },
  },
};

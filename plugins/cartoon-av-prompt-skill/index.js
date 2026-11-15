'use strict';

const fs = require('fs');
const path = require('path');
const { readProductionSource } = require('../_shared/productionSource');
const { parsePromptStep } = require('../cartoon-prompt-skill/lib/parseStep');
const { actionBlock, anatomyBlock } = require('../_shared/actionLibrary');

function parseAvStep(rawText) {
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

module.exports = {
  name: 'cartoon-av-prompt-skill',
  project: 'cartoon',
  version: '0.3.0',
  description: 'AV 项目收口视频和静帧。动作细节读取公共动作知识库。双方都已写明满二十一岁且命中亲密动作时，再引用男女体征知识库',
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
      llmTimeoutMs: 21600000,
      localLlmTimeoutMs: 21600000,
      parseStepOutput: parseAvStep,
      jsonSchemaHint: '{"done":true,"continue":false,"thinking":"","prompts":[{"index":0,"positive_zh":"【风格】【场记】【时长】【时间轴】","frame_start_zh":"【风格】【场记】【画面】【光影】【表演】","frame_end_zh":"【风格】【场记】【画面】【光影】【表演】","negative_zh":"禁止水印，禁止字幕","production_note":""}],"reply":"已写入","summary":"已写入"}',
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
      const library = actionBlock(shots);
      return {
        ...params,
        ...readProductionSource(params),
        action: 'draft',
        topic: '收口 AV 视频提示词',
        shots,
        body: '',
        av_mode: true,
        loop_system_prompt: [
          loadText('loop-system.md'),
          styleLine,
          library || '这一镜没有命中动作知识库。按场记写单人的起始姿态、肢体路径和结束姿态，不补亲密身体接触。',
          anatomyBlock(shots) || '这一镜不引用男女体征知识库。不要补写镜头里没有的乳房、外阴、阴茎或肛门。',
        ].join('\n\n'),
      };
    },
  },
};

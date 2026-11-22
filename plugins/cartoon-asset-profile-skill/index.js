'use strict';

const { parseProfileStep } = require('./lib/parseStep');

module.exports = {
  name: 'cartoon-asset-profile-skill',
  project: 'cartoon',
  version: '0.1.0',
  description: '按一章正文抽出人物和场景的基础描述。原文优先，缺的外形槽按定性轻推。不生图，不写剧本',
  scheme: 'loop',
  routes: [
    {
      path: '/api/skills/cartoon-asset-profile/invoke',
      method: 'POST',
      description: '抽取资产基础描述',
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
      temperature: 0.2,
      maxTokens: 8192,
      localMaxTokens: 8192,
      llmTimeoutMs: 21600000,
      localLlmTimeoutMs: 21600000,
      parseStepOutput: parseProfileStep,
      jsonSchemaHint: '{"done":true,"continue":false,"thinking":"","reply":"","summary":"","characters":[{"name":"","tone":"正向","tone_words":"","slots":{"性别":{"text":"男","source":"原文","evidence":"","basis":""},"年龄":{"text":"","source":"轻推","evidence":"","basis":""}},"chapter_costume":""}],"scenes":[{"name":"","slots":{"空间":{"text":"室内","source":"原文","evidence":"","basis":""}}}]}',
      userContextFields: [ 'chapter_title', 'body', 'script_cast', 'known_assets', 'visual_style_label', 'av_mode' ],
      initialState: { thinking: '', reply: '', summary: '', characters: [], scenes: [] },
      stateMerge: {
        thinking: 'replace',
        reply: 'replace',
        summary: 'replace',
        characters: 'replace',
        scenes: 'replace',
      },
    },
  },
  callbacks: {
    async beforeExecute(ctx, params) {
      const body = String(params.body || '').trim();
      if (!body) {
        const err = new Error('需要章节正文');
        err.status = 400;
        throw err;
      }
      return {
        action: 'draft',
        topic: `资产描述 ${String(params.chapter_title || '').trim() || '本章'}`,
        chapter_title: String(params.chapter_title || '').trim().slice(0, 80),
        body: body.slice(0, 12000),
        known_assets: String(params.known_assets || '').slice(0, 6000),
        script_cast: String(params.script_cast || '').slice(0, 2000),
        visual_style_label: String(params.visual_style_label || '').slice(0, 80),
        av_mode: params.av_mode === true || params.av_mode === 1 || params.av_mode === '1' || params.av_mode === 'true',
      };
    },
  },
};

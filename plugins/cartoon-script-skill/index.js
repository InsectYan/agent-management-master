'use strict';

const { readProductionSource } = require('../_shared/productionSource');
const { minStoryUnits } = require('../_shared/storyCoverage');
const { parseScriptStep } = require('./lib/parseStep');

module.exports = {
  name: 'cartoon-script-skill',
  project: 'cartoon',
  version: '0.2.0',
  description: '把章节译成可拍定稿：一场一地、对白留原句、不写镜头调度。不合格会重写一次，仍不合格则不作为定稿',
  scheme: 'loop',
  routes: [
    {
      path: '/api/skills/cartoon-script/invoke',
      method: 'POST',
      description: '整理剧本',
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
      parseStepOutput: parseScriptStep,
      buildStepDirective({ step, state }) {
        const notes = String(state?.repair_notes || '').trim();
        if (!step || !notes) return '';
        return [
          '上一稿没有通过定稿检查。按下面每一条重写整份剧本。',
          '已经写对的对白原句保留。正文写了的外形按短句补进 look，动作和情节留在场次里。找不到人物描写时 look 只写「正文未写」。',
          '不要把景别、运镜写进场次正文。',
          notes,
        ].join('\n');
      },
      jsonSchemaHint: '{"done":true,"continue":false,"thinking":"","reply":"","summary":"","script_data":{"logline":"","summary":"","characters":[{"name":"","look":""}],"scenes":[{"title":"","summary":"","purpose":"推进剧情","wardrobe":"服装统一：\\n状态："}],"omissions":[{"target":"","reason":""}]}}',
      userContextFields: [
        'chapter_title',
        'body',
        'content_type',
        'min_scenes',
        'asset_facts',
        'av_mode',
      ],
      initialState: { thinking: '', reply: '', summary: '', repair_notes: '', script_data: {} },
      stateMerge: {
        thinking: 'replace',
        reply: 'replace',
        summary: 'replace',
        repair_notes: 'replace',
        script_data: 'replace',
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
      const minScenes = Number(params.min_scenes) > 0 ? Math.round(Number(params.min_scenes)) : minStoryUnits(body.length);
      const next = {
        ...params,
        ...readProductionSource(params),
        action: 'draft',
        topic: String(params.chapter_title || '未命名章节').slice(0, 80),
        body,
        min_scenes: minScenes,
      };
      [ 'visual_style', 'visual_style_label', 'visual_style_prompt', 'genre', 'genre_subcategory', 'is_xianxia' ].forEach(key => {
        delete next[key];
      });
      return next;
    },
  },
};

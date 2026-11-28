'use strict';

const { parseDescStep } = require('./lib/parseStep');
const { packStyles } = require('../_shared/styleLibrary');

module.exports = {
  name: 'cartoon-asset-desc-skill',
  project: 'cartoon',
  version: '0.1.0',
  description: '按项目指定画风和资产公式写一条可生图的资产描述',
  scheme: 'loop',
  routes: [
    {
      path: '/api/skills/cartoon-asset-desc/invoke',
      method: 'POST',
      description: '写资产描述',
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
      parseStepOutput: parseDescStep,
      jsonSchemaHint: '{"done":true,"continue":false,"thinking":"","reply":"","summary":"","description":""}',
      userContextFields: [
        'kind', 'name', 'notes', 'costume_note',
        'visual_style', 'visual_style_label', 'visual_style_prompt',
        'genre', 'title', 'era_note', 'av_nude', 'formula', 'style_sheet',
      ],
      initialState: { thinking: '', reply: '', summary: '', description: '', prompt: '' },
      stateMerge: {
        thinking: 'replace',
        reply: 'replace',
        summary: 'replace',
        description: 'replace',
        prompt: 'replace',
      },
    },
  },
  callbacks: {
    async beforeExecute(ctx, params) {
      const kind = [ 'character', 'scene', 'prop' ].includes(params.kind) ? params.kind : '';
      const name = String(params.name || '').trim();
      if (!kind || !name) {
        const err = new Error('需要资产名称和类型');
        err.status = 400;
        throw err;
      }
      const styleIds = Array.isArray(params.style_ids) ? params.style_ids : [ params.visual_style ];
      const packed = packStyles(kind, styleIds);
      const topic = kind === 'scene' ? '场景描述' : (kind === 'prop' ? '道具描述' : '人物描述');
      return {
        action: 'draft',
        topic: `${topic} ${name}`,
        kind,
        name,
        notes: String(params.notes || '').slice(0, 1500),
        costume_note: String(params.costume_note || '').slice(0, 500),
        visual_style: String(params.visual_style || '').slice(0, 80),
        visual_style_label: String(params.visual_style_label || '').slice(0, 80),
        visual_style_prompt: String(params.visual_style_prompt || '').slice(0, 2000),
        genre: String(params.genre || '').slice(0, 120),
        title: String(params.title || '').slice(0, 80),
        era_note: String(params.era_note || '').slice(0, 2000),
        av_nude: params.av_nude === true || params.av_nude === 1 || params.av_nude === '1' || params.av_nude === 'true',
        formula: packed.formula,
        style_sheet: packed.styleSheet,
      };
    },
  },
};

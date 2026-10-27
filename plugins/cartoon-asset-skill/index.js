'use strict';

const { readProductionSource } = require('../_shared/productionSource');
const { parseAssetStep } = require('./lib/parseStep');

module.exports = {
  name: 'cartoon-asset-skill',
  project: 'cartoon',
  version: '0.1.0',
  description: '建议镜头绑定哪条已有资产，不生成图片',
  scheme: 'loop',
  routes: [
    {
      path: '/api/skills/cartoon-asset/invoke',
      method: 'POST',
      description: '建议资产绑定',
      requiresAuth: false,
    },
  ],
  dbTables: [],
  memoryConfig: { enabled: true, type: 'file', scope: 'work' },
  config: {
    llmDefaultProfile: 'ollama-qwen',
    actionDefaults: { POST: 'suggest' },
    loop: {
      maxSteps: 1,
      stopWhen: 'llm-done',
      systemPromptFile: 'loop-system.md',
      temperature: 0.2,
      maxTokens: 2048,
      localMaxTokens: 2048,
      llmTimeoutMs: 180000,
      localLlmTimeoutMs: 180000,
      parseStepOutput: parseAssetStep,
      jsonSchemaHint: '{"done":true,"continue":false,"thinking":"","reply":"","summary":"","suggestions":[{"shot_id":"","asset_id":"","reason":""}]}',
      userContextFields: [ 'shots', 'assets', 'package_id', 'package_version', 'copy_block_id', 'content_type' ],
      initialState: { thinking: '', reply: '', summary: '', suggestions: [] },
      stateMerge: {
        thinking: 'replace',
        reply: 'replace',
        summary: 'replace',
        suggestions: 'replace',
      },
    },
  },
  callbacks: {
    async beforeExecute(ctx, params) {
      const source = readProductionSource(params);
      const shots = Array.isArray(params.shots) ? params.shots : [];
      const assets = Array.isArray(params.assets) ? params.assets : [];
      if (!shots.length || !assets.length) {
        const err = new Error('需要镜头和资产');
        err.status = 400;
        throw err;
      }
      return {
        ...params,
        ...source,
        action: 'suggest',
        topic: '资产建议',
        shots: shots.slice(0, 12).map(item => ({
          id: item.id,
          description: String(item.description || '').slice(0, 200),
          dialogue: String(item.dialogue || '').slice(0, 200),
        })),
        assets: assets.slice(0, 40).map(item => ({
          id: item.id,
          kind: item.kind,
          name: item.name,
          scene_type: item.scene_type || '',
          prop_category: item.prop_category || '',
          voice_key: item.voice_key || '',
        })),
      };
    },
  },
};

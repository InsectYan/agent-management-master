'use strict';

const { readProductionSource } = require('../_shared/productionSource');
const { parseReviewStep } = require('./lib/parseStep');

module.exports = {
  name: 'cartoon-review-skill',
  project: 'cartoon',
  version: '0.1.0',
  description: '成片初审只返回问题，不通过也不驳回',
  scheme: 'loop',
  routes: [
    {
      path: '/api/skills/cartoon-review/invoke',
      method: 'POST',
      description: '视频初审',
      requiresAuth: false,
    },
  ],
  dbTables: [],
  memoryConfig: { enabled: true, type: 'file', scope: 'work' },
  config: {
    llmDefaultProfile: 'ollama-qwen',
    actionDefaults: { POST: 'review_cut' },
    loop: {
      maxSteps: 1,
      stopWhen: 'llm-done',
      systemPromptFile: 'loop-system.md',
      temperature: 0.2,
      maxTokens: 2048,
      localMaxTokens: 2048,
      llmTimeoutMs: 180000,
      localLlmTimeoutMs: 180000,
      parseStepOutput: parseReviewStep,
      jsonSchemaHint: '{"done":true,"continue":false,"thinking":"","reply":"","summary":"","issues":[{"shot_id":"","rule_id":"","level":"warning","message":"","node":"script"}]}',
      userContextFields: [ 'shots', 'rules', 'model_profile', 'package_id', 'package_version', 'copy_block_id', 'content_type' ],
      initialState: { thinking: '', reply: '', summary: '', issues: [] },
      stateMerge: {
        thinking: 'replace',
        reply: 'replace',
        summary: 'replace',
        issues: 'replace',
      },
    },
  },
  callbacks: {
    async beforeExecute(ctx, params) {
      const source = readProductionSource(params);
      const shots = Array.isArray(params.shots) ? params.shots : [];
      if (!shots.length) {
        const err = new Error('需要镜头');
        err.status = 400;
        throw err;
      }
      return {
        ...params,
        ...source,
        action: 'review_cut',
        topic: '视频初审',
        model_profile: String(params.model_profile || ''),
        shots: shots.slice(0, 12).map(item => ({
          id: item.id,
          description: String(item.description || '').slice(0, 200),
          dialogue: String(item.dialogue || '').slice(0, 200),
          shot_size: String(item.shot_size || ''),
          camera_move: String(item.camera_move || ''),
          duration_ms: Number(item.duration_ms) || 0,
        })),
        rules: (Array.isArray(params.rules) ? params.rules : []).slice(0, 30).map(item => ({
          id: item.id,
          kind: item.kind || item.type || '',
          version: item.version,
          body: String(item.body || ''),
        })),
      };
    },
    async formatResponse(ctx, result) {
      const output = result.output || {};
      const issues = Array.isArray(output.issues) ? output.issues : [];
      return {
        reply: output.reply || output.summary || '',
        output: { issues, source: 'model' },
        meta: result.meta,
      };
    },
  },
};

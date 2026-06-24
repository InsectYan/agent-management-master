/**
 * @file research-skill/index.js
 * @description 示例 Skill：Loop 方案，多步主题调研 + research_log 落库。
 */

'use strict';

module.exports = {
  name: 'research-skill',
  version: '0.1.0',
  description: 'Loop 方案示例 — 多步调研',
  scheme: 'loop',
  routes: [
    {
      path: '/api/skills/research',
      method: 'POST',
      description: 'Loop 多步调研',
      requiresAuth: false,
    },
  ],
  dbTables: [ 'research_log' ],
  memoryConfig: {
    enabled: true,
    type: 'vector',
    table: 'research_memory',
  },
  config: {
    llmDefaultProfile: 'ollama-qwen',
    actionDefaults: { POST: 'research' },
    loop: { maxSteps: 3, stopWhen: 'llm-done' },
  },
  callbacks: {
    async beforeExecute(ctx, params) {
      if (params.action === 'list') return params;
      return {
        ...params,
        topic: String(params.topic || params.message || '未命名主题'),
      };
    },

    async enrichContext(ctx, params) {
      if (params.action === 'list') {
        const research_log = await ctx.service.dbManager.listResearchLog(10);
        return { action: 'list', research_log };
      }
      return { action: 'research', topic: params.topic };
    },

    async persistResult(ctx, payload) {
      if (payload.params?.action === 'list') {
        return { persisted: false, reason: 'list 只读' };
      }
      const output = payload.output || {};
      const info = await ctx.service.dbManager.insertResearchLog({
        topic: output.topic || payload.params?.topic || '',
        summary: output.summary || payload.text || '',
        steps_count: output.steps?.length || 0,
        stopped_reason: output.stoppedReason || '',
        llm_profile_id: payload.llm?.profileIdUsed || payload.llm?.profileId || '',
      });
      return { persisted: true, log_id: Number(info.lastInsertRowid) };
    },

    async formatResponse(ctx, result) {
      return {
        reply: result.text,
        output: result.output,
        meta: result.meta,
      };
    },
  },
};

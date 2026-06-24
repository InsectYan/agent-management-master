/**
 * @file qa-skill/index.js
 * @description 示例 Skill：ReAct 方案，工具推理问答 + qa_log 落库。
 */

'use strict';

module.exports = {
  name: 'qa-skill',
  version: '0.1.0',
  description: 'ReAct 方案示例 — 工具推理问答',
  scheme: 'react',
  routes: [
    {
      path: '/api/skills/qa',
      method: 'POST',
      description: 'ReAct 问答',
      requiresAuth: false,
    },
  ],
  dbTables: [ 'qa_log' ],
  memoryConfig: { enabled: false },
  config: {
    llmDefaultProfile: 'ollama-qwen',
    actionDefaults: { POST: 'ask' },
    react: { maxIterations: 6, tools: [ 'calculator', 'echoSearch' ] },
  },
  callbacks: {
    async beforeExecute(ctx, params) {
      if (params.action === 'list') return params;
      return {
        ...params,
        message: String(params.message || params.question || ''),
      };
    },

    async enrichContext(ctx, params) {
      if (params.action === 'list') {
        const qa_log = await ctx.service.dbManager.listQaLog(10);
        return { action: 'list', qa_log };
      }
      return { action: 'ask', message: params.message };
    },

    async persistResult(ctx, payload) {
      if (payload.params?.action === 'list') {
        return { persisted: false, reason: 'list 只读' };
      }
      const output = payload.output || {};
      const info = await ctx.service.dbManager.insertQaLog({
        question: output.question || payload.params?.message || '',
        answer: output.answer || payload.text || '',
        iterations: payload.meta?.iterations || 0,
        llm_profile_id: payload.llm?.profileIdUsed || payload.llm?.profileId || '',
      });
      return { persisted: true, qa_id: Number(info.lastInsertRowid) };
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

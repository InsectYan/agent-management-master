/**
 * @file note-skill/index.js
 * @description 示例 Skill：Pi 方案，记事对话 + note_entries 落库。
 *              执行契约见同目录 SKILL.md。
 */

'use strict';

module.exports = {
  name: 'note-skill',
  version: '0.2.0',
  description: 'Pi 方案示例 — 记事/对话（含 SKILL.md 与落库）',
  scheme: 'pi',
  routes: [
    {
      path: '/api/skills/note/chat',
      method: 'POST',
      description: 'Pi 占位对话',
      requiresAuth: false,
    },
  ],
  dbTables: [ 'note_entries' ],
  memoryConfig: { enabled: false },
  config: {
    llmDefaultProfile: 'ollama-qwen',
    actionDefaults: { POST: 'chat' },
  },
  callbacks: {
    /**
     * 执行前：规范化 message / session_id
     * @param {import('egg').Context} ctx
     * @param {Object} params
     */
    async beforeExecute(ctx, params) {
      if (params.action === 'list') {
        params.session_id = params.session_id || 'default';
        return params;
      }
      const message = params.message || params.text || '';
      return {
        ...params,
        message: String(message),
        session_id: params.session_id || 'default',
      };
    },

    /**
     * 拼 Pi inbox 输入或 list 查询上下文
     * @param {import('egg').Context} ctx
     * @param {Object} params
     */
    async enrichContext(ctx, params) {
      if (params.action === 'list') {
        const entries = ctx.service.dbManager.listNoteEntries(params.session_id, 10);
        return { action: 'list', session_id: params.session_id, entries };
      }
      return {
        action: 'chat',
        message: params.message,
        session_id: params.session_id,
      };
    },

    /**
     * 对话结果写入 note_entries
     * @param {import('egg').Context} ctx
     * @param {Object} payload
     */
    async persistResult(ctx, payload) {
      if (payload.params?.action === 'list') {
        return { persisted: false, reason: 'list 动作只读，不落库' };
      }

      const info = ctx.service.dbManager.insertNoteEntry({
        session_id: payload.params?.session_id || 'default',
        user_message: payload.params?.message || '',
        assistant_reply: payload.text || '',
        llm_profile_id: payload.llm?.profileIdUsed || payload.llm?.profileId || '',
      });

      return { persisted: true, entry_id: Number(info.lastInsertRowid) };
    },

    /**
     * 格式化 HTTP 响应
     * @param {import('egg').Context} ctx
     * @param {Object} result
     */
    async formatResponse(ctx, result) {
      return {
        reply: result.text,
        output: result.output,
        meta: result.meta,
      };
    },
  },
};

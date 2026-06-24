/**
 * @file weather-skill/index.js
 * @description 示例 Skill：LangChain 方案，天气查询 + weather_history 落库。
 *              执行契约见同目录 SKILL.md。
 */

'use strict';

module.exports = {
  name: 'weather-skill',
  version: '0.2.0',
  description: 'LangChain 方案示例 — 天气查询（含 SKILL.md 与落库）',
  scheme: 'langchain',
  routes: [
    {
      path: '/api/skills/weather',
      method: 'GET',
      description: '查询城市天气或历史',
      requiresAuth: false,
    },
  ],
  dbTables: [ 'weather_history' ],
  memoryConfig: { enabled: false },
  config: {
    llmDefaultProfile: 'ollama-qwen',
    actionDefaults: { GET: 'query' },
    chain: { type: 'tool-agent', tools: [ 'getWeather' ] },
  },
  callbacks: {
    /**
     * 按 action 分支构建 Chain 输入
     * @param {import('egg').Context} ctx
     * @param {Object} params
     */
    buildInput(ctx, params) {
      const city = params.city || '北京';
      if (params.action === 'history') {
        const rows = ctx.service.dbManager.listWeatherHistory(city, 5);
        return { action: 'history', city, history: rows };
      }
      return { action: 'query', city };
    },

    /**
     * 执行后将结果写入 weather_history
     * @param {import('egg').Context} ctx
     * @param {Object} payload
     */
    persistResult(ctx, payload) {
      if (payload.params?.action === 'history') {
        return { persisted: false, reason: 'history 动作只读，不落库' };
      }

      const output = payload.output || {};
      const info = ctx.service.dbManager.insertWeatherHistory({
        city: output.city || payload.params?.city || '未知',
        query_text: JSON.stringify(payload.params || {}),
        reply_text: payload.text || '',
        llm_profile_id: payload.llm?.profileIdUsed || payload.llm?.profileId || '',
        temperature: output.temperature ?? null,
        condition_text: output.condition || '',
      });

      return { persisted: true, history_id: Number(info.lastInsertRowid) };
    },

    /**
     * 格式化 HTTP 响应
     * @param {import('egg').Context} ctx
     * @param {Object} result
     */
    formatResponse(ctx, result) {
      return {
        reply: result.text,
        data: result.output,
        meta: result.meta,
      };
    },
  },
};

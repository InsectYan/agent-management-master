/**
 * @file langchain/index.js
 * @description LangChain Agent 方案执行器（Phase 3 完整实现；当前占位）。
 *              文档：docs/schemes/langchain/README.md
 */

'use strict';

const AgentExecutor = require('../base/executor');

/**
 * LangChain 方案执行器
 */
class LangChainExecutor extends AgentExecutor {
  static schemeId = 'langchain';

  /**
   * @param {import('../base/executor').ExecuteContext} context
   * @param {import('../base/executor').ExecuteParams} params
   */
  async executeTask(context, params) {
    const { llm, skill } = context;
    const input = params.input || {};
    const raw = params.raw || {};
    const action = input.action || raw.action || 'query';
    const city = input.city || '未知';

    /** history 只读：返回数据库中的最近记录摘要 */
    if (action === 'history' && Array.isArray(input.history)) {
      const lines = input.history.map(h =>
        `- [${h.created_at}] ${h.condition_text || '—'} ${h.temperature != null ? h.temperature + '°C' : ''}`
      );
      const reply = lines.length
        ? `[LangChain 方案] 「${city}」最近 ${lines.length} 次查询：\n${lines.join('\n')}`
        : `[LangChain 方案] 「${city}」暂无历史记录`;

      return {
        text: reply,
        output: { reply, city, action: 'history', history: input.history, scheme: 'langchain' },
        meta: {
          scheme: 'langchain',
          skill_action: action,
          skill_doc: skill.skillDoc?.purpose ? '已按 SKILL.md 执行' : null,
          model: llm.model,
        },
      };
    }

    const docHint = skill.skillDoc?.purpose
      ? `（按 SKILL.md：${skill.skillDoc.purpose.split('\n')[0].slice(0, 60)}）`
      : '';

    const temperature = 22 + (city.length % 8);
    const condition = [ '晴', '多云', '阴', '小雨' ][city.length % 4];
    const reply = `[LangChain 方案占位] Skill「${skill.name}」动作「${action}」${docHint} — ${city}：${condition}，约 ${temperature}°C`;

    return {
      text: reply,
      output: {
        reply,
        city,
        action,
        temperature,
        condition,
        scheme: 'langchain',
      },
      meta: {
        scheme: 'langchain',
        skill_action: action,
        skill_doc: skill.skillDoc?.purpose ? '已按 SKILL.md 执行' : null,
        model: llm.model,
        phase: 3,
      },
    };
  }

  isReady() {
    return true;
  }

  getNotReadyReason() {
    return null;
  }
}

module.exports = { LangChainExecutor };

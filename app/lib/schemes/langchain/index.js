/**
 * @file index.js
 * @description LangChain Agent 方案执行器：Tool 注册 + Chain 编排。
 *              文档：docs/schemes/langchain/README.md
 */

'use strict';

const AgentExecutor = require('../base/executor');
const { runLangChain } = require('./runChain');

class LangChainExecutor extends AgentExecutor {
  static schemeId = 'langchain';

  /**
   * @param {import('../base/executor').ExecuteContext} context
   * @param {import('../base/executor').ExecuteParams} params
   */
  async executeTask(context, params) {
    const { llm, skill, ctx } = context;
    const input = params.input || {};
    const raw = params.raw || {};
    const action = input.action || raw.action || 'query';

    /** history 只读 */
    if (action === 'history' && Array.isArray(input.history)) {
      const city = input.city || '未知';
      const lines = input.history.map(h =>
        `- [${h.created_at}] ${h.condition_text || '—'} ${h.temperature != null ? h.temperature + '°C' : ''}`
      );
      const reply = lines.length
        ? `「${city}」最近 ${lines.length} 次查询：\n${lines.join('\n')}`
        : `「${city}」暂无历史记录`;

      return {
        text: reply,
        output: { reply, city, action: 'history', history: input.history, scheme: 'langchain' },
        meta: { scheme: 'langchain', skill_action: action, model: llm.model },
      };
    }

    const hooks = ctx?.state?.schemeHooks;

    const result = await runLangChain({
      llm,
      skill,
      input,
      hooks,
    });

    return {
      text: result.text,
      output: result.output,
      meta: {
        ...result.meta,
        skill_action: action,
        skill_doc: skill.skillDoc?.purpose ? '已按 SKILL.md 执行' : null,
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

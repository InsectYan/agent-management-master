/**
 * @file pi/index.js
 * @description Pi Agent 方案执行器（Phase 2 完整实现 runTurn；当前为可运行的占位实现）。
 *              文档：docs/schemes/pi/README.md
 */

'use strict';

const AgentExecutor = require('../base/executor');

/**
 * Pi 方案执行器：未来将对接 @earendil-works/pi-agent-core 的 runTurn
 */
class PiExecutor extends AgentExecutor {
  /** @type {string} 方案 ID，与 Skill.scheme 字段对应 */
  static schemeId = 'pi';

  /**
   * 执行 Pi 单轮任务（占位：调用 LLM 兼容接口或返回结构化占位结果）
   * @param {import('../base/executor').ExecuteContext} context
   * @param {import('../base/executor').ExecuteParams} params
   * @returns {Promise<import('../base/executor').ExecuteResult>}
   */
  async executeTask(context, params) {
    const { llm, skill } = context;
    const input = params.input || {};
    const raw = params.raw || {};
    const action = input.action || raw.action || 'chat';

    /** history / list 只读动作：直接基于 enrich 数据返回 */
    if (action === 'list' && Array.isArray(input.entries)) {
      const lines = input.entries.map(e =>
        `- [${e.created_at}] 用户: ${e.user_message} → 助手: ${e.assistant_reply || ''}`
      );
      const reply = lines.length
        ? `[Pi 方案] 会话「${input.session_id}」最近 ${lines.length} 条记事：\n${lines.join('\n')}`
        : `[Pi 方案] 会话「${input.session_id}」暂无记事`;

      return {
        text: reply,
        output: {
          reply,
          action: 'list',
          session_id: input.session_id,
          entries: input.entries,
          scheme: 'pi',
        },
        meta: {
          scheme: 'pi',
          skill_action: action,
          skill_doc: skill.skillDoc?.purpose ? '已按 SKILL.md 执行' : null,
          model: llm.model,
        },
      };
    }

    const message = String(input.message || input.text || '');
    const docHint = skill.skillDoc?.purpose
      ? `（按 SKILL.md：${skill.skillDoc.purpose.split('\n')[0].slice(0, 60)}）`
      : '';

    const reply = `[Pi 方案占位] Skill「${skill.name}」动作「${action}」${docHint} 收到：${message.slice(0, 200)}`;

    return {
      text: reply,
      output: {
        reply,
        message_type: 'text',
        intent: action,
        session_id: input.session_id || raw.session_id || 'default',
        scheme: 'pi',
        llm_profile_id: llm.profileId,
      },
      meta: {
        scheme: 'pi',
        skill_action: action,
        skill_doc: skill.skillDoc?.purpose ? '已按 SKILL.md 执行' : null,
        model: llm.model,
        note: 'Phase 2 将接入 pi-agent-core runTurn',
      },
    };
  }
}

module.exports = { PiExecutor };

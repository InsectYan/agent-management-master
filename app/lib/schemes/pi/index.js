/**
 * @file index.js
 * @description Pi Agent 方案执行器：runTurn + 工作区 outbox 契约。
 *              文档：docs/schemes/pi/README.md
 */

'use strict';

const AgentExecutor = require('../base/executor');
const { runPiTurn } = require('./runTurn');

/**
 * Pi 方案执行器
 */
class PiExecutor extends AgentExecutor {
  static schemeId = 'pi';

  /**
   * @param {import('../base/executor').ExecuteContext} context
   * @param {import('../base/executor').ExecuteParams} params
   */
  async executeTask(context, params) {
    const { llm, skill, app, ctx } = context;
    const input = params.input || {};
    const raw = params.raw || {};
    const action = input.action || raw.action || 'chat';
    const workspacesRoot = app.config.appSettings.workspacesRoot;

    /** history / list 只读动作 */
    if (action === 'list' && Array.isArray(input.entries)) {
      const lines = input.entries.map(e =>
        `- [${e.created_at}] 用户: ${e.user_message} → 助手: ${e.assistant_reply || ''}`
      );
      const reply = lines.length
        ? `会话「${input.session_id}」最近 ${lines.length} 条记事：\n${lines.join('\n')}`
        : `会话「${input.session_id}」暂无记事`;

      return {
        text: reply,
        output: {
          reply,
          action: 'list',
          session_id: input.session_id,
          entries: input.entries,
          scheme: 'pi',
        },
        meta: { scheme: 'pi', skill_action: action, model: llm.model },
      };
    }

    const sessionId = input.session_id || raw.session_id || 'default';
    const message = String(input.message || input.text || '');
    const stream = raw.stream === true || raw.stream === 'true' || ctx?.query?.stream === 'true';

    /** 拼 inbox：附带历史摘要 */
    const historyBlock = Array.isArray(input.recent_entries) && input.recent_entries.length
      ? `\n\n## 最近记事\n${input.recent_entries.map(e =>
        `- ${e.user_message} → ${e.assistant_reply || ''}`
      ).join('\n')}`
      : '';

    const inbox = [
      `# 当前消息`,
      message,
      historyBlock,
      skill.skillDoc?.purpose ? `\n## Skill 用途\n${skill.skillDoc.purpose}` : '',
    ].join('\n');

    const hooks = ctx?.state?.piHooks || undefined;

    const turn = await runPiTurn({
      skill,
      message: inbox,
      sessionId,
      llm,
      workspacesRoot,
      hooks,
      stream,
      context: { action, session_id: sessionId },
      memoryContext: input._memoryContext || '',
    });

    const outbox = turn.outbox || {};

    return {
      text: turn.reply,
      output: {
        reply: turn.reply,
        message_type: outbox.message_type || 'text',
        intent: outbox.intent || action,
        session_id: sessionId,
        scheme: 'pi',
        outbox,
        workspace: turn.workspace,
        session_dir: turn.session_dir,
        llm_profile_id: llm.profileId,
      },
      meta: {
        scheme: 'pi',
        skill_action: action,
        skill_doc: skill.skillDoc?.purpose ? '已按 SKILL.md 执行' : null,
        model: llm.model,
        workspace: turn.workspace,
      },
    };
  }
}

module.exports = { PiExecutor };

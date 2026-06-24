/**
 * @file index.js
 * @description ReAct Agent 方案执行器：Thought / Action / Observation 循环。
 *              文档：docs/schemes/react/README.md
 */

'use strict';

const AgentExecutor = require('../base/executor');
const { runReact } = require('./runReact');

class ReactExecutor extends AgentExecutor {
  static schemeId = 'react';

  /**
   * @param {import('../base/executor').ExecuteContext} context
   * @param {import('../base/executor').ExecuteParams} params
   */
  async executeTask(context, params) {
    const { llm, skill, ctx } = context;
    const input = params.input || {};

    const hooks = ctx?.state?.schemeHooks;
    const result = await runReact({ llm, skill, input, hooks });

    return {
      text: result.text,
      output: result.output,
      meta: {
        ...result.meta,
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

module.exports = { ReactExecutor };

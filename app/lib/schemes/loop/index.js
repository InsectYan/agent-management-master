/**
 * @file index.js
 * @description Loop Agent 方案执行器：多步迭代直至终止条件。
 *              文档：docs/schemes/loop/README.md
 */

'use strict';

const AgentExecutor = require('../base/executor');
const { runLoop } = require('./runLoop');

class LoopExecutor extends AgentExecutor {
  static schemeId = 'loop';

  /**
   * @param {import('../base/executor').ExecuteContext} context
   * @param {import('../base/executor').ExecuteParams} params
   */
  async executeTask(context, params) {
    const { llm, skill, ctx } = context;
    const input = params.input || {};

    const hooks = ctx?.state?.schemeHooks;
    const result = await runLoop({ llm, skill, input, hooks });

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

module.exports = { LoopExecutor };

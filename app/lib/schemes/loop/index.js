/**
 * @file loop/index.js
 * @description Loop Agent 方案执行器骨架（Phase 4）。
 *              文档：docs/schemes/loop/README.md
 */

'use strict';

const AgentExecutor = require('../base/executor');

class LoopExecutor extends AgentExecutor {
  static schemeId = 'loop';

  async executeTask(context, params) {
    throw new Error('Loop 方案尚未实现，见 docs/schemes/loop/README.md');
  }

  isReady() {
    return false;
  }

  getNotReadyReason() {
    return 'Loop 方案将于 Phase 4 实现';
  }
}

module.exports = { LoopExecutor };

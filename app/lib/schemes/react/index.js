/**
 * @file react/index.js
 * @description ReAct Agent 方案执行器骨架（Phase 4）。
 *              文档：docs/schemes/react/README.md
 */

'use strict';

const AgentExecutor = require('../base/executor');

class ReactExecutor extends AgentExecutor {
  static schemeId = 'react';

  async executeTask(context, params) {
    throw new Error('ReAct 方案尚未实现，见 docs/schemes/react/README.md');
  }

  isReady() {
    return false;
  }

  getNotReadyReason() {
    return 'ReAct 方案将于 Phase 4 实现';
  }
}

module.exports = { ReactExecutor };

/**
 * @file application.js
 * @description 扩展 Egg Application（预留：后续可挂载更多平台级属性）。
 */

'use strict';

module.exports = {
  /**
   * 应用加载完成钩子（预留）
   */
  didLoad() {
    /** 平台是否完成 beforeStart 初始化（在 app.js 中置 true） */
    if (this.platformReady === undefined) {
      this.platformReady = false;
    }
  },
};

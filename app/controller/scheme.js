/**
 * @file scheme.js
 * @description Agent 方案（Scheme）查询 API。
 */

'use strict';

const Controller = require('egg').Controller;

class SchemeController extends Controller {
  /**
   * GET /api/schemes — 列出已注册的 Agent 方案及就绪状态
   */
  async list() {
    this.ctx.body = {
      schemes: this.app.schemeRegistry.listSchemes(),
      docs: '/docs/schemes/README.md',
    };
  }
}

module.exports = SchemeController;

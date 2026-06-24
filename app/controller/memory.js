/**
 * @file memory.js
 * @description Skill 记忆 API：读取 / 追加 / 搜索。
 */

'use strict';

const Controller = require('egg').Controller;

class MemoryController extends Controller {
  /**
   * GET /api/memory — 列出已启用记忆的 Skill
   */
  async list() {
    this.ctx.body = {
      skills: this.service.memoryEngine.listEnabled(),
    };
  }

  /**
   * GET /api/memory/:skillName — 读取记忆内容
   */
  async show() {
    const { skillName } = this.ctx.params;
    this.ctx.body = await this.service.memoryEngine.read(skillName);
  }

  /**
   * POST /api/memory/:skillName/append — 手动追加记忆
   */
  async append() {
    const { skillName } = this.ctx.params;
    const { text, section } = this.ctx.request.body || {};
    if (!text) {
      this.ctx.status = 400;
      this.ctx.body = { error: 'text 必填' };
      return;
    }
    this.ctx.body = await this.service.memoryEngine.append(skillName, String(text), section);
  }

  /**
   * POST /api/memory/:skillName/search — 搜索记忆
   */
  async search() {
    const { skillName } = this.ctx.params;
    const { query, limit } = this.ctx.request.body || {};
    this.ctx.body = await this.service.memoryEngine.search(
      skillName,
      String(query || ''),
      Number(limit) || 5
    );
  }
}

module.exports = MemoryController;

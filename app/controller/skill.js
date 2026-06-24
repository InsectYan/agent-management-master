/**
 * @file skill.js
 * @description Skill 动态路由分发与手动 invoke 入口。
 */

'use strict';

const Controller = require('egg').Controller;

class SkillController extends Controller {
  /**
   * 由 RouteManager 挂载的动态路由统一入口
   */
  async dispatch() {
    const skillName = this.ctx.state.skillName;
    try {
      const result = await this.service.skillInvoke.invoke({
        skillName,
        ctx: this.ctx,
      });
      this.ctx.body = result;
    } catch (err) {
      this.ctx.status = err.status || 500;
      this.ctx.body = {
        error: err.message,
        skill: skillName,
      };
    }
  }

  /**
   * POST /api/skills/:name/invoke — 显式调用入口（便于 curl 测试）
   */
  async invoke() {
    const skillName = this.ctx.params.name;
    try {
      const result = await this.service.skillInvoke.invoke({
        skillName,
        ctx: this.ctx,
      });
      this.ctx.body = result;
    } catch (err) {
      this.ctx.status = err.status || 500;
      this.ctx.body = { error: err.message, skill: skillName };
    }
  }
}

module.exports = SkillController;

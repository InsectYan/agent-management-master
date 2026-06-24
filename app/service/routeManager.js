/**
 * @file routeManager.js
 * @description 动态路由管理：将 Skill 声明的 routes 挂载到 Egg Router。
 */

'use strict';

const Service = require('egg').Service;

class RouteManagerService extends Service {
  /**
   * 将已加载 Skill 的路由注册到 Egg（在 beforeStart 中调用）
   * @returns {number} 注册的路由条数
   */
  mountSkillRoutes() {
    const skills = this.service.pluginManager.list();
    let count = 0;

    for (const skill of skills) {
      for (const route of skill.routes) {
        const method = (route.method || 'GET').toLowerCase();
        const path = route.path;
        if (!path) continue;

        /**
         * 闭包捕获 skill 名；直接调用 skillInvoke，避免自定义 handler 内 controller 绑定问题
         */
        const skillName = skill.name;
        const handler = async ctx => {
          try {
            ctx.body = await ctx.service.skillInvoke.invoke({ skillName, ctx });
          } catch (err) {
            ctx.status = err.status || 500;
            ctx.body = { error: err.message, skill: skillName };
          }
        };

        if (typeof this.app.router[method] === 'function') {
          this.app.router[method](path, handler);
          count += 1;
          this.app.logger.info('[RouteManager] 注册路由 %s %s → Skill:%s', method.toUpperCase(), path, skill.name);
        }
      }
    }

    return count;
  }
}

module.exports = RouteManagerService;

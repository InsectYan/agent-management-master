/**
 * @file health.js
 * @description 健康检查与就绪探针。
 */

'use strict';

const Controller = require('egg').Controller;

class HealthController extends Controller {
  /**
   * GET /health — 存活探针（进程在跑即 200）
   */
  async index() {
    const { app, service } = this;
    this.ctx.body = {
      status: 'ok',
      service: 'agent-management-master',
      uptime: process.uptime(),
      schemes: app.schemeRegistry.listSchemeIds(),
      skills_loaded: service.pluginManager.isLoaded(),
      skill_count: service.pluginManager.list().length,
      memory_skills: service.memoryEngine.listEnabled().length,
    };
  }

  /**
   * GET /ready — 就绪探针（Skill 与方案加载完成后 200，否则 503）
   */
  async ready() {
    const { app, service } = this;
    const pluginOk = service.pluginManager.isLoaded();
    const platformReady = app.platformReady === true;

    if (!pluginOk || !platformReady) {
      this.ctx.status = 503;
      this.ctx.body = {
        status: 'not_ready',
        plugin_manager: pluginOk,
        platform_ready: platformReady,
      };
      return;
    }

    this.ctx.body = {
      status: 'ready',
      schemes: app.schemeRegistry.listSchemes(),
      skills: service.pluginManager.list().map(s => ({
        name: s.name,
        scheme: s.scheme,
        version: s.version,
        routes: s.routes.length,
        memory: s.memoryConfig?.enabled === true,
      })),
      memory: service.memoryEngine.listEnabled(),
    };
  }
}

module.exports = HealthController;

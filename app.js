/**
 * @file app.js
 * @description Egg 应用启动钩子：加载环境变量、扫描 Skill 插件、挂载动态路由、标记平台就绪。
 */

'use strict';

const path = require('path');
const dotenv = require('dotenv');
const { registry } = require('./app/lib/schemes/registry');
const { initDb } = require('./app/lib/db/pool');

module.exports = app => {
  /** 挂载 Agent 方案注册表（全局单例） */
  app.schemeRegistry = registry;

  /**
   * Worker 就绪前：加载 .env、Skill 插件、动态路由
   */
  app.beforeStart(async () => {
    dotenv.config({ path: path.join(app.baseDir, '.env') });

    /** 初始化本地 SQLite（sql.js） */
    await initDb(app.config.appSettings);

    /** 匿名上下文：beforeStart 阶段访问 service 的标准方式 */
    const ctx = app.createAnonymousContext();

    app.logger.info('[Boot] 开始加载 Skill 插件…');
    await ctx.service.pluginManager.loadAll();

    /** 按 Skill.dbTables + db/init.sql 自动建表 */
    const skills = ctx.service.pluginManager.list();
    ctx.service.dbManager.syncAllSkills(skills);

    const routeCount = ctx.service.routeManager.mountSkillRoutes();
    app.logger.info('[Boot] 动态路由注册 %d 条', routeCount);

    const delay = app.config.appSettings.readyDelayMs || 0;
    if (delay > 0) {
      await new Promise(r => setTimeout(r, delay));
    }

    app.platformReady = true;
    app.logger.info('[Boot] 主 Agent 平台就绪 schemes=%j', app.schemeRegistry.listSchemeIds());
  });
};

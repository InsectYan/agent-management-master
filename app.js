/**
 * @file app.js
 * @description Egg 应用启动钩子。
 */

'use strict';

const path = require('path');
const dotenv = require('dotenv');
const { registry } = require('./app/lib/schemes/registry');
const { initDb, getDbKind } = require('./app/lib/db/pool');
const { startDreamWorker } = require('./app/lib/memory/dreamWorker');

module.exports = app => {
  app.schemeRegistry = registry;

  app.beforeStart(async () => {
    dotenv.config({ path: path.join(app.baseDir, '.env') });

    await initDb(app.config.appSettings);
    app.logger.info('[Boot] 数据库 dialect=%s', getDbKind());

    const ctx = app.createAnonymousContext();

    app.logger.info('[Boot] 开始加载 Skill 插件…');
    await ctx.service.pluginManager.loadAll();

    const skills = ctx.service.pluginManager.list();
    await ctx.service.dbManager.syncAllSkills(skills);

    const routeCount = ctx.service.routeManager.mountSkillRoutes();
    app.logger.info('[Boot] 动态路由注册 %d 条', routeCount);

    ctx.service.memoryEngine.initAll(skills);
    app.logger.info('[Boot] 记忆引擎 %d 个 Skill', ctx.service.memoryEngine.listEnabled().length);

    startDreamWorker(app);

    const delay = app.config.appSettings.readyDelayMs || 0;
    if (delay > 0) await new Promise(r => setTimeout(r, delay));

    app.platformReady = true;
    app.logger.info('[Boot] 平台就绪 schemes=%j', app.schemeRegistry.listSchemeIds());
  });
};

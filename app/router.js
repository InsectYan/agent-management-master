/**
 * @file router.js
 * @description HTTP 路由表：健康检查、方案/插件/LLM 查询、Skill 显式 invoke。
 *              Skill 自定义 routes 在 app.js beforeStart 中动态挂载。
 */

'use strict';

/**
 * @param {import('egg').Application} app
 */
module.exports = app => {
  const { router, controller } = app;

  router.get('/health', controller.health.index);
  router.get('/ready', controller.health.ready);

  router.get('/api/schemes', controller.scheme.list);
  router.get('/api/plugins', controller.plugin.list);
  router.get('/api/plugins/:name/skill-doc', controller.plugin.skillDoc);
  router.get('/api/plugins/:name', controller.plugin.show);
  router.get('/api/llm/profiles', controller.llm.profiles);

  /** 记忆 API（Phase 5） */
  router.get('/api/memory', controller.memory.list);
  router.get('/api/memory/:skillName', controller.memory.show);
  router.post('/api/memory/:skillName/append', controller.memory.append);
  router.post('/api/memory/:skillName/search', controller.memory.search);

  /** 通用 invoke：POST body 同 Skill 路由参数 */
  router.post('/api/skills/:name/invoke', controller.skill.invoke);
};

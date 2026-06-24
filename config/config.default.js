/**
 * @file config.default.js
 * @description Egg 默认配置：端口、插件目录、LLM 平台默认、CORS 等。
 *              环境变量优先，见项目根 `.env.example`。
 */

'use strict';

const path = require('path');

/**
 * Egg 配置工厂函数
 * @param {import('egg').EggAppInfo} appInfo - Egg 应用元信息
 * @returns {Record<string, unknown>} 合并后的配置对象
 */
module.exports = appInfo => {
  const config = {};

  /** 应用密钥（Cookie 等，本地开发占位即可） */
  config.keys = appInfo.name + '_local_dev_keys';

  /** HTTP 监听端口 */
  config.cluster = {
    listen: {
      port: Number(process.env.PORT || 3001),
      hostname: '127.0.0.1',
    },
  };

  /** 中间件列表（本地个人项目暂不启用鉴权中间件） */
  config.middleware = [];

  /** 跨域：供独立前端项目联调 */
  config.cors = {
    origin: process.env.CORS_ORIGIN || '*',
    allowMethods: 'GET,HEAD,PUT,POST,DELETE,PATCH,OPTIONS',
  };

  /** 安全模块：本地关闭 CSRF，便于 curl / Postman 调试 */
  config.security = {
    csrf: { enable: false },
  };

  /** 主 Agent 平台业务配置（集中入口，业务代码读 config.appSettings） */
  config.appSettings = {
    /** 项目根目录绝对路径 */
    root: appInfo.baseDir,
    /** Skill 插件扫描目录 */
    pluginDir: process.env.PLUGIN_DIR
      ? path.resolve(appInfo.baseDir, process.env.PLUGIN_DIR)
      : path.join(appInfo.baseDir, 'plugins'),
    /** Pi 等工作区根目录 */
    workspacesRoot: process.env.WORKSPACES_ROOT
      ? path.resolve(appInfo.baseDir, process.env.WORKSPACES_ROOT)
      : path.join(appInfo.baseDir, 'workspaces'),
    /** 就绪探针：启动后延迟毫秒数再标记 ready */
    readyDelayMs: Number(process.env.READY_DELAY_MS || 1000),
    /** SQLite 路径（可选，默认 data/agent.sqlite） */
    sqlitePath: process.env.SQLITE_PATH || '',
    /** 预留 PostgreSQL 连接串 */
    databaseUrl: process.env.DATABASE_URL || '',
    llm: {
      provider: (process.env.LLM_PROVIDER || 'ollama').trim().toLowerCase(),
      defaultProfileId: (process.env.LLM_DEFAULT_PROFILE || 'ollama-qwen').trim(),
      ollamaBaseUrl: (process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1').trim(),
      ollamaModel: (process.env.OLLAMA_MODEL || 'qwen3.6:latest').trim(),
      ollamaApiKeyPlaceholder: (process.env.OPENAI_API_KEY || 'ollama').trim(),
    },
  };

  return config;
};

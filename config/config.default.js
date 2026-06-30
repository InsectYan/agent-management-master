/**
 * @file config.default.js
 * @description Egg 默认配置：端口、插件目录、LLM 平台默认、CORS 等。
 *              环境变量优先，见项目根 `.env.example`。
 */

'use strict';

const path = require('path');

/**
 * 解析路径：绝对路径原样返回，相对路径相对项目根
 * @param {string} appBase
 * @param {string} value
 * @param {string} defaultRel
 */
function resolvePath(appBase, value, defaultRel) {
  const raw = (value || '').trim();
  if (raw) {
    return path.isAbsolute(raw) ? raw : path.resolve(appBase, raw);
  }
  return path.join(appBase, defaultRel);
}

/**
 * 解析 CORS origin：本地默认反射请求 Origin，不做白名单限制。
 * @returns {string|((ctx: import('egg').Context) => string)}
 */
function resolveCorsOrigin() {
  const raw = (process.env.CORS_ORIGIN || '').trim();
  if (!raw || raw === '*') {
    return ctx => ctx.get('Origin') || '*';
  }
  const list = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (list.length > 1) {
    return ctx => {
      const origin = ctx.get('Origin');
      return origin && list.includes(origin) ? origin : list[0];
    };
  }
  return list[0];
}

/**
 * Egg 配置工厂函数
 * @param {import('egg').EggAppInfo} appInfo - Egg 应用元信息
 * @returns {Record<string, unknown>} 合并后的配置对象
 */
module.exports = appInfo => {
  const config = {};

  /** 应用密钥（Cookie 等，本地开发占位即可） */
  config.keys = appInfo.name + '_local_dev_keys';

  /** HTTP 监听端口（Docker 内设置 HOST=0.0.0.0） */
  config.cluster = {
    listen: {
      port: Number(process.env.PORT || 4001),
      hostname: process.env.HOST || '127.0.0.1',
    },
  };

  /** 中间件列表（本地个人项目暂不启用鉴权中间件） */
  config.middleware = [];

  /**
   * 跨域：本地个人平台默认放行任意 Origin（任意端口、127.0.0.1 / localhost 均可）。
   * 设置 CORS_ORIGIN=* 或不设置即全开放；逗号分隔可限定多个来源。
   */
  config.cors = {
    origin: resolveCorsOrigin(),
    allowMethods: 'GET,HEAD,PUT,POST,DELETE,PATCH,OPTIONS',
    allowHeaders: 'Content-Type,Authorization,Accept,X-Requested-With,X-Internal-Token',
    credentials: true,
  };

  /** 安全模块：本地关闭 CSRF 等浏览器限制，便于 curl / Postman / 多前端联调 */
  config.security = {
    csrf: { enable: false },
    domainWhiteList: [ 'localhost', '127.0.0.1', '.local' ],
  };

  /** 主 Agent 平台业务配置（集中入口，业务代码读 config.appSettings） */
  config.appSettings = {
    /** 项目根目录绝对路径 */
    root: appInfo.baseDir,
    /** Skill 插件扫描目录 */
    pluginDir: resolvePath(appInfo.baseDir, process.env.PLUGIN_DIR, 'plugins'),
    workspacesRoot: resolvePath(appInfo.baseDir, process.env.WORKSPACES_ROOT, 'workspaces'),
    readyDelayMs: Number(process.env.READY_DELAY_MS || 1000),
    sqlitePath: process.env.SQLITE_PATH || '',
    databaseUrl: process.env.DATABASE_URL || '',
    llm: {
      provider: (process.env.LLM_PROVIDER || 'ollama').trim().toLowerCase(),
      defaultProfileId: (process.env.LLM_DEFAULT_PROFILE || 'ollama-qwen').trim(),
      ollamaBaseUrl: (process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1').trim(),
      ollamaModel: (process.env.OLLAMA_MODEL || 'qwen3.6:latest').trim(),
      ollamaApiKeyPlaceholder: (process.env.OPENAI_API_KEY || 'ollama').trim(),
    },
    /** 记忆系统（Phase 5） */
    memorySystem: {
      file: {
        dir: resolvePath(appInfo.baseDir, process.env.MEMORY_FILES_DIR, 'memory_files'),
      },
      vector: {
        backend: process.env.MEMORY_VECTOR_BACKEND || 'pgvector',
        embedModel: process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text',
      },
      dream: {
        workerEnabled: process.env.MEMORY_DREAM_WORKER !== '0',
        idleMinutes: Number(process.env.MEMORY_DREAM_IDLE_MIN || 5),
        pollIntervalMs: Number(process.env.MEMORY_DREAM_POLL_MS || 15_000),
        skipWhenWake: process.env.MEMORY_DREAM_SKIP_WHEN_WAKE !== '0',
      },
    },
  };

  return config;
};

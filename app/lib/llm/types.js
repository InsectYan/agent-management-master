/**
 * @file types.js
 * @description LLM 相关 TypeScript/JSDoc 类型定义（纯注释模块，无运行时逻辑）。
 */

'use strict';

/**
 * @typedef {Object} LlmRuntimeConfig
 * @property {string} profileId - 配置档 ID
 * @property {string} label - 展示名称
 * @property {string} provider - 提供商：ollama | openai | zhipu | deepseek
 * @property {string} model - 模型名
 * @property {string} baseUrl - OpenAI 兼容 API 根地址
 * @property {string} apiKey - API 密钥（Ollama 可为占位 ollama）
 */

/**
 * @typedef {Object} LlmProfileOption
 * @property {string} id
 * @property {string} label
 * @property {string} provider
 * @property {string} model
 * @property {boolean} available - 当前 env 下是否可用
 */

/**
 * @typedef {Object} ResolvedLlm
 * @property {string} profileId
 * @property {string} label
 * @property {string} provider
 * @property {string} model
 * @property {string} baseUrl
 * @property {string} apiKey
 * @property {'request'|'skill'|'platform'} source - 命中哪一级优先级
 * @property {string} profileIdUsed - 实际使用的 profile id
 */

module.exports = {};

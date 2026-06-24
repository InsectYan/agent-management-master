/**
 * @file catalog.js
 * @description LLM 预置配置目录（CATALOG）。
 *              参考 cartoon-agent llmProfiles.js，apiKey 仅从环境变量解析，不下发客户端。
 */

'use strict';

/**
 * @typedef {Object} ProfileDef
 * @property {string} id
 * @property {string} label
 * @property {string} provider
 * @property {string} model
 * @property {string} baseUrl
 * @property {'OPENAI_API_KEY'|'ZHIPU_API_KEY'|'DEEPSEEK_API_KEY'} [apiKeyEnv]
 * @property {boolean} [localOllama]
 * @property {string} [modelEnv]
 */

/** @type {ProfileDef[]} 静态 profile 目录 */
const CATALOG = [
  {
    id: 'ollama-qwen',
    label: '本地 Ollama · qwen',
    provider: 'ollama',
    model: 'qwen3.6:latest',
    baseUrl: 'http://localhost:11434/v1',
    localOllama: true,
    modelEnv: 'OLLAMA_MODEL',
  },
  {
    id: 'openai-mini',
    label: 'OpenAI · gpt-4o-mini',
    provider: 'openai',
    model: 'gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
  },
  {
    id: 'zhipu-flash',
    label: '智谱 · glm-4-flash',
    provider: 'zhipu',
    model: 'glm-4-flash',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiKeyEnv: 'ZHIPU_API_KEY',
  },
  {
    id: 'deepseek-chat',
    label: 'DeepSeek · deepseek-chat',
    provider: 'deepseek',
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
  },
];

/**
 * 读取环境变量中的 API Key
 * @param {string} name - 环境变量名
 * @returns {string}
 */
function envKey(name) {
  return (process.env[name] || '').trim();
}

/**
 * 解析 Ollama OpenAI 兼容 base URL
 * @param {ProfileDef} def
 * @returns {string}
 */
function ollamaBaseUrl(def) {
  return (process.env.OLLAMA_BASE_URL || def.baseUrl).trim();
}

/**
 * 解析 Ollama 实际模型名
 * @param {ProfileDef} def
 * @returns {string}
 */
function ollamaModel(def) {
  return (process.env[def.modelEnv || 'OLLAMA_MODEL'] || def.model).trim();
}

/**
 * 判断 profile 在当前环境下是否可用
 * @param {ProfileDef} def
 * @returns {boolean}
 */
function profileAvailable(def) {
  if (def.localOllama) {
    return ollamaBaseUrl(def).length > 0;
  }
  return envKey(def.apiKeyEnv).length > 0;
}

/**
 * 解析 profile 的 baseUrl
 * @param {ProfileDef} def
 * @returns {string}
 */
function resolveBaseUrl(def) {
  if (def.localOllama) return ollamaBaseUrl(def);
  if (def.provider === 'deepseek') {
    return (process.env.DEEPSEEK_BASE_URL || def.baseUrl).trim();
  }
  if (def.provider === 'zhipu') {
    return (process.env.ZHIPU_BASE_URL || def.baseUrl).trim();
  }
  if (def.provider === 'openai') {
    return (process.env.BASE_URL || def.baseUrl).trim();
  }
  return def.baseUrl;
}

/**
 * 将静态定义转为运行时 LLM 配置（含 apiKey，仅服务端使用）
 * @param {ProfileDef} def
 * @returns {import('./types').LlmRuntimeConfig}
 */
function defToRuntime(def) {
  const apiKey = def.localOllama
    ? (process.env.OPENAI_API_KEY || 'ollama').trim()
    : envKey(def.apiKeyEnv);
  return {
    profileId: def.id,
    label: def.label,
    provider: def.provider,
    model: def.localOllama ? ollamaModel(def) : def.model,
    baseUrl: resolveBaseUrl(def),
    apiKey,
  };
}

/**
 * 列出全部 profile（供 GET /api/llm/profiles，不含 apiKey）
 * @returns {import('./types').LlmProfileOption[]}
 */
function listLlmProfiles() {
  return CATALOG.map(d => ({
    id: d.id,
    label: d.label,
    provider: d.provider,
    model: d.localOllama ? ollamaModel(d) : d.model,
    available: profileAvailable(d),
  }));
}

/**
 * 平台默认 profile ID（Priority 3）
 * @param {Object} [appSettings] - config.appSettings
 * @returns {string}
 */
function getPlatformDefaultProfileId(appSettings) {
  const fromEnv = (process.env.LLM_DEFAULT_PROFILE || appSettings?.llm?.defaultProfileId || '').trim();
  if (fromEnv) {
    const def = CATALOG.find(d => d.id === fromEnv);
    if (def && profileAvailable(def)) return fromEnv;
  }
  const preferred = (process.env.LLM_PROVIDER || appSettings?.llm?.provider || 'ollama').trim().toLowerCase();
  const pick = CATALOG.find(d => profileAvailable(d) && d.provider === preferred);
  const any = CATALOG.find(d => profileAvailable(d));
  return pick?.id ?? any?.id ?? 'ollama-qwen';
}

/**
 * 按 profileId 解析运行时配置；不可用时依次回退
 * @param {string|null|undefined} profileId
 * @param {Object} [appSettings]
 * @returns {import('./types').LlmRuntimeConfig}
 */
function resolveLlmProfile(profileId, appSettings) {
  const id = (profileId || '').trim() || getPlatformDefaultProfileId(appSettings);
  const def = CATALOG.find(d => d.id === id);
  if (def && profileAvailable(def)) return defToRuntime(def);

  const fallbackId = getPlatformDefaultProfileId(appSettings);
  const fallback = CATALOG.find(d => d.id === fallbackId);
  if (fallback && profileAvailable(fallback)) return defToRuntime(fallback);

  const any = CATALOG.find(d => profileAvailable(d));
  if (any) return defToRuntime(any);

  return {
    profileId: 'env-fallback',
    label: '环境兜底',
    provider: 'ollama',
    model: appSettings?.llm?.ollamaModel || 'qwen3.6:latest',
    baseUrl: appSettings?.llm?.ollamaBaseUrl || 'http://localhost:11434/v1',
    apiKey: appSettings?.llm?.ollamaApiKeyPlaceholder || 'ollama',
  };
}

module.exports = {
  CATALOG,
  listLlmProfiles,
  getPlatformDefaultProfileId,
  resolveLlmProfile,
  profileAvailable,
};

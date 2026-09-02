/**
 * @file localLlm.js
 * @description 本地 / 云端 LLM 两套限制：本地收窄（超时、token、关 think），云端放宽。
 *              本地判定不限于 Ollama：provider 或 baseUrl 指向本机即视为本地。
 */

'use strict';

/** 本地默认超时：收窄「无限等」 */
const LOCAL_TIMEOUT_MS = 600000;
/** 云端默认超时：相对原 180s 放宽 */
const REMOTE_TIMEOUT_MS = 300000;
const LOCAL_DEFAULT_MAX_TOKENS = 2048;
const REMOTE_DEFAULT_MAX_TOKENS = 4096;

const LOCAL_PROVIDERS = new Set([
  'ollama',
  'lmstudio',
  'llamacpp',
  'llama.cpp',
  'vllm',
  'localai',
  'local-ai',
  'local',
]);

/**
 * 是否本机 / 局域网自建模型（含 Ollama、LM Studio、vLLM 等）
 * @param {import('./types').LlmRuntimeConfig|null|undefined} llm
 * @returns {boolean}
 */
function isLocalLlm(llm) {
  if (!llm || typeof llm !== 'object') return false;
  if (llm.localOllama) return true;
  const provider = String(llm.provider || '').trim().toLowerCase();
  if (LOCAL_PROVIDERS.has(provider)) return true;
  const base = String(llm.baseUrl || '').toLowerCase();
  return /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|host\.docker\.internal/.test(base);
}

/**
 * 解析单次 Chat 超时。显式 timeoutMs>0 优先；否则本地 10 分钟、云端 5 分钟。
 * @param {import('./types').LlmRuntimeConfig|null|undefined} llm
 * @param {number|undefined} timeoutMs
 * @returns {number}
 */
function resolveLlmTimeout(llm, timeoutMs) {
  const n = Number(timeoutMs);
  if (Number.isFinite(n) && n > 0) return n;
  return isLocalLlm(llm) ? LOCAL_TIMEOUT_MS : REMOTE_TIMEOUT_MS;
}

/**
 * 解析 max_tokens：本地用 localMaxTokens（收窄），云端用 maxTokens（放宽）。
 * @param {import('./types').LlmRuntimeConfig|null|undefined} llm
 * @param {{ maxTokens?: number, localMaxTokens?: number }} [opts]
 * @returns {number}
 */
function resolveMaxTokens(llm, opts = {}) {
  const local = isLocalLlm(llm);
  if (local) {
    const localN = Number(opts.localMaxTokens);
    if (Number.isFinite(localN) && localN > 0) return localN;
  }
  const n = Number(opts.maxTokens);
  if (Number.isFinite(n) && n > 0) return n;
  return local ? LOCAL_DEFAULT_MAX_TOKENS : REMOTE_DEFAULT_MAX_TOKENS;
}

/**
 * 本地模型关闭 think / 推理链，把 token 留给正文 JSON。
 * @param {import('./types').LlmRuntimeConfig|null|undefined} llm
 * @param {Record<string, unknown>} payload
 * @returns {Record<string, unknown>}
 */
function applyLocalChatOptions(llm, payload) {
  if (!isLocalLlm(llm)) return payload;
  return {
    ...payload,
    think: false,
  };
}

module.exports = {
  LOCAL_TIMEOUT_MS,
  REMOTE_TIMEOUT_MS,
  isLocalLlm,
  resolveLlmTimeout,
  resolveMaxTokens,
  applyLocalChatOptions,
};

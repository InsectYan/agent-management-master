/**
 * @file model.js
 * @description LlmRuntimeConfig → Pi Model（openai-completions）。
 */

'use strict';

/**
 * @param {import('../../llm/types').LlmRuntimeConfig} llm
 */
function resolveChatModel(llm) {
  const modelId = llm?.model || 'gpt-4o-mini';
  const baseUrl = (llm?.baseUrl || 'http://127.0.0.1:11434/v1').replace(/\/$/, '');
  return {
    id: modelId,
    name: modelId,
    api: 'openai-completions',
    provider: 'openai',
    baseUrl,
    reasoning: false,
    input: [ 'text' ],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8192,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      maxTokensField: 'max_tokens',
    },
  };
}

module.exports = { resolveChatModel };

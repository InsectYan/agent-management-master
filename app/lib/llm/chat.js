/**
 * @file chat.js
 * @description OpenAI 兼容 Chat Completions（fetch），供 Pi / LangChain / Loop / ReAct 共用。
 */

'use strict';

/**
 * @typedef {Object} ChatMessage
 * @property {'system'|'user'|'assistant'} role
 * @property {string} content
 */

/**
 * @typedef {Object} LlmChatHooks
 * @property {(payload: { phase: string, label: string, delta?: string }) => void} [onStatus]
 * @property {(payload: { delta: string, text: string }) => void} [onDelta]
 */

/**
 * 从 LLM 文本中提取 JSON 对象（支持 markdown 代码块）
 * @param {string} text
 * @returns {Record<string, unknown>|null}
 */
function extractJsonObject(text) {
  if (!text) return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = (fenced ? fenced[1] : text).trim();
  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(candidate.slice(start, end + 1));
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Hook 失败不中断 LLM 调用
 * @param {LlmChatHooks} [hooks]
 * @param {Object} payload
 */
function emitStatus(hooks, payload) {
  try {
    hooks?.onStatus?.(payload);
  } catch {
    // ignore
  }
}

/**
 * 非流式 Chat Completions
 * @param {Object} options
 * @param {import('./types').LlmRuntimeConfig} options.llm
 * @param {ChatMessage[]} options.messages
 * @param {number} [options.temperature]
 * @param {number} [options.maxTokens]
 * @param {LlmChatHooks} [options.hooks]
 * @returns {Promise<{ text: string, usage?: Record<string, number>, raw: unknown }>}
 */
async function llmChat(options) {
  const { llm, messages, temperature = 0.7, maxTokens = 2048, hooks } = options;
  const base = (llm.baseUrl || '').replace(/\/$/, '');
  const url = `${base}/chat/completions`;

  emitStatus(hooks, { phase: 'llm', label: '正在调用模型…' });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${llm.apiKey || 'ollama'}`,
    },
    body: JSON.stringify({
      model: llm.model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    }),
  });

  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = raw?.error?.message || raw?.message || res.statusText || 'LLM 请求失败';
    throw new Error(`LLM ${res.status}: ${msg}`);
  }

  const text = String(raw?.choices?.[0]?.message?.content || '').trim();
  return { text, usage: raw?.usage, raw };
}

/**
 * 流式 Chat Completions（SSE delta 推送给 hooks.onDelta）
 * @param {Object} options
 * @param {import('./types').LlmRuntimeConfig} options.llm
 * @param {ChatMessage[]} options.messages
 * @param {number} [options.temperature]
 * @param {number} [options.maxTokens]
 * @param {LlmChatHooks} options.hooks
 * @returns {Promise<{ text: string, raw: unknown }>}
 */
async function llmChatStream(options) {
  const { llm, messages, temperature = 0.7, maxTokens = 2048, hooks } = options;
  const base = (llm.baseUrl || '').replace(/\/$/, '');
  const url = `${base}/chat/completions`;

  emitStatus(hooks, { phase: 'llm', label: '正在流式生成…' });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${llm.apiKey || 'ollama'}`,
    },
    body: JSON.stringify({
      model: llm.model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`LLM stream ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    return llmChat({ llm, messages, temperature, maxTokens, hooks });
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const chunk = JSON.parse(payload);
        const delta = chunk?.choices?.[0]?.delta?.content || '';
        if (delta) {
          text += delta;
          hooks?.onDelta?.({ delta, text });
        }
      } catch {
        // 忽略不完整 chunk
      }
    }
  }

  return { text: text.trim(), raw: null };
}

/**
 * 判断 LLM 是否可用（有 baseUrl 且 apiKey 或 Ollama 占位）
 * @param {import('./types').LlmRuntimeConfig} llm
 * @returns {boolean}
 */
function llmAvailable(llm) {
  return Boolean((llm?.baseUrl || '').trim());
}

module.exports = {
  llmChat,
  llmChatStream,
  extractJsonObject,
  llmAvailable,
};

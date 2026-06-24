/**
 * @file embeddings.js
 * @description 文本向量化：Ollama / OpenAI 兼容 embeddings API。
 */

'use strict';

const EMBED_DIM = 768;

/**
 * @param {number[]} vec
 * @returns {number[]}
 */
function normalize(vec) {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map(v => v / norm);
}

/**
 * 确定性 hash 向量（无 API 时降级）
 * @param {string} text
 * @returns {number[]}
 */
function hashEmbed(text) {
  const out = new Array(EMBED_DIM).fill(0);
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    const bucket = (s.charCodeAt(i) * (i + 1)) % EMBED_DIM;
    out[bucket] += 1;
  }
  return normalize(out);
}

/**
 * Ollama native embeddings
 * @param {string} text
 * @param {Object} options
 */
async function ollamaEmbed(text, options = {}) {
  const base = (options.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434')
    .replace(/\/v1\/?$/, '');
  const model = options.model || process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
  const res = await fetch(`${base}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: text }),
  });
  if (!res.ok) throw new Error(`Ollama embed ${res.status}`);
  const data = await res.json();
  const emb = data?.embedding;
  if (!Array.isArray(emb) || !emb.length) throw new Error('empty embedding');
  return normalize(emb.slice(0, EMBED_DIM));
}

/**
 * OpenAI-compatible /v1/embeddings
 * @param {string} text
 * @param {Object} llm
 */
async function openAiEmbed(text, llm) {
  const base = (llm.baseUrl || '').replace(/\/$/, '');
  const res = await fetch(`${base}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${llm.apiKey || 'ollama'}`,
    },
    body: JSON.stringify({
      model: llm.embedModel || llm.model || 'text-embedding-3-small',
      input: text,
    }),
  });
  if (!res.ok) throw new Error(`embeddings ${res.status}`);
  const data = await res.json();
  const emb = data?.data?.[0]?.embedding;
  if (!Array.isArray(emb)) throw new Error('empty embedding');
  return normalize(emb.slice(0, EMBED_DIM));
}

/**
 * @param {string} text
 * @param {Object} [options]
 * @param {import('../llm/types').LlmRuntimeConfig} [options.llm]
 */
async function embedText(text, options = {}) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return hashEmbed('');

  try {
    if (options.llm?.baseUrl) {
      return await openAiEmbed(trimmed, options.llm);
    }
    return await ollamaEmbed(trimmed, options);
  } catch {
    return hashEmbed(trimmed);
  }
}

/**
 * pgvector 字面量
 * @param {number[]} vec
 */
function toPgVector(vec) {
  return `[${vec.join(',')}]`;
}

module.exports = {
  EMBED_DIM,
  embedText,
  hashEmbed,
  toPgVector,
};

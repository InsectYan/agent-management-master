/**
 * @file generate.js
 * @description 按 media_profile 调用厂商出图。视频 catalog 有条目但 generateReady=false。
 */

'use strict';

const { resolveMedia } = require('./resolveMedia');

function fail(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

async function postJson(url, { apiKey, body, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || 120000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const msg = data?.error?.message || data?.message || data?.msg || text || `HTTP ${res.status}`;
      throw fail(res.status >= 500 ? 502 : res.status, 'MEDIA_PROVIDER_ERROR', msg);
    }
    return data;
  } catch (err) {
    if (err.code) throw err;
    if (err.name === 'AbortError') {
      throw fail(504, 'MEDIA_TIMEOUT', '出图超时');
    }
    throw fail(502, 'MEDIA_PROVIDER_ERROR', err.message || '厂商请求失败');
  } finally {
    clearTimeout(timer);
  }
}

function pickImagePayload(data) {
  const first = data?.data?.[0] || data?.data || null;
  const item = Array.isArray(data?.data) ? data.data[0] : first;
  if (!item || typeof item !== 'object') {
    throw fail(502, 'MEDIA_EMPTY', '厂商未返回图片');
  }
  const b64 = item.b64_json || item.b64 || item.image_base64 || '';
  const url = item.url || item.image_url || '';
  if (!b64 && !url) {
    throw fail(502, 'MEDIA_EMPTY', '厂商未返回图片地址');
  }
  return { b64, url, mime: b64 ? 'image/png' : 'image/png' };
}

async function generateOpenAiImage(runtime, prompt, size) {
  const data = await postJson(`${runtime.baseUrl}/images/generations`, {
    apiKey: runtime.apiKey,
    body: {
      model: runtime.model,
      prompt,
      n: 1,
      size: size || runtime.defaultSize || '1024x1024',
    },
  });
  return pickImagePayload(data);
}

async function generateZhipuImage(runtime, prompt, size) {
  const data = await postJson(`${runtime.baseUrl}/images/generations`, {
    apiKey: runtime.apiKey,
    body: {
      model: runtime.model,
      prompt,
      size: size || runtime.defaultSize || '1024x1024',
    },
  });
  return pickImagePayload(data);
}

function usableApiKey(key) {
  const v = String(key || '').trim();
  return v && v.toLowerCase() !== 'ollama';
}

/**
 * @param {Object} input
 * @param {string} input.prompt
 * @param {'image'|'video'} [input.kind]
 * @param {string} [input.requestProfileId]
 * @param {string} [input.size]
 * @param {Object} [input.appSettings]
 */
async function generateMedia(input) {
  const kind = input.kind || 'image';
  const prompt = String(input.prompt || '').trim();
  if (!prompt) {
    throw fail(400, 'PROMPT_REQUIRED', 'prompt 不能为空');
  }

  const runtime = resolveMedia({
    requestProfileId: input.requestProfileId,
    appSettings: input.appSettings,
  });

  if (!runtime.modalities.includes(kind)) {
    throw fail(
      400,
      'MEDIA_MODALITY_UNSUPPORTED',
      `当前多模态模型「${runtime.label}」不支持${kind === 'image' ? '图片' : '视频'}，请在侧栏改选`,
    );
  }

  if (!usableApiKey(runtime.apiKey)) {
    throw fail(400, 'MEDIA_UNAVAILABLE', `多模态模型「${runtime.label}」不可用，请配置 ${runtime.apiKeyEnv} 或改选侧栏模型`);
  }

  if (!runtime.generateReady) {
    throw fail(
      501,
      'MEDIA_GENERATE_UNIMPLEMENTED',
      `「${runtime.label}」已列入多模态选项，出图/出视频接口尚未接通，请改选 generate 已就绪的模型（如 OpenAI GPT Image / DALL·E 3 / 智谱 CogView）`,
    );
  }

  let payload;
  if (kind === 'image' && runtime.provider === 'openai') {
    payload = await generateOpenAiImage(runtime, prompt, input.size);
  } else if (kind === 'image' && runtime.provider === 'zhipu') {
    payload = await generateZhipuImage(runtime, prompt, input.size);
  } else {
    throw fail(501, 'MEDIA_GENERATE_UNIMPLEMENTED', `提供商 ${runtime.provider} 的 ${kind} 生成尚未实现`);
  }

  return {
    kind,
    ...payload,
    media_profile_id: runtime.profileIdUsed,
    media_label: runtime.label,
    media_source: runtime.source,
    model: runtime.model,
  };
}

module.exports = { generateMedia };

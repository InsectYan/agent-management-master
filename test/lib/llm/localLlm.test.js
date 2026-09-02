'use strict';

const { strict: assert } = require('node:assert');
const {
  isLocalLlm,
  resolveLlmTimeout,
  resolveMaxTokens,
  applyLocalChatOptions,
  LOCAL_TIMEOUT_MS,
  REMOTE_TIMEOUT_MS,
} = require('../../../app/lib/llm/localLlm');

describe('test/lib/llm/localLlm.test.js', () => {
  it('ollama / localOllama / 本机 baseUrl 视为本地', () => {
    assert.equal(isLocalLlm({ localOllama: true, provider: 'openai' }), true);
    assert.equal(isLocalLlm({ provider: 'ollama' }), true);
    assert.equal(isLocalLlm({ provider: 'lmstudio' }), true);
    assert.equal(isLocalLlm({ provider: 'openai', baseUrl: 'http://127.0.0.1:8000/v1' }), true);
    assert.equal(isLocalLlm({ provider: 'openai', baseUrl: 'http://host.docker.internal:11434/v1' }), true);
  });

  it('云端 profile 不视为本地', () => {
    assert.equal(isLocalLlm({ provider: 'openai', baseUrl: 'https://api.openai.com/v1' }), false);
    assert.equal(isLocalLlm({ provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1' }), false);
    assert.equal(isLocalLlm(null), false);
  });

  it('超时：显式值优先，否则本地 10 分钟、云端 5 分钟', () => {
    const local = { provider: 'ollama' };
    const remote = { provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1' };
    assert.equal(resolveLlmTimeout(local), LOCAL_TIMEOUT_MS);
    assert.equal(resolveLlmTimeout(remote), REMOTE_TIMEOUT_MS);
    assert.equal(resolveLlmTimeout(local, 120000), 120000);
    assert.equal(resolveLlmTimeout(remote, 0), REMOTE_TIMEOUT_MS);
  });

  it('maxTokens：本地走 localMaxTokens，云端走 maxTokens', () => {
    const local = { provider: 'ollama' };
    const remote = { provider: 'zhipu', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' };
    assert.equal(resolveMaxTokens(local, { maxTokens: 24576, localMaxTokens: 8192 }), 8192);
    assert.equal(resolveMaxTokens(remote, { maxTokens: 24576, localMaxTokens: 8192 }), 24576);
  });

  it('仅本地请求带 think:false', () => {
    const payload = { model: 'x', stream: false };
    assert.deepEqual(applyLocalChatOptions({ provider: 'ollama' }, payload).think, false);
    assert.equal(applyLocalChatOptions({
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
    }, payload).think, undefined);
  });
});

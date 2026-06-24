'use strict';

const { strict: assert } = require('node:assert');
const { resolveLlm } = require('../../../app/lib/llm/resolveLlm');

describe('test/lib/llm/resolveLlm.test.js', () => {
  const appSettings = {
    llm: {
      defaultProfileId: 'ollama-qwen',
      ollamaBaseUrl: 'http://localhost:11434/v1',
      ollamaModel: 'qwen3.6:latest',
      ollamaApiKeyPlaceholder: 'ollama',
    },
  };

  before(() => {
    process.env.OPENAI_API_KEY = 'ollama';
  });

  it('P3 平台默认 Ollama profile', () => {
    const llm = resolveLlm({ appSettings });
    assert.equal(llm.profileIdUsed, 'ollama-qwen');
    assert.equal(llm.source, 'platform');
    assert.ok(llm.baseUrl.includes('11434'));
  });

  it('P1 请求 profile 优先于 Skill 默认', () => {
    const llm = resolveLlm({
      requestProfileId: 'ollama-qwen',
      skillDefaultProfile: 'openai-mini',
      appSettings,
    });
    assert.equal(llm.source, 'request');
    assert.equal(llm.profileIdUsed, 'ollama-qwen');
  });

  it('P2 Skill 默认 profile', () => {
    const llm = resolveLlm({
      skillDefaultProfile: 'ollama-qwen',
      appSettings,
    });
    assert.equal(llm.source, 'skill');
  });
});

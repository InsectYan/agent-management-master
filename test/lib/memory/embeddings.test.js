'use strict';

const { strict: assert } = require('node:assert');
const { EMBED_DIM, hashEmbed, toPgVector, embedText } = require('../../../app/lib/memory/embeddings');

describe('test/lib/memory/embeddings.test.js', () => {
  it('hashEmbed 返回固定维度归一化向量', () => {
    const v = hashEmbed('hello');
    assert.equal(v.length, EMBED_DIM);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    assert.ok(Math.abs(norm - 1) < 1e-6);
  });

  it('相同文本 hashEmbed 结果一致', () => {
    assert.deepEqual(hashEmbed('test'), hashEmbed('test'));
  });

  it('toPgVector 格式正确', () => {
    const s = toPgVector([ 1, 2, 3 ]);
    assert.equal(s, '[1,2,3]');
  });

  it('embedText 空字符串走 hash 降级', async () => {
    const v = await embedText('');
    assert.equal(v.length, EMBED_DIM);
  });

  it('embedText API 失败时 hash 降级', async () => {
    const v = await embedText('fallback test', {
      llm: { baseUrl: 'http://127.0.0.1:1', apiKey: 'x', model: 'x' },
    });
    assert.equal(v.length, EMBED_DIM);
  });
});

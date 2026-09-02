'use strict';

const { strict: assert } = require('node:assert');
const {
  parseWriterStep,
  salvageBodyFromTruncated,
} = require('../../../plugins/novel-writer-skill/lib/schemaHints');

describe('test/lib/novel-writer/schemaHints.test.js', () => {
  it('完整 JSON 解析 patch.body', () => {
    const raw = JSON.stringify({
      done: true,
      reply: '已写好本章',
      patch: { body: '# 标题\n\n正文段落。' },
    });
    const out = parseWriterStep(raw);
    assert.match(out.patch.body, /正文段落/);
    assert.equal(out.reply, '已写好本章');
  });

  it('截断 JSON 抢救 patch.body', () => {
    const raw = '{"done":true,"reply":"已生成第四章","patch":{"body":"# 自然的求救信号\\n\\n叶蔓掌心的白花尚未完全熄灭，林鸣听见地下更深处传来一声微弱的哭腔。这段足够长，用来通过抢救阈值。';
    const body = salvageBodyFromTruncated(raw);
    assert.ok(body.includes('叶蔓掌心'));
    const out = parseWriterStep(raw);
    assert.ok(out.patch.body && out.patch.body.includes('自然的求救信号'));
    assert.match(out.reply, /已生成第四章/);
  });

  it('jsonrepair 补全尾部残缺', () => {
    const raw = '{"done":true,"reply":"ok","patch":{"body":"完整一章正文，至少四十个字用来过抢救门槛。abcdefghij"}}';
    const out = parseWriterStep(raw.replace(/\}$/, ''));
    assert.ok(String(out.patch.body || '').length > 10);
  });
});

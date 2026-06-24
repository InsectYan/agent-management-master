'use strict';

const { strict: assert } = require('node:assert');
const { parseOutboxJson } = require('../../../../app/lib/schemes/pi/parseOutboxJson');

describe('test/lib/schemes/pi/parseOutboxJson.test.js', () => {
  it('解析合法 JSON', () => {
    const obj = parseOutboxJson('{"reply":"hi","intent":"chat"}');
    assert.equal(obj.reply, 'hi');
    assert.equal(obj.intent, 'chat');
  });

  it('jsonrepair 修复尾随逗号', () => {
    const obj = parseOutboxJson('{"reply":"ok",}');
    assert.equal(obj.reply, 'ok');
  });

  it('空内容抛出 SyntaxError', () => {
    assert.throws(() => parseOutboxJson(''), SyntaxError);
  });
});

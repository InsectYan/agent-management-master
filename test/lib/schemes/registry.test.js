'use strict';

const { strict: assert } = require('node:assert');
const { registry, SchemeRegistry } = require('../../../app/lib/schemes/registry');
const AgentExecutor = require('../../../app/lib/schemes/base/executor');

describe('test/lib/schemes/registry.test.js', () => {
  it('内置方案已注册', () => {
    const ids = registry.listSchemeIds();
    assert.ok(ids.includes('pi'));
    assert.ok(ids.includes('langchain'));
    assert.ok(ids.includes('loop'));
    assert.ok(ids.includes('react'));
  });

  it('createExecutor 按 scheme 创建实例', () => {
    const skill = { name: 'probe-skill', scheme: 'pi' };
    const ex = registry.createExecutor('pi', skill);
    assert.ok(ex instanceof AgentExecutor);
    assert.equal(ex.isReady(), true);
  });

  it('未知 scheme 抛出错误', () => {
    assert.throws(
      () => registry.createExecutor('unknown', { name: 'x', scheme: 'unknown' }),
      /未注册的 Agent 方案/
    );
  });

  it('register 要求 schemeId', () => {
    const reg = new SchemeRegistry();
    class BadExecutor extends AgentExecutor {
      static get schemeId() { return ''; }
    }
    assert.throws(() => reg.register(BadExecutor), /schemeId/);
  });
});

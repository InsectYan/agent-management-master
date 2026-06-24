'use strict';

const { strict: assert } = require('node:assert');
const { app } = require('egg-mock/bootstrap');

describe('test/app/service/memoryEngine.test.js', () => {
  let ctx;

  before(() => {
    ctx = app.mockContext();
  });

  it('initAll 加载 note + research 记忆', () => {
    const enabled = ctx.service.memoryEngine.listEnabled();
    const names = enabled.map(e => e.skill);
    assert.ok(names.includes('note-skill'));
    assert.ok(names.includes('research-skill'));
  });

  it('file 记忆 append / getContext / search', async () => {
    const text = `ut-${Date.now()} 偏好简短`;
    await ctx.service.memoryEngine.append('note-skill', text, '偏好');

    const ctxText = await ctx.service.memoryEngine.getContext('note-skill', '简短');
    assert.ok(ctxText.includes('简短'));

    const search = await ctx.service.memoryEngine.search('note-skill', '简短', 3);
    assert.equal(search.type, 'file');
    assert.ok(search.results.length >= 1);
  });

  it('vector 记忆 append / search', async () => {
    const text = `vector-ut-${Date.now()} PostgreSQL pgvector`;
    await ctx.service.memoryEngine.append('research-skill', text);

    const search = await ctx.service.memoryEngine.search('research-skill', 'pgvector', 3);
    assert.equal(search.type, 'vector');
    assert.ok(search.results.length >= 1);
  });

  it('applyOps 追加 memory_ops', async () => {
    const meta = await ctx.service.memoryEngine.applyOps('note-skill', [
      { op: 'append', text: `ops-${Date.now()}`, section: '事实' },
    ]);
    assert.equal(meta.applied, 1);
  });

  it('未启用记忆的 Skill 404', async () => {
    await assert.rejects(
      () => ctx.service.memoryEngine.read('qa-skill'),
      err => err.status === 404
    );
  });
});

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { strict: assert } = require('node:assert');
const { initDb, closeDb } = require('../../../app/lib/db/pool');
const { VectorMemory, tokenize } = require('../../../app/lib/memory/vectorMemory');

describe('test/lib/memory/vectorMemory.test.js', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-vec-'));
    process.env.DATABASE_URL = '';
    await closeDb();
    await initDb({ root: tmpDir, sqlitePath: path.join(tmpDir, 'v.sqlite') });
  });

  afterEach(async () => {
    await closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('tokenize 分词', () => {
    assert.deepEqual(tokenize('Egg.js 插件'), [ 'egg.js', '插件' ]);
  });

  it('insert / search 关键词匹配', async () => {
    const mem = new VectorMemory({ skillName: 'ut-skill', table: 'ut_mem' });
    await mem.insert('Egg.js 插件生命周期 beforeStart');
    await mem.insert('天气查询 LangChain');

    const hits = await mem.search('Egg.js', 5);
    assert.ok(hits.length >= 1);
    assert.ok(hits[0].content.includes('Egg.js'));
    assert.ok(hits[0].score > 0);
  });

  it('readSummary 返回最近条目', async () => {
    const mem = new VectorMemory({ skillName: 'ut-skill', table: 'ut_mem2' });
    await mem.insert('summary line one');
    const summary = await mem.readSummary();
    assert.ok(summary.includes('summary line one'));
  });

  it('destroy 清空数据', async () => {
    const mem = new VectorMemory({ skillName: 'ut-skill', table: 'ut_mem3' });
    await mem.insert('to delete');
    await mem.destroy();
    const hits = await mem.search('delete', 5);
    assert.equal(hits.length, 0);
  });
});

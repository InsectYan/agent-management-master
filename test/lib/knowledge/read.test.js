'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { strict: assert } = require('node:assert');
const { readPage, search } = require('../../../app/lib/knowledge');

describe('test/lib/knowledge/read.test.js', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-kb-'));
    fs.mkdirSync(path.join(root, 'platform'), { recursive: true });
    fs.mkdirSync(path.join(root, 'testgen'), { recursive: true });
    fs.writeFileSync(path.join(root, 'platform', 'a.md'), 'platform body', 'utf-8');
    fs.writeFileSync(path.join(root, 'testgen', 'a.md'), 'testgen body', 'utf-8');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('只读到本项目的页', () => {
    assert.equal(readPage(root, 'platform', 'a.md'), 'platform body');
    const hits = search(root, 'platform', 'platform', 5);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].page, 'a.md');
    assert.equal(search(root, 'platform', 'testgen', 5).length, 0);
  });

  it('拒绝跳出项目目录', () => {
    assert.throws(() => readPage(root, 'platform', '../testgen/a.md'), err => err.code === 'KNOWLEDGE_ESCAPE');
    assert.throws(() => readPage(root, 'platform', '/tmp/secret.md'), err => err.code === 'KNOWLEDGE_ESCAPE');
  });
});

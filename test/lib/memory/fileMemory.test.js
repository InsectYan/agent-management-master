'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { strict: assert } = require('node:assert');
const { FileMemory, memoryFilePath } = require('../../../app/lib/memory/fileMemory');

describe('test/lib/memory/fileMemory.test.js', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-file-mem-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('memoryFilePath 安全化 skill 名', () => {
    const p = memoryFilePath(root, 'note-skill');
    assert.ok(p.endsWith(path.join('note-skill', 'MEMORY.md')));
  });

  it('read / append / search', () => {
    const mem = new FileMemory({ skillName: 'ut-file', root });
    const initial = mem.read();
    assert.ok(initial.includes('ut-file'));

    mem.append('偏好：回复简短', '偏好');
    const hits = mem.search('简短', 3);
    assert.ok(hits.some(l => l.includes('简短')));

    mem.destroy();
    assert.equal(fs.existsSync(mem.filePath), false);
  });
});

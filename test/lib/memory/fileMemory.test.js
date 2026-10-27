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
    const p = memoryFilePath(root, 'note-skill', 'platform');
    assert.ok(p.endsWith(path.join('platform', 'note-skill', 'MEMORY.md')));
  });

  it('作品记忆落在作品目录', () => {
    const mem = new FileMemory({ skillName: 'novel-writer-skill', projectId: 'novel', workId: '15', root });
    mem.append('风格/style：选悬疑', '作品');
    assert.ok(mem.filePath.includes(path.join('novel', 'works', 'work_15', 'novel-writer-skill', 'MEMORY.md')));
    assert.ok(mem.read().includes('选悬疑'));
  });

  it('read / append / search', () => {
    const mem = new FileMemory({ skillName: 'ut-file', projectId: 'platform', root });
    const initial = mem.read();
    assert.ok(initial.includes('ut-file'));

    mem.append('偏好：回复简短', '偏好');
    const hits = mem.search('简短', 3);
    assert.ok(hits.some(l => l.includes('简短')));

    mem.destroy();
    assert.equal(fs.existsSync(mem.filePath), false);
  });
});

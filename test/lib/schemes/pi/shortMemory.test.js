'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { strict: assert } = require('node:assert');
const {
  truncateSessionJsonl,
  noteCompactFailure,
} = require('../../../../app/lib/schemes/pi/memory/short');

describe('test/lib/schemes/pi/shortMemory.test.js', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-short-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('按 firstKeptEntryId 截断并保留 session 头', () => {
    const file = path.join(dir, 's.jsonl');
    const lines = [
      { type: 'session', id: 'h' },
      { type: 'message', id: 'a', text: 'old' },
      { type: 'message', id: 'b', text: 'keep' },
    ];
    fs.writeFileSync(file, lines.map(item => JSON.stringify(item)).join('\n') + '\n', 'utf-8');
    const result = truncateSessionJsonl(file, 'b');
    assert.equal(result.truncated, true);
    const kept = fs.readFileSync(file, 'utf-8');
    assert.ok(kept.includes('"id":"h"') || kept.includes('"id": "h"'));
    assert.equal(kept.includes('"id":"a"') || kept.includes('"id": "a"'), false);
    assert.ok(kept.includes('keep'));
  });

  it('连续两次压缩失败后归档', () => {
    const file = path.join(dir, 's.jsonl');
    fs.writeFileSync(file, '{}\n', 'utf-8');
    const first = noteCompactFailure(file);
    assert.equal(first.archived, null);
    const second = noteCompactFailure(file);
    assert.ok(second.archived);
    assert.equal(fs.existsSync(file), false);
    assert.ok(fs.existsSync(second.archived));
  });
});

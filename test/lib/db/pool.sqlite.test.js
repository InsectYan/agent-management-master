'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { strict: assert } = require('node:assert');
const { initDb, queryAll, runSql, closeDb, isPostgres, getDbKind } = require('../../../app/lib/db/pool');

describe('test/lib/db/pool.sqlite.test.js', () => {
  let tmpDir;
  let sqlitePath;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-pool-'));
    sqlitePath = path.join(tmpDir, 'unit.sqlite');
    process.env.DATABASE_URL = '';
    await closeDb();
    await initDb({ root: tmpDir, sqlitePath });
  });

  afterEach(async () => {
    await closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('无 DATABASE_URL 时使用 SQLite', () => {
    assert.equal(isPostgres(), false);
    assert.equal(getDbKind(), 'sqlite');
  });

  it('queryAll / runSql 占位符查询', async () => {
    await runSql(
      `CREATE TABLE IF NOT EXISTS ut_items (id INTEGER PRIMARY KEY, name TEXT)`
    );
    const info = await runSql(`INSERT INTO ut_items (name) VALUES (?)`, [ 'alpha' ]);
    assert.ok(info.lastInsertRowid > 0);

    const rows = await queryAll(`SELECT name FROM ut_items WHERE name = ?`, [ 'alpha' ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, 'alpha');
  });
});

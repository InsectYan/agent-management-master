/**
 * @file sqlitePool.js
 * @description SQLite 回退（无 DATABASE_URL 时 npm run dev 可用）。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { setDialect } = require('./dialect');

/** @type {import('sql.js').Database|null} */
let _db = null;
/** @type {string|null} */
let _dbPath = null;

function queryAll(sql, params = []) {
  const db = getSqliteDb();
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function persistDb() {
  if (!_db || !_dbPath) return;
  fs.writeFileSync(_dbPath, Buffer.from(_db.export()));
}

async function initSqlitePool(appSettings) {
  if (_db) return _db;
  setDialect('sqlite');

  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const dataDir = path.join(appSettings.root, 'data');
  _dbPath = (appSettings.sqlitePath || process.env.SQLITE_PATH || '').trim()
    || path.join(dataDir, 'agent.sqlite');
  fs.mkdirSync(path.dirname(_dbPath), { recursive: true });

  _db = fs.existsSync(_dbPath)
    ? new SQL.Database(fs.readFileSync(_dbPath))
    : new SQL.Database();

  _db.run(`
    CREATE TABLE IF NOT EXISTS plugin_registry (
      skill_name TEXT PRIMARY KEY,
      version TEXT,
      scheme TEXT,
      db_tables TEXT,
      enabled INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  persistDb();
  return _db;
}

function getSqliteDb() {
  if (!_db) throw new Error('SQLite 未初始化');
  return _db;
}

function execSql(sql) {
  getSqliteDb().exec(sql);
  persistDb();
}

function runSql(sql, params = []) {
  getSqliteDb().run(sql, params);
  const row = queryAll('SELECT last_insert_rowid() AS id, changes() AS changes');
  persistDb();
  return { lastInsertRowid: Number(row[0]?.id || 0), changes: Number(row[0]?.changes || 0) };
}

function closeSqlitePool() {
  if (_db) {
    persistDb();
    _db.close();
    _db = null;
  }
}

module.exports = {
  initSqlitePool,
  queryAll,
  runSql,
  execSql,
  closeSqlitePool,
};

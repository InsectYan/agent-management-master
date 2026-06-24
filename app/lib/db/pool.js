/**
 * @file pool.js
 * @description 本地 SQLite 连接（sql.js 纯 JS 实现，免原生编译）。默认 data/agent.sqlite。
 */

'use strict';

const fs = require('fs');
const path = require('path');

/** @type {import('sql.js').Database|null} */
let _db = null;
/** @type {string|null} */
let _dbPath = null;

/**
 * 将 sql.js 查询结果转为对象数组
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Record<string, unknown>[]}
 */
function queryAll(sql, params = []) {
  const db = getDb();
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

/**
 * 持久化数据库到磁盘
 */
function persistDb() {
  if (!_db || !_dbPath) return;
  const data = _db.export();
  fs.writeFileSync(_dbPath, Buffer.from(data));
}

/**
 * 初始化 SQLite（须在 beforeStart 中 await）
 * @param {Object} appSettings - config.appSettings
 * @returns {Promise<import('sql.js').Database>}
 */
async function initDb(appSettings) {
  if (_db) return _db;

  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  const dataDir = path.join(appSettings.root, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  _dbPath = process.env.SQLITE_PATH || path.join(dataDir, 'agent.sqlite');

  if (fs.existsSync(_dbPath)) {
    const fileBuffer = fs.readFileSync(_dbPath);
    _db = new SQL.Database(fileBuffer);
  } else {
    _db = new SQL.Database();
  }

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

/**
 * 获取已初始化的数据库实例
 * @returns {import('sql.js').Database}
 */
function getDb() {
  if (!_db) {
    throw new Error('数据库未初始化，请在 app.beforeStart 中调用 initDb');
  }
  return _db;
}

/**
 * 执行 SQL 文件（多条语句）
 * @param {string} sql
 */
function execSql(sql) {
  const db = getDb();
  db.exec(sql);
  persistDb();
}

/**
 * 执行 INSERT/UPDATE 并返回 lastInsertRowid
 * @param {string} sql
 * @param {unknown[]} params
 * @returns {{ lastInsertRowid: number, changes: number }}
 */
function runSql(sql, params = []) {
  const db = getDb();
  db.run(sql, params);
  const row = queryAll('SELECT last_insert_rowid() AS id, changes() AS changes');
  persistDb();
  return {
    lastInsertRowid: Number(row[0]?.id || 0),
    changes: Number(row[0]?.changes || 0),
  };
}

/**
 * 关闭数据库
 */
function closeDb() {
  if (_db) {
    persistDb();
    _db.close();
    _db = null;
  }
}

module.exports = {
  initDb,
  getDb,
  execSql,
  runSql,
  queryAll,
  persistDb,
  closeDb,
};

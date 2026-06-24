/**
 * @file pool.js
 * @description 统一 DB 入口：优先 PostgreSQL（DATABASE_URL），否则回退 sql.js SQLite。
 */

'use strict';

const { getDialect, isPostgres, toPgParams } = require('./dialect');
const pg = require('./pgPool');
const sqlite = require('./sqlitePool');

async function initDb(appSettings) {
  const url = (appSettings.databaseUrl || process.env.DATABASE_URL || '').trim();
  if (url) {
    await pg.initPgPool(url);
    return pg.getPgPool();
  }
  return sqlite.initSqlitePool(appSettings);
}

function getDbKind() {
  return getDialect();
}

async function queryAll(sql, params = []) {
  if (isPostgres()) {
    if (sql.includes('?')) {
      const { text, values } = toPgParams(sql, params);
      return pg.queryAll(text, values);
    }
    return pg.queryAll(sql, params);
  }
  return sqlite.queryAll(sql, params);
}

async function runSql(sql, params = []) {
  if (isPostgres()) {
    let pgSql = sql;
    if (/^\s*INSERT/i.test(pgSql) && !/RETURNING/i.test(pgSql)) {
      pgSql = `${pgSql.trim().replace(/;?\s*$/, '')} RETURNING id`;
    }
    if (pgSql.includes('?')) {
      const { text, values } = toPgParams(pgSql, params);
      return pg.runSql(text, values);
    }
    return pg.runSql(pgSql, params);
  }
  return sqlite.runSql(sql, params);
}

async function execSql(sql) {
  if (isPostgres()) return pg.execSql(sql);
  return sqlite.execSql(sql);
}

async function closeDb() {
  if (isPostgres()) return pg.closePgPool();
  return sqlite.closeSqlitePool();
}

module.exports = {
  initDb,
  getDbKind,
  queryAll,
  runSql,
  execSql,
  closeDb,
  isPostgres,
  getPgPool: () => pg.getPgPool(),
};

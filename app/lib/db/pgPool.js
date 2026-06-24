/**
 * @file pgPool.js
 * @description PostgreSQL 连接池（pg + pgvector）。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { setDialect } = require('./dialect');

/** @type {import('pg').Pool|null} */
let _pool = null;

/**
 * @param {string} connectionString
 * @returns {Promise<import('pg').Pool>}
 */
async function initPgPool(connectionString) {
  if (_pool) return _pool;

  _pool = new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
  });

  setDialect('postgres');

  const initPath = path.join(__dirname, 'platform', 'init.pg.sql');
  if (fs.existsSync(initPath)) {
    const sql = fs.readFileSync(initPath, 'utf8');
    await _pool.query(sql);
  }

  return _pool;
}

/**
 * @returns {import('pg').Pool}
 */
function getPgPool() {
  if (!_pool) throw new Error('PostgreSQL 未初始化，请设置 DATABASE_URL');
  return _pool;
}

/**
 * @param {string} sql
 * @param {unknown[]} [params]
 */
async function queryAll(sql, params = []) {
  const r = await getPgPool().query(sql, params);
  return r.rows;
}

/**
 * @param {string} sql
 * @param {unknown[]} [params]
 */
async function runSql(sql, params = []) {
  const r = await getPgPool().query(sql, params);
  const id = r.rows[0]?.id ?? r.rows[0]?.job_id;
  return {
    lastInsertRowid: id != null ? Number(id) : 0,
    changes: r.rowCount || 0,
    rows: r.rows,
  };
}

/**
 * @param {string} sql
 */
async function execSql(sql) {
  await getPgPool().query(sql);
}

async function closePgPool() {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

module.exports = {
  initPgPool,
  getPgPool,
  queryAll,
  runSql,
  execSql,
  closePgPool,
};

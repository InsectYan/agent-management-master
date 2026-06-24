/**
 * @file dialect.js
 * @description 数据库方言检测与 SQL 占位符转换。
 */

'use strict';

/** @type {'postgres'|'sqlite'} */
let _dialect = 'sqlite';

/**
 * @returns {'postgres'|'sqlite'}
 */
function getDialect() {
  return _dialect;
}

/**
 * @param {'postgres'|'sqlite'} dialect
 */
function setDialect(dialect) {
  _dialect = dialect;
}

/**
 * 是否 PostgreSQL
 */
function isPostgres() {
  return _dialect === 'postgres';
}

/**
 * SQLite `?` → PostgreSQL `$1,$2…`
 * @param {string} sql
 * @param {unknown[]} params
 */
function toPgParams(sql, params = []) {
  let i = 0;
  const text = sql.replace(/\?/g, () => `$${++i}`);
  return { text, values: params };
}

module.exports = {
  getDialect,
  setDialect,
  isPostgres,
  toPgParams,
};

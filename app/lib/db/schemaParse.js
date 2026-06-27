/**
 * @file schemaParse.js
 * @description 从 SQL DDL 解析表名与列定义（纯函数，无 DB 依赖）。
 */

'use strict';

/**
 * @param {string} sql
 * @returns {Record<string, Array<{ name: string, def: string }>>}
 */
function parseTableSchemasFromSql(sql) {
  /** @type {Record<string, Array<{ name: string, def: string }>>} */
  const schemas = {};
  const blockRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"|'([^']+)'|(\w+))\s*\(([\s\S]*?)\)\s*;/gi;
  let match;
  while ((match = blockRe.exec(sql)) !== null) {
    const tableName = (match[1] || match[2] || match[3]).toLowerCase();
    const body = match[4];
    const columns = [];
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim().replace(/,$/, '');
      if (!line || line.startsWith('--')) continue;
      if (/^(PRIMARY|UNIQUE|CONSTRAINT|FOREIGN|CHECK|\))/i.test(line)) continue;
      const colMatch = /^"?(\w+)"?\s+(.+)$/i.exec(line);
      if (!colMatch) continue;
      columns.push({
        name: colMatch[1].toLowerCase(),
        def: colMatch[2].trim().replace(/,$/, ''),
      });
    }
    schemas[tableName] = columns;
  }
  return schemas;
}

/**
 * @param {string} sql
 * @returns {string[]}
 */
function parseTableNamesFromSql(sql) {
  return Object.keys(parseTableSchemasFromSql(sql));
}

module.exports = {
  parseTableSchemasFromSql,
  parseTableNamesFromSql,
};

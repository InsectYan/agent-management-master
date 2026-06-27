/**
 * @file schemaSync.js
 * @description 启动时校验代码与数据库表结构差异：执行 DDL、补列、删除孤儿表（不删行数据）。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { execSql, queryAll, isPostgres } = require('./pool');
const { parseTableSchemasFromSql, parseTableNamesFromSql } = require('./schemaParse');

const PLATFORM_DIR = path.join(__dirname, 'platform');

/** PostgreSQL 系统/扩展表，不参与孤儿表清理 */
const PROTECTED_TABLES = new Set([
  'spatial_ref_sys',
  'schema_migrations',
]);

/**
 * @returns {Promise<string[]>}
 */
async function listDbTables() {
  if (isPostgres()) {
    const rows = await queryAll(`
      SELECT table_name AS name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    return rows.map(r => r.name);
  }
  const rows = await queryAll(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  `);
  return rows.map(r => r.name);
}

/**
 * @param {string} tableName
 * @returns {Promise<Set<string>>}
 */
async function getExistingColumns(tableName) {
  if (isPostgres()) {
    const rows = await queryAll(`
      SELECT column_name AS name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
    `, [ tableName ]);
    return new Set(rows.map(r => r.name.toLowerCase()));
  }
  const rows = await queryAll(`PRAGMA table_info("${tableName}")`);
  return new Set(rows.map(r => String(r.name).toLowerCase()));
}

/**
 * @param {import('egg').EggLogger} logger
 * @param {string} label
 * @param {string} filePath
 */
async function applySqlFile(logger, label, filePath) {
  if (!fs.existsSync(filePath)) return null;
  const sql = fs.readFileSync(filePath, 'utf8');
  await execSql(sql);
  logger.info('[SchemaSync] %s applied %s', label, path.basename(filePath));
  return sql;
}

/**
 * @param {import('egg').EggLogger} logger
 * @param {string} dir
 * @param {string} label
 */
async function applySqlMigrations(logger, dir, label) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir)
    .filter(name => name.endsWith('.sql'))
    .sort();
  for (const name of files) {
    await applySqlFile(logger, label, path.join(dir, name));
  }
}

/**
 * @param {import('egg').EggLogger} logger
 * @param {Record<string, Array<{ name: string, def: string }>>} schemas
 */
async function ensureColumnsFromSchemas(logger, schemas) {
  for (const [ tableName, columns ] of Object.entries(schemas)) {
    let existing;
    try {
      existing = await getExistingColumns(tableName);
    } catch {
      continue;
    }
    if (!existing.size) continue;

    for (const col of columns) {
      if (existing.has(col.name)) continue;
      const quotedTable = `"${tableName}"`;
      const quotedCol = `"${col.name}"`;
      const alterSql = isPostgres()
        ? `ALTER TABLE ${quotedTable} ADD COLUMN IF NOT EXISTS ${quotedCol} ${col.def}`
        : `ALTER TABLE ${quotedTable} ADD COLUMN ${quotedCol} ${col.def}`;
      try {
        await execSql(alterSql);
        logger.info('[SchemaSync] Added column %s.%s', tableName, col.name);
      } catch (err) {
        logger.warn('[SchemaSync] Add column %s.%s failed: %s', tableName, col.name, err.message);
      }
    }
  }
}

/**
 * @param {import('egg').EggLogger} logger
 * @param {Set<string>} expectedTables
 */
async function dropOrphanTables(logger, expectedTables) {
  const dbTables = await listDbTables();
  for (const table of dbTables) {
    if (expectedTables.has(table) || PROTECTED_TABLES.has(table)) continue;
    const dropSql = isPostgres()
      ? `DROP TABLE IF EXISTS "${table}" CASCADE`
      : `DROP TABLE IF EXISTS "${table}"`;
    await execSql(dropSql);
    logger.warn('[SchemaSync] Dropped orphan table: %s', table);
  }
}

/**
 * @param {import('egg').EggLogger} logger
 */
async function syncPlatformSchema(logger) {
  /** @type {Set<string>} */
  const expected = new Set(PROTECTED_TABLES);
  /** @type {Record<string, Array<{ name: string, def: string }>>} */
  let mergedSchemas = {};

  if (isPostgres()) {
    const initSql = await applySqlFile(logger, 'Platform', path.join(PLATFORM_DIR, 'init.pg.sql'));
    if (initSql) {
      const schemas = parseTableSchemasFromSql(initSql);
      mergedSchemas = { ...mergedSchemas, ...schemas };
      parseTableNamesFromSql(initSql).forEach(t => expected.add(t));
    }
    await applySqlMigrations(logger, path.join(PLATFORM_DIR, 'migrations'), 'Platform migration');
  } else {
    expected.add('plugin_registry');
    const sqliteInit = path.join(PLATFORM_DIR, 'init.sql');
    if (fs.existsSync(sqliteInit)) {
      const initSql = await applySqlFile(logger, 'Platform', sqliteInit);
      if (initSql) {
        const schemas = parseTableSchemasFromSql(initSql);
        mergedSchemas = { ...mergedSchemas, ...schemas };
        parseTableNamesFromSql(initSql).forEach(t => expected.add(t));
      }
    }
  }

  await ensureColumnsFromSchemas(logger, mergedSchemas);
  return expected;
}

/**
 * @param {import('egg').EggLogger} logger
 * @param {Object} skill
 * @returns {Promise<string[]>}
 */
async function syncSkillSchema(logger, skill) {
  const tables = Array.isArray(skill.dbTables) ? skill.dbTables : [];
  if (!tables.length) return [];

  const pgPath = path.join(skill.dirPath, 'db', 'init.pg.sql');
  const sqlitePath = path.join(skill.dirPath, 'db', 'init.sql');
  const initPath = isPostgres() && fs.existsSync(pgPath) ? pgPath : sqlitePath;

  /** @type {Record<string, Array<{ name: string, def: string }>>} */
  let schemas = {};
  if (fs.existsSync(initPath)) {
    const initSql = await applySqlFile(logger, `Skill ${skill.name}`, initPath);
    if (initSql) schemas = parseTableSchemasFromSql(initSql);
  } else {
    logger.warn('[SchemaSync] Skill %s missing init SQL at %s', skill.name, initPath);
  }

  await applySqlMigrations(logger, path.join(skill.dirPath, 'db', 'migrations'), `Skill ${skill.name} migration`);
  await ensureColumnsFromSchemas(logger, schemas);

  return tables.map(t => t.toLowerCase());
}

/**
 * @param {import('egg').EggLogger} logger
 * @param {Object[]} skills
 */
async function syncAllSchemas(logger, skills) {
  const expected = await syncPlatformSchema(logger);

  for (const skill of skills) {
    const skillTables = await syncSkillSchema(logger, skill);
    skillTables.forEach(t => expected.add(t));
  }

  await dropOrphanTables(logger, expected);
  logger.info('[SchemaSync] Completed, expected tables=%j', [ ...expected ].sort());
}

module.exports = {
  syncPlatformSchema,
  syncSkillSchema,
  syncAllSchemas,
  listDbTables,
  dropOrphanTables,
};

/**
 * @file store.js
 * @description testgen-skill 数据库访问（通过主应用 db pool）
 */

'use strict';

const path = require('path');

/**
 * @param {import('egg').Context} ctx
 */
function getPool(ctx) {
  const root = ctx.app.config.appSettings.root;
  return require(path.join(root, 'app/lib/db/pool'));
}

/**
 * @param {import('egg').Context} ctx
 * @param {Object} row
 */
async function insertDocument(ctx, row) {
  const { runSql, isPostgres } = getPool(ctx);
  if (isPostgres()) {
    return runSql(`
      INSERT INTO testgen_documents (title, doc_type, content, source, tags)
      VALUES ($1, $2, $3, $4, $5) RETURNING id
    `, [
      row.title || '',
      row.doc_type || 'markdown',
      row.content || '',
      row.source || '',
      JSON.stringify(row.tags || []),
    ]);
  }
  return runSql(`
    INSERT INTO testgen_documents (title, doc_type, content, source, tags)
    VALUES (?, ?, ?, ?, ?)
  `, [
    row.title || '',
    row.doc_type || 'markdown',
    row.content || '',
    row.source || '',
    JSON.stringify(row.tags || []),
  ]);
}

/**
 * @param {import('egg').Context} ctx
 * @param {number} docId
 */
async function getDocument(ctx, docId) {
  const { queryAll, isPostgres } = getPool(ctx);
  const rows = await queryAll(
    isPostgres()
      ? `SELECT id, title, doc_type, content, source, tags, created_at FROM testgen_documents WHERE id = $1`
      : `SELECT id, title, doc_type, content, source, tags, created_at FROM testgen_documents WHERE id = ?`,
    [ docId ]
  );
  return rows[0] || null;
}

/**
 * @param {import('egg').Context} ctx
 * @param {Object} row
 */
async function insertRun(ctx, row) {
  const { runSql, isPostgres } = getPool(ctx);
  const casesJson = JSON.stringify(row.test_cases || []);
  if (isPostgres()) {
    return runSql(`
      INSERT INTO testgen_runs (
        doc_id, doc_title, summary, test_cases_json, steps_count,
        stopped_reason, coverage_notes, llm_profile_id
      ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8) RETURNING id
    `, [
      row.doc_id ?? null,
      row.doc_title || '',
      row.summary || '',
      casesJson,
      row.steps_count ?? 0,
      row.stopped_reason || '',
      row.coverage_notes || '',
      row.llm_profile_id || '',
    ]);
  }
  return runSql(`
    INSERT INTO testgen_runs (
      doc_id, doc_title, summary, test_cases_json, steps_count,
      stopped_reason, coverage_notes, llm_profile_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    row.doc_id ?? null,
    row.doc_title || '',
    row.summary || '',
    casesJson,
    row.steps_count ?? 0,
    row.stopped_reason || '',
    row.coverage_notes || '',
    row.llm_profile_id || '',
  ]);
}

/**
 * @param {import('egg').Context} ctx
 * @param {number} limit
 */
async function listRuns(ctx, limit = 10) {
  const { queryAll, isPostgres } = getPool(ctx);
  return queryAll(
    isPostgres()
      ? `SELECT id, doc_id, doc_title, summary, steps_count, stopped_reason, created_at
         FROM testgen_runs ORDER BY id DESC LIMIT $1`
      : `SELECT id, doc_id, doc_title, summary, steps_count, stopped_reason, created_at
         FROM testgen_runs ORDER BY id DESC LIMIT ?`,
    [ limit ]
  );
}

/**
 * @param {import('egg').Context} ctx
 * @param {number} runId
 */
async function getRun(ctx, runId) {
  const { queryAll, isPostgres } = getPool(ctx);
  const rows = await queryAll(
    isPostgres()
      ? `SELECT id, doc_id, doc_title, summary, test_cases_json, steps_count,
                stopped_reason, coverage_notes, llm_profile_id, created_at
         FROM testgen_runs WHERE id = $1`
      : `SELECT id, doc_id, doc_title, summary, test_cases_json, steps_count,
                stopped_reason, coverage_notes, llm_profile_id, created_at
         FROM testgen_runs WHERE id = ?`,
    [ runId ]
  );
  const row = rows[0];
  if (!row) return null;
  if (typeof row.test_cases_json === 'string') {
    try {
      row.test_cases = JSON.parse(row.test_cases_json);
    } catch {
      row.test_cases = [];
    }
  } else {
    row.test_cases = row.test_cases_json || [];
  }
  return row;
}

module.exports = {
  insertDocument,
  getDocument,
  insertRun,
  listRuns,
  getRun,
};

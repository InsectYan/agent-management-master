/**
 * @file store.js
 * @description perf-bottleneck-skill 数据库访问
 */

'use strict';

const path = require('path');

function getPool(ctx) {
  const root = ctx.app.config.appSettings.root;
  return require(path.join(root, 'app/lib/db/pool'));
}

async function insertRun(ctx, row) {
  const { runSql, isPostgres } = getPool(ctx);
  const reportJson = JSON.stringify(row.report_json || {});

  if (isPostgres()) {
    return runSql(`
      INSERT INTO perf_bottleneck_runs (run_id, report_json, risk_level)
      VALUES ($1, $2::jsonb, $3) RETURNING id
    `, [ row.run_id, reportJson, row.risk_level || null ]);
  }

  return runSql(`
    INSERT INTO perf_bottleneck_runs (run_id, report_json, risk_level)
    VALUES (?, ?, ?)
  `, [ row.run_id, reportJson, row.risk_level || null ]);
}

async function listRuns(ctx, limit = 10) {
  const { queryAll, isPostgres } = getPool(ctx);
  return queryAll(
    isPostgres()
      ? `SELECT id, run_id, report_json, risk_level, created_at
         FROM perf_bottleneck_runs ORDER BY id DESC LIMIT $1`
      : `SELECT id, run_id, report_json, risk_level, created_at
         FROM perf_bottleneck_runs ORDER BY id DESC LIMIT ?`,
    [ limit ],
  );
}

async function getByRunId(ctx, runId) {
  const { queryAll, isPostgres } = getPool(ctx);
  const rows = await queryAll(
    isPostgres()
      ? `SELECT id, run_id, report_json, risk_level, created_at
         FROM perf_bottleneck_runs WHERE run_id = $1 ORDER BY id DESC LIMIT 1`
      : `SELECT id, run_id, report_json, risk_level, created_at
         FROM perf_bottleneck_runs WHERE run_id = ? ORDER BY id DESC LIMIT 1`,
    [ runId ],
  );
  const row = rows[0];
  if (!row) return null;
  if (typeof row.report_json === 'string') {
    try {
      row.report_json = JSON.parse(row.report_json);
    } catch {
      row.report_json = {};
    }
  }
  return row;
}

module.exports = {
  insertRun,
  listRuns,
  getByRunId,
};

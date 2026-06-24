/**
 * @file dreamJobStore.js
 * @description memory_dream_jobs 队列入队 / 认领（PostgreSQL）。
 */

'use strict';

const { isPostgres, getPgPool } = require('../db/pool');

/**
 * @param {Object} input
 * @param {string} input.skillName
 * @param {string} input.sessionId
 * @param {number} [input.idleMinutes]
 * @param {Record<string, unknown>} [input.requestJson]
 */
async function upsertDreamJob(input) {
  if (!isPostgres()) return { job_id: null, created: false, skipped: true };

  const idleMin = input.idleMinutes ?? Number(process.env.MEMORY_DREAM_IDLE_MIN || 5);
  const notBefore = new Date(Date.now() + idleMin * 60_000);
  const reqJson = JSON.stringify(input.requestJson || {});
  const pool = getPgPool();

  const updated = await pool.query(
    `UPDATE memory_dream_jobs
     SET not_before = $3, request_json = $4::jsonb, created_at = NOW()
     WHERE skill_name = $1 AND session_id = $2 AND status = 'pending'
     RETURNING job_id`,
    [ input.skillName, input.sessionId, notBefore, reqJson ]
  );
  if (updated.rows[0]) {
    return { job_id: updated.rows[0].job_id, created: false };
  }

  const processing = await pool.query(
    `SELECT job_id FROM memory_dream_jobs
     WHERE skill_name = $1 AND session_id = $2 AND status = 'processing' LIMIT 1`,
    [ input.skillName, input.sessionId ]
  );
  if (processing.rows[0]) {
    return { job_id: processing.rows[0].job_id, created: false };
  }

  const inserted = await pool.query(
    `INSERT INTO memory_dream_jobs (skill_name, session_id, status, not_before, trigger_kind, request_json)
     VALUES ($1, $2, 'pending', $3, 'session_idle', $4::jsonb)
     RETURNING job_id`,
    [ input.skillName, input.sessionId, notBefore, reqJson ]
  );
  return { job_id: inserted.rows[0].job_id, created: true };
}

/**
 * @param {string} workerId
 */
async function claimNextDreamJob(workerId) {
  if (!isPostgres()) return null;
  const pool = getPgPool();
  const r = await pool.query(
    `UPDATE memory_dream_jobs
     SET status = 'processing', started_at = NOW(), worker_id = $1
     WHERE job_id = (
       SELECT job_id FROM memory_dream_jobs
       WHERE status = 'pending' AND not_before <= NOW()
       ORDER BY not_before ASC, created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING *`,
    [ workerId ]
  );
  return r.rows[0] || null;
}

async function completeDreamJob(jobId, result) {
  if (!isPostgres()) return;
  await getPgPool().query(
    `UPDATE memory_dream_jobs
     SET status = 'completed', result_json = $2::jsonb, completed_at = NOW(), error_text = NULL
     WHERE job_id = $1`,
    [ jobId, JSON.stringify(result) ]
  );
}

async function failDreamJob(jobId, errorText) {
  if (!isPostgres()) return;
  await getPgPool().query(
    `UPDATE memory_dream_jobs
     SET status = 'failed', error_text = $2, completed_at = NOW()
     WHERE job_id = $1`,
    [ jobId, String(errorText || '').slice(0, 2000) ]
  );
}

module.exports = {
  upsertDreamJob,
  claimNextDreamJob,
  completeDreamJob,
  failDreamJob,
};

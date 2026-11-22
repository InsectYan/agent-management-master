/**
 * @file execution.js
 * @description 技能与流程执行轨迹。列表只存状态和短日志，不存提示词正文。
 */

'use strict';

const Service = require('egg').Service;
const { queryAll, runSql } = require('../lib/db/pool');

const STATUSES = new Set([ 'running', 'ok', 'error', 'skip' ]);

function clip(value, max = 500) {
  const text = String(value == null ? '' : value);
  return text.length > max ? text.slice(0, max) : text;
}

function statusOf(value, fallback = 'running') {
  const text = String(value || '');
  return STATUSES.has(text) ? text : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

class ExecutionService extends Service {
  async open(fields = {}) {
    const row = await runSql(
      `INSERT INTO execution_runs
        (app_key, skill_name, action, flow_key, title, target_label, status, started_at)
       VALUES (?, ?, ?, ?, ?, ?, 'running', ?)`,
      [
        clip(fields.app_key, 40),
        clip(fields.skill_name, 120),
        clip(fields.action, 80),
        clip(fields.flow_key, 40),
        clip(fields.title, 120),
        clip(fields.target_label, 120),
        nowIso(),
      ],
    );
    return Number(row.lastInsertRowid) || 0;
  }

  async step(runId, fields = {}) {
    const id = Number(runId);
    if (!id) return 0;
    const status = statusOf(fields.status);
    const orderRows = await queryAll(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM execution_steps WHERE run_id = ?',
      [ id ],
    );
    const sort = Number(orderRows[0]?.n) || 1;
    const row = await runSql(
      `INSERT INTO execution_steps
        (run_id, node_key, title, skill_name, status, log_text, error_text, elapsed_ms, sort_order, started_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        clip(fields.node_key, 80),
        clip(fields.title, 120),
        clip(fields.skill_name, 120),
        status,
        clip(fields.log_text, 2000),
        clip(fields.error_text, 2000),
        Math.max(0, Math.round(Number(fields.elapsed_ms) || 0)),
        sort,
        nowIso(),
        status === 'running' ? null : nowIso(),
      ],
    );
    return Number(row.lastInsertRowid) || 0;
  }

  async finishStep(stepId, fields = {}) {
    const id = Number(stepId);
    if (!id) return;
    const status = statusOf(fields.status, 'ok');
    await runSql(
      `UPDATE execution_steps
       SET status = ?, log_text = ?, error_text = ?, elapsed_ms = ?, finished_at = ?
       WHERE id = ?`,
      [
        status,
        clip(fields.log_text, 2000),
        clip(fields.error_text, 2000),
        Math.max(0, Math.round(Number(fields.elapsed_ms) || 0)),
        nowIso(),
        id,
      ],
    );
  }

  async finish(runId, fields = {}) {
    const id = Number(runId);
    if (!id) return;
    const status = statusOf(fields.status, 'ok');
    await runSql(
      `UPDATE execution_runs
       SET status = ?, error_text = ?, elapsed_ms = ?, finished_at = ?
       WHERE id = ?`,
      [
        status,
        clip(fields.error_text, 500),
        Math.max(0, Math.round(Number(fields.elapsed_ms) || 0)),
        nowIso(),
        id,
      ],
    );
  }

  async list(query = {}) {
    const size = Math.min(50, Math.max(1, Number(query.pageSize) || 20));
    const page = Math.max(1, Number(query.page) || 1);
    const where = [];
    const params = [];
    const skill = clip(query.skill, 120);
    const status = STATUSES.has(String(query.status || '')) ? String(query.status) : '';
    const appKey = clip(query.app, 40);
    if (skill) {
      where.push('skill_name = ?');
      params.push(skill);
    }
    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    if (appKey) {
      where.push('app_key = ?');
      params.push(appKey);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const totalRows = await queryAll(
      `SELECT COUNT(*) AS total FROM execution_runs ${clause}`,
      params,
    );
    const list = await queryAll(
      `SELECT id, app_key, skill_name, action, flow_key, title, target_label, status,
              error_text, elapsed_ms, started_at, finished_at
       FROM execution_runs ${clause}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [ ...params, size, (page - 1) * size ],
    );
    return {
      list,
      total: Number(totalRows[0]?.total) || 0,
      page,
      pageSize: size,
    };
  }

  async skills() {
    return queryAll(
      `SELECT skill_name, COUNT(*) AS total
       FROM execution_runs
       WHERE skill_name <> ''
       GROUP BY skill_name
       ORDER BY skill_name`,
    );
  }

  async show(id) {
    const runId = Number(id);
    if (!runId) return null;
    const runs = await queryAll(
      `SELECT id, app_key, skill_name, action, flow_key, title, target_label, status,
              error_text, elapsed_ms, started_at, finished_at
       FROM execution_runs WHERE id = ?`,
      [ runId ],
    );
    if (!runs.length) return null;
    const steps = await queryAll(
      `SELECT id, run_id, node_key, title, skill_name, status, log_text, error_text,
              elapsed_ms, sort_order, started_at, finished_at
       FROM execution_steps
       WHERE run_id = ?
       ORDER BY sort_order ASC, id ASC`,
      [ runId ],
    );
    return { run: runs[0], steps };
  }
}

module.exports = ExecutionService;

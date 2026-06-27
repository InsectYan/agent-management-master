/**
 * @file dbManager.js
 * @description Skill 数据库表管理（PostgreSQL 优先，SQLite 回退）。
 */

'use strict';

const Service = require('egg').Service;
const { runSql, queryAll, isPostgres } = require('../lib/db/pool');
const { syncAllSchemas: runSchemaSync, syncSkillSchema } = require('../lib/db/schemaSync');

class DbManagerService extends Service {
  /**
   * 启动时全量 schema 同步（平台 + 全部 Skill）
   * @param {Object[]} skills
   */
  async syncAllSchemas(skills) {
    await runSchemaSync(this.app.logger, skills);
  }

  /**
   * @param {Object} skill
   */
  async syncSkillTables(skill) {
    if (!skill.dbTables?.length) return;
    await syncSkillSchema(this.app.logger, skill);
    await this.syncSkillRegistry(skill);
  }

  async syncAllSkills(skills) {
    await this.syncAllSchemas(skills);
    for (const skill of skills) {
      await this.syncSkillRegistry(skill);
    }
  }

  /**
   * 更新 plugin_registry 元数据（DDL 由 schemaSync 负责）
   * @param {Object} skill
   */
  async syncSkillRegistry(skill) {
    if (!skill.dbTables?.length) return;

    if (isPostgres()) {
      await runSql(`
        INSERT INTO plugin_registry (skill_name, version, scheme, db_tables, enabled, updated_at)
        VALUES ($1, $2, $3, $4::jsonb, true, NOW())
        ON CONFLICT(skill_name) DO UPDATE SET
          version = EXCLUDED.version,
          scheme = EXCLUDED.scheme,
          db_tables = EXCLUDED.db_tables,
          enabled = true,
          updated_at = NOW()
        RETURNING skill_name
      `, [ skill.name, skill.version, skill.scheme, JSON.stringify(skill.dbTables) ]);
    } else {
      await runSql(`
        INSERT INTO plugin_registry (skill_name, version, scheme, db_tables, enabled, updated_at)
        VALUES (?, ?, ?, ?, 1, datetime('now'))
        ON CONFLICT(skill_name) DO UPDATE SET
          version = excluded.version,
          scheme = excluded.scheme,
          db_tables = excluded.db_tables,
          enabled = 1,
          updated_at = datetime('now')
      `, [ skill.name, skill.version, skill.scheme, JSON.stringify(skill.dbTables) ]);
    }
  }

  async insertWeatherHistory(row) {
    if (isPostgres()) {
      return runSql(`
        INSERT INTO weather_history (city, query_text, reply_text, llm_profile_id, temperature, condition_text)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING id
      `, [ row.city, row.query_text || '', row.reply_text || '', row.llm_profile_id || '', row.temperature ?? null, row.condition_text || '' ]);
    }
    return runSql(`
      INSERT INTO weather_history (city, query_text, reply_text, llm_profile_id, temperature, condition_text)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [ row.city, row.query_text || '', row.reply_text || '', row.llm_profile_id || '', row.temperature ?? null, row.condition_text || '' ]);
  }

  async listWeatherHistory(city, limit = 5) {
    if (isPostgres()) {
      return queryAll(`
        SELECT id, city, reply_text, temperature, condition_text, created_at
        FROM weather_history WHERE city = $1 ORDER BY id DESC LIMIT $2
      `, [ city, limit ]);
    }
    return queryAll(`
      SELECT id, city, reply_text, temperature, condition_text, created_at
      FROM weather_history WHERE city = ? ORDER BY id DESC LIMIT ?
    `, [ city, limit ]);
  }

  async insertNoteEntry(row) {
    if (isPostgres()) {
      return runSql(`
        INSERT INTO note_entries (session_id, user_message, assistant_reply, llm_profile_id)
        VALUES ($1,$2,$3,$4) RETURNING id
      `, [ row.session_id || 'default', row.user_message || '', row.assistant_reply || '', row.llm_profile_id || '' ]);
    }
    return runSql(`
      INSERT INTO note_entries (session_id, user_message, assistant_reply, llm_profile_id)
      VALUES (?, ?, ?, ?)
    `, [ row.session_id || 'default', row.user_message || '', row.assistant_reply || '', row.llm_profile_id || '' ]);
  }

  async listNoteEntries(sessionId, limit = 10) {
    if (isPostgres()) {
      return queryAll(`
        SELECT id, session_id, user_message, assistant_reply, created_at
        FROM note_entries WHERE session_id = $1 ORDER BY id DESC LIMIT $2
      `, [ sessionId || 'default', limit ]);
    }
    return queryAll(`
      SELECT id, session_id, user_message, assistant_reply, created_at
      FROM note_entries WHERE session_id = ? ORDER BY id DESC LIMIT ?
    `, [ sessionId || 'default', limit ]);
  }

  async insertResearchLog(row) {
    if (isPostgres()) {
      return runSql(`
        INSERT INTO research_log (topic, summary, steps_count, stopped_reason, llm_profile_id)
        VALUES ($1,$2,$3,$4,$5) RETURNING id
      `, [ row.topic || '', row.summary || '', row.steps_count ?? 0, row.stopped_reason || '', row.llm_profile_id || '' ]);
    }
    return runSql(`
      INSERT INTO research_log (topic, summary, steps_count, stopped_reason, llm_profile_id)
      VALUES (?, ?, ?, ?, ?)
    `, [ row.topic || '', row.summary || '', row.steps_count ?? 0, row.stopped_reason || '', row.llm_profile_id || '' ]);
  }

  async listResearchLog(limit = 10) {
    return queryAll(isPostgres()
      ? `SELECT id, topic, summary, steps_count, stopped_reason, created_at FROM research_log ORDER BY id DESC LIMIT $1`
      : `SELECT id, topic, summary, steps_count, stopped_reason, created_at FROM research_log ORDER BY id DESC LIMIT ?`,
    [ limit ]);
  }

  async insertQaLog(row) {
    if (isPostgres()) {
      return runSql(`
        INSERT INTO qa_log (question, answer, iterations, llm_profile_id)
        VALUES ($1,$2,$3,$4) RETURNING id
      `, [ row.question || '', row.answer || '', row.iterations ?? 0, row.llm_profile_id || '' ]);
    }
    return runSql(`
      INSERT INTO qa_log (question, answer, iterations, llm_profile_id)
      VALUES (?, ?, ?, ?)
    `, [ row.question || '', row.answer || '', row.iterations ?? 0, row.llm_profile_id || '' ]);
  }

  async listQaLog(limit = 10) {
    return queryAll(isPostgres()
      ? `SELECT id, question, answer, iterations, created_at FROM qa_log ORDER BY id DESC LIMIT $1`
      : `SELECT id, question, answer, iterations, created_at FROM qa_log ORDER BY id DESC LIMIT ?`,
    [ limit ]);
  }
}

module.exports = DbManagerService;

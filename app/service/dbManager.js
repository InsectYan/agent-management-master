/**
 * @file dbManager.js
 * @description Skill 数据库表管理：按插件 db/init.sql 自动建表，并提供 Skill 业务写库 helper。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const Service = require('egg').Service;
const { execSql, runSql, queryAll } = require('../lib/db/pool');

class DbManagerService extends Service {
  /**
   * 为单个 Skill 同步数据库表（执行 db/init.sql + 更新 plugin_registry）
   * @param {Object} skill - Skill 元数据
   */
  syncSkillTables(skill) {
    if (!skill.dbTables?.length) {
      return;
    }

    const initSql = path.join(skill.dirPath, 'db', 'init.sql');

    if (fs.existsSync(initSql)) {
      const sql = fs.readFileSync(initSql, 'utf8');
      execSql(sql);
      this.app.logger.info('[DbManager] Skill %s 已执行 db/init.sql', skill.name);
    } else {
      this.app.logger.warn('[DbManager] Skill %s 声明 dbTables 但缺少 db/init.sql', skill.name);
    }

    runSql(`
      INSERT INTO plugin_registry (skill_name, version, scheme, db_tables, enabled, updated_at)
      VALUES (?, ?, ?, ?, 1, datetime('now'))
      ON CONFLICT(skill_name) DO UPDATE SET
        version = excluded.version,
        scheme = excluded.scheme,
        db_tables = excluded.db_tables,
        enabled = 1,
        updated_at = datetime('now')
    `, [
      skill.name,
      skill.version,
      skill.scheme,
      JSON.stringify(skill.dbTables),
    ]);
  }

  /**
   * 启动时为全部 Skill 同步表结构
   * @param {Object[]} skills
   */
  syncAllSkills(skills) {
    for (const skill of skills) {
      try {
        this.syncSkillTables(skill);
      } catch (err) {
        this.app.logger.error('[DbManager] Skill %s 建表失败: %s', skill.name, err.message);
        throw err;
      }
    }
  }

  /**
   * 写入天气查询历史（weather-skill 专用 helper）
   * @param {Object} row
   */
  insertWeatherHistory(row) {
    return runSql(`
      INSERT INTO weather_history (city, query_text, reply_text, llm_profile_id, temperature, condition_text)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      row.city,
      row.query_text || '',
      row.reply_text || '',
      row.llm_profile_id || '',
      row.temperature ?? null,
      row.condition_text || '',
    ]);
  }

  /**
   * 查询最近天气记录
   * @param {string} city
   * @param {number} [limit=5]
   */
  listWeatherHistory(city, limit = 5) {
    return queryAll(`
      SELECT id, city, reply_text, temperature, condition_text, created_at
      FROM weather_history
      WHERE city = ?
      ORDER BY id DESC
      LIMIT ?
    `, [ city, limit ]);
  }

  /**
   * 写入记事条目（note-skill 专用 helper）
   * @param {Object} row
   */
  insertNoteEntry(row) {
    return runSql(`
      INSERT INTO note_entries (session_id, user_message, assistant_reply, llm_profile_id)
      VALUES (?, ?, ?, ?)
    `, [
      row.session_id || 'default',
      row.user_message || '',
      row.assistant_reply || '',
      row.llm_profile_id || '',
    ]);
  }

  /**
   * 查询会话记事
   * @param {string} sessionId
   * @param {number} [limit=10]
   */
  listNoteEntries(sessionId, limit = 10) {
    return queryAll(`
      SELECT id, session_id, user_message, assistant_reply, created_at
      FROM note_entries
      WHERE session_id = ?
      ORDER BY id DESC
      LIMIT ?
    `, [ sessionId || 'default', limit ]);
  }
}

module.exports = DbManagerService;

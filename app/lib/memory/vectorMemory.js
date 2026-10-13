/**
 * @file vectorMemory.js
 * @description 向量记忆实现（SQLite 关键词检索版，本地免 pgvector）。
 */

'use strict';

const { runSql, queryAll, execSql } = require('../db/pool');

/**
 * 简单分词（中英文混合）
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[\s,，。；;、]+/)
    .filter(Boolean);
}

/**
 * 关键词重叠得分
 * @param {string[]} queryTokens
 * @param {string} content
 */
function scoreMatch(queryTokens, content) {
  const hay = content.toLowerCase();
  let score = 0;
  for (const t of queryTokens) {
    if (hay.includes(t)) score += 1;
  }
  return score;
}

class VectorMemory {
  /**
   * @param {Object} options
   * @param {string} options.skillName
   * @param {string} options.table - 逻辑表名（用于隔离）
   * @param {string} options.projectId
   */
  constructor(options) {
    this.skillName = options.skillName;
    this.projectId = String(options.projectId || '').trim();
    if (!this.projectId) throw new Error('向量记忆需要 projectId');
    this.table = options.table || `mem_${options.skillName.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    this._ready = null;
  }

  async _ensureTable() {
    if (!this._ready) {
      this._ready = (async () => {
        await execSql(`
          CREATE TABLE IF NOT EXISTS memory_vectors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            skill_name TEXT NOT NULL,
            memory_table TEXT NOT NULL,
            content TEXT NOT NULL,
            project_id TEXT NOT NULL DEFAULT '',
            created_at TEXT DEFAULT (datetime('now'))
          );
          CREATE INDEX IF NOT EXISTS idx_memory_vectors_skill ON memory_vectors(skill_name, memory_table);
        `);
        const cols = await queryAll('PRAGMA table_info(memory_vectors)');
        if (!cols.some(col => col.name === 'project_id')) {
          await execSql(`ALTER TABLE memory_vectors ADD COLUMN project_id TEXT NOT NULL DEFAULT ''`);
        }
        await runSql(
          `UPDATE memory_vectors
           SET project_id = ?
           WHERE skill_name = ? AND memory_table = ? AND (project_id IS NULL OR project_id = '')`,
          [ this.projectId, this.skillName, this.table ]
        );
      })();
    }
    return this._ready;
  }

  /**
   * @param {string} content
   */
  async insert(content) {
    await this._ensureTable();
    return runSql(
      `INSERT INTO memory_vectors (skill_name, memory_table, project_id, content) VALUES (?, ?, ?, ?)`,
      [ this.skillName, this.table, this.projectId, content ]
    );
  }

  /**
   * @param {string} query
   * @param {number} [limit=5]
   */
  async search(query, limit = 5) {
    await this._ensureTable();
    const rows = await queryAll(
      `SELECT id, content, created_at FROM memory_vectors
       WHERE skill_name = ? AND memory_table = ? AND project_id = ?
       ORDER BY id DESC LIMIT 200`,
      [ this.skillName, this.table, this.projectId ]
    );
    const tokens = tokenize(query);
    if (!tokens.length) {
      return rows.slice(0, limit).map(r => ({
        id: r.id,
        content: r.content,
        created_at: r.created_at,
        score: 0,
      }));
    }
    return rows
      .map(r => ({
        id: r.id,
        content: r.content,
        created_at: r.created_at,
        score: scoreMatch(tokens, String(r.content)),
      }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /** @returns {Promise<string>} */
  async readSummary() {
    await this._ensureTable();
    const rows = await queryAll(
      `SELECT content, created_at FROM memory_vectors
       WHERE skill_name = ? AND memory_table = ? AND project_id = ?
       ORDER BY id DESC LIMIT 10`,
      [ this.skillName, this.table, this.projectId ]
    );
    return rows.map(r => `- [${r.created_at}] ${r.content}`).join('\n');
  }

  async destroy() {
    await this._ensureTable();
    await runSql(
      `DELETE FROM memory_vectors WHERE skill_name = ? AND memory_table = ? AND project_id = ?`,
      [ this.skillName, this.table, this.projectId ]
    );
  }
}

module.exports = {
  VectorMemory,
  tokenize,
};

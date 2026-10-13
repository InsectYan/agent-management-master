/**
 * @file pgVectorMemory.js
 * @description pgvector 向量记忆（cosine 相似度检索）。
 */

'use strict';

const { isPostgres, queryAll, runSql, execSql } = require('../db/pool');
const { embedText, toPgVector, EMBED_DIM } = require('./embeddings');
const { VectorMemory: SqliteVectorMemory } = require('./vectorMemory');

class PgVectorMemory {
  /**
   * @param {Object} options
   * @param {string} options.skillName
   * @param {string} options.table
   * @param {Object} [options.llm]
   */
  constructor(options) {
    this.skillName = options.skillName;
    this.projectId = String(options.projectId || '').trim();
    if (!this.projectId) throw new Error('向量记忆需要 projectId');
    this.table = options.table || `mem_${options.skillName.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    this.llm = options.llm || null;
    this._columnReady = null;
    /** SQLite 回退 */
    this._fallback = isPostgres() ? null : new SqliteVectorMemory(options);
  }

  /**
   * @param {string} content
   */
  async _ensureProjectColumn() {
    if (this._fallback) return;
    if (!this._columnReady) {
      this._columnReady = (async () => {
        await execSql(`ALTER TABLE memory_embeddings ADD COLUMN IF NOT EXISTS project_id TEXT`);
        await runSql(
          `UPDATE memory_embeddings
           SET project_id = $1
           WHERE skill_name = $2 AND memory_table = $3 AND (project_id IS NULL OR project_id = '')`,
          [ this.projectId, this.skillName, this.table ]
        );
      })();
    }
    return this._columnReady;
  }

  async insert(content) {
    if (this._fallback) return this._fallback.insert(content);
    await this._ensureProjectColumn();
    const embedding = await embedText(content, { llm: this.llm });
    return runSql(`
      INSERT INTO memory_embeddings (skill_name, memory_table, project_id, content, embedding)
      VALUES ($1, $2, $3, $4, $5::vector)
      RETURNING id
    `, [ this.skillName, this.table, this.projectId, content, toPgVector(embedding) ]);
  }

  /**
   * @param {string} query
   * @param {number} [limit=5]
   */
  async search(query, limit = 5) {
    if (this._fallback) return this._fallback.search(query, limit);
    await this._ensureProjectColumn();
    const qEmb = await embedText(query, { llm: this.llm });
    const rows = await queryAll(`
      SELECT id, content, created_at,
             1 - (embedding <=> $5::vector) AS score
      FROM memory_embeddings
      WHERE skill_name = $1 AND memory_table = $2 AND project_id = $3 AND embedding IS NOT NULL
      ORDER BY embedding <=> $5::vector
      LIMIT $4
    `, [ this.skillName, this.table, this.projectId, limit, toPgVector(qEmb) ]);
    return rows.map(r => ({
      id: r.id,
      content: r.content,
      created_at: r.created_at,
      score: Number(r.score),
    }));
  }

  async readSummary() {
    if (this._fallback) return this._fallback.readSummary();
    await this._ensureProjectColumn();
    const rows = await queryAll(`
      SELECT content, created_at FROM memory_embeddings
      WHERE skill_name = $1 AND memory_table = $2 AND project_id = $3
      ORDER BY id DESC LIMIT 10
    `, [ this.skillName, this.table, this.projectId ]);
    return rows.map(r => `- [${r.created_at}] ${r.content}`).join('\n');
  }

  async destroy() {
    if (this._fallback) return this._fallback.destroy();
    await this._ensureProjectColumn();
    await runSql(
      `DELETE FROM memory_embeddings WHERE skill_name = $1 AND memory_table = $2 AND project_id = $3`,
      [ this.skillName, this.table, this.projectId ]
    );
  }
}

PgVectorMemory.EMBED_DIM = EMBED_DIM;

module.exports = { PgVectorMemory };

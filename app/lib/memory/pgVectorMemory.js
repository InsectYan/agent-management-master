/**
 * @file pgVectorMemory.js
 * @description pgvector 向量记忆（cosine 相似度检索）。
 */

'use strict';

const { isPostgres, queryAll, runSql } = require('../db/pool');
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
    this.table = options.table || `mem_${options.skillName.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    this.llm = options.llm || null;
    /** SQLite 回退 */
    this._fallback = isPostgres() ? null : new SqliteVectorMemory(options);
  }

  /**
   * @param {string} content
   */
  async insert(content) {
    if (this._fallback) return this._fallback.insert(content);
    const embedding = await embedText(content, { llm: this.llm });
    return runSql(`
      INSERT INTO memory_embeddings (skill_name, memory_table, content, embedding)
      VALUES ($1, $2, $3, $4::vector)
      RETURNING id
    `, [ this.skillName, this.table, content, toPgVector(embedding) ]);
  }

  /**
   * @param {string} query
   * @param {number} [limit=5]
   */
  async search(query, limit = 5) {
    if (this._fallback) return this._fallback.search(query, limit);
    const qEmb = await embedText(query, { llm: this.llm });
    const rows = await queryAll(`
      SELECT id, content, created_at,
             1 - (embedding <=> $4::vector) AS score
      FROM memory_embeddings
      WHERE skill_name = $1 AND memory_table = $2 AND embedding IS NOT NULL
      ORDER BY embedding <=> $4::vector
      LIMIT $3
    `, [ this.skillName, this.table, limit, toPgVector(qEmb) ]);
    return rows.map(r => ({
      id: r.id,
      content: r.content,
      created_at: r.created_at,
      score: Number(r.score),
    }));
  }

  async readSummary() {
    if (this._fallback) return this._fallback.readSummary();
    const rows = await queryAll(`
      SELECT content, created_at FROM memory_embeddings
      WHERE skill_name = $1 AND memory_table = $2
      ORDER BY id DESC LIMIT 10
    `, [ this.skillName, this.table ]);
    return rows.map(r => `- [${r.created_at}] ${r.content}`).join('\n');
  }

  async destroy() {
    if (this._fallback) return this._fallback.destroy();
    await runSql(
      `DELETE FROM memory_embeddings WHERE skill_name = $1 AND memory_table = $2`,
      [ this.skillName, this.table ]
    );
  }
}

PgVectorMemory.EMBED_DIM = EMBED_DIM;

module.exports = { PgVectorMemory };

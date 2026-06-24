/**
 * @file memoryEngine.js
 * @description 记忆引擎：file / pgvector（PostgreSQL）/ SQLite 关键词回退。
 */

'use strict';

const path = require('path');
const Service = require('egg').Service;
const { isPostgres } = require('../lib/db/pool');
const { FileMemory } = require('../lib/memory/fileMemory');
const { PgVectorMemory } = require('../lib/memory/pgVectorMemory');
const { VectorMemory } = require('../lib/memory/vectorMemory');

class MemoryEngineService extends Service {
  constructor(ctx) {
    super(ctx);
    if (!this.app._memoryInstances) {
      this.app._memoryInstances = new Map();
    }
  }

  _store() {
    return this.app._memoryInstances;
  }

  _memoryRoot() {
    const ms = this.config.appSettings.memorySystem || {};
    return ms.file?.dir || path.join(this.config.appSettings.root, 'memory_files');
  }

  initSkillMemory(skill) {
    const cfg = skill.memoryConfig || {};
    if (!cfg.enabled) return null;

    const type = (cfg.type || 'file').toLowerCase();
    let instance;

    if (type === 'vector') {
      if (!cfg.table) throw new Error(`Skill ${skill.name} vector 记忆须定义 memoryConfig.table`);
      const backend = this.config.appSettings.memorySystem?.vector?.backend || 'pgvector';
      if (isPostgres() && backend === 'pgvector') {
        instance = new PgVectorMemory({
          skillName: skill.name,
          table: cfg.table,
          llm: null,
        });
      } else {
        instance = new VectorMemory({ skillName: skill.name, table: cfg.table });
      }
    } else {
      instance = new FileMemory({ skillName: skill.name, root: this._memoryRoot() });
    }

    this._store().set(skill.name, { type, instance, config: cfg });
    this.app.logger.info('[MemoryEngine] Skill %s type=%s pg=%s', skill.name, type, isPostgres());
    return instance;
  }

  initAll(skills) {
    for (const skill of skills) {
      if (skill.memoryConfig?.enabled) this.initSkillMemory(skill);
    }
  }

  getInstance(skillName) {
    return this._store().get(skillName) || null;
  }

  async getContext(skillName, query) {
    const entry = this.getInstance(skillName);
    if (!entry) return '';

    if (entry.type === 'vector') {
      const hits = await entry.instance.search(query || '', 5);
      if (!hits.length) return await entry.instance.readSummary();
      return hits.map(h => h.content).join('\n');
    }

    const fileContent = entry.instance.read();
    if (query) {
      const matched = entry.instance.search(query, 5);
      if (matched.length) {
        return `## 相关记忆\n${matched.join('\n')}\n\n## MEMORY.md\n${fileContent}`;
      }
    }
    return fileContent;
  }

  async applyOps(skillName, ops) {
    const entry = this.getInstance(skillName);
    if (!entry || !Array.isArray(ops)) return { applied: 0 };

    let applied = 0;
    for (const op of ops) {
      const text = String(op.text || op.content || '').trim();
      if (!text) continue;
      const action = (op.op || 'append').toLowerCase();
      if (action === 'append' || action === 'add') {
        if (entry.type === 'vector') {
          await entry.instance.insert(text);
        } else {
          entry.instance.append(text, op.section || '偏好');
        }
        applied += 1;
      }
    }
    return { applied };
  }

  async read(skillName) {
    const entry = this.getInstance(skillName);
    if (!entry) {
      const err = new Error(`Skill ${skillName} 未启用记忆`);
      err.status = 404;
      throw err;
    }
    if (entry.type === 'vector') {
      return {
        type: 'vector',
        table: entry.config.table,
        backend: isPostgres() ? 'pgvector' : 'keyword',
        content: await entry.instance.readSummary(),
      };
    }
    return { type: 'file', content: entry.instance.read() };
  }

  async append(skillName, text, section) {
    const entry = this.getInstance(skillName);
    if (!entry) {
      const err = new Error(`Skill ${skillName} 未启用记忆`);
      err.status = 404;
      throw err;
    }
    if (entry.type === 'vector') {
      const info = await entry.instance.insert(text);
      return { type: 'vector', id: info.lastInsertRowid };
    }
    const content = entry.instance.append(text, section || '偏好');
    return { type: 'file', content };
  }

  async search(skillName, query, limit = 5) {
    const entry = this.getInstance(skillName);
    if (!entry) {
      const err = new Error(`Skill ${skillName} 未启用记忆`);
      err.status = 404;
      throw err;
    }
    if (entry.type === 'vector') {
      return { type: 'vector', backend: isPostgres() ? 'pgvector' : 'keyword', results: await entry.instance.search(query, limit) };
    }
    return { type: 'file', results: entry.instance.search(query, limit) };
  }

  listEnabled() {
    return Array.from(this._store().entries()).map(([ name, entry ]) => ({
      skill: name,
      type: entry.type,
      table: entry.config.table || null,
      backend: entry.type === 'vector'
        ? (isPostgres() ? 'pgvector' : 'keyword')
        : entry.type,
    }));
  }
}

module.exports = MemoryEngineService;

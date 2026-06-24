/**
 * @file pluginManager.js
 * @description Skill 插件管理器：扫描 plugins/ 目录、加载 index.js 元数据与 callbacks、维护内存注册表。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const Service = require('egg').Service;
const { loadSkillDoc } = require('../lib/skill/skillDoc');

/**
 * @typedef {Object} SkillMeta
 * @property {string} name
 * @property {string} scheme
 * @property {string} version
 * @property {Object[]} [routes]
 * @property {string[]} [dbTables]
 * @property {Object} [memoryConfig]
 * @property {Object} [config]
 * @property {Object} [callbacks]
 * @property {string} dirPath - 插件目录绝对路径
 * @property {'enabled'|'disabled'} status
 * @property {import('../lib/skill/skillDoc').SkillDoc|null} skillDoc - SKILL.md 解析结果
 */

class PluginManagerService extends Service {
  constructor(ctx) {
    super(ctx);
  }

  /**
   * 获取应用级 Skill 注册表（跨请求共享）
   * @returns {Map<string, SkillMeta>}
   */
  _store() {
    if (!this.app._skillRegistry) {
      this.app._skillRegistry = new Map();
    }
    return this.app._skillRegistry;
  }

  /**
   * 是否已完成加载
   * @returns {boolean}
   */
  isLoaded() {
    return this.app._skillsLoaded === true;
  }

  /**
   * 获取 plugins 根目录
   * @returns {string}
   */
  getPluginDir() {
    return this.config.appSettings.pluginDir;
  }

  /**
   * 扫描并加载全部 Skill 插件（幂等：重复调用会先清空）
   * @returns {Promise<SkillMeta[]>}
   */
  async loadAll() {
    const pluginDir = this.getPluginDir();
    const store = this._store();
    store.clear();

    if (!fs.existsSync(pluginDir)) {
      fs.mkdirSync(pluginDir, { recursive: true });
      this.app.logger.warn('[PluginManager] plugins 目录不存在，已创建空目录: %s', pluginDir);
      this.app._skillsLoaded = true;
      return [];
    }

    const entries = fs.readdirSync(pluginDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      if (ent.name.startsWith('_') || ent.name.startsWith('.')) continue;

      const skillDir = path.join(pluginDir, ent.name);
      const indexPath = path.join(skillDir, 'index.js');
      if (!fs.existsSync(indexPath)) {
        this.app.logger.warn('[PluginManager] 跳过无 index.js 的目录: %s', ent.name);
        continue;
      }

      try {
        const skill = this._loadSkillModule(skillDir, indexPath);
        store.set(skill.name, skill);
        this.app.logger.info('[PluginManager] 已加载 Skill: %s (scheme=%s)', skill.name, skill.scheme);

        if (typeof skill.callbacks?.onEnable === 'function') {
          await skill.callbacks.onEnable(this.app);
        }
      } catch (err) {
        this.app.logger.error('[PluginManager] 加载失败 %s: %s', ent.name, err.message);
      }
    }

    this.app._skillsLoaded = true;
    return this.list();
  }

  /**
   * require 并规范化 Skill 模块导出
   * @param {string} skillDir
   * @param {string} indexPath
   * @returns {SkillMeta}
   */
  _loadSkillModule(skillDir, indexPath) {
    /** 清除 require 缓存，dev 模式下便于热更新 */
    delete require.cache[require.resolve(indexPath)];
    const raw = require(indexPath);

    const name = (raw.name || '').trim();
    if (!name) {
      throw new Error('Skill 必须在 index.js 中定义 name 字段');
    }

    const scheme = (raw.scheme || raw.agentType || '').trim().toLowerCase();
    if (!scheme) {
      throw new Error(`Skill ${name} 必须定义 scheme（或兼容字段 agentType）`);
    }

    const skillDoc = loadSkillDoc(skillDir);
    if (!skillDoc) {
      this.app.logger.warn('[PluginManager] Skill %s 缺少 SKILL.md，建议补充完整 Skill 文档', name);
    }

    return {
      name,
      scheme,
      version: raw.version || '0.0.0',
      description: raw.description || '',
      routes: Array.isArray(raw.routes) ? raw.routes : [],
      dbTables: Array.isArray(raw.dbTables) ? raw.dbTables : [],
      memoryConfig: raw.memoryConfig || { enabled: false },
      config: raw.config || {},
      callbacks: raw.callbacks || {},
      riskLevel: raw.riskLevel || 'normal',
      dirPath: skillDir,
      status: 'enabled',
      skillDoc,
    };
  }

  /**
   * 是否已完成加载（兼容旧调用，见 isLoaded）
   * @returns {boolean}
   */
  get loaded() {
    return this.isLoaded();
  }

  /**
   * 列出全部 Skill
   * @returns {SkillMeta[]}
   */
  list() {
    return Array.from(this._store().values());
  }

  /**
   * 按 name 获取 Skill
   * @param {string} name
   * @returns {SkillMeta|undefined}
   */
  get(name) {
    return this._store().get(name);
  }

  /**
   * 按路由 path + method 查找 Skill
   * @param {string} method
   * @param {string} urlPath
   * @returns {{ skill: SkillMeta, route: Object }|null}
   */
  findByRoute(method, urlPath) {
    const m = method.toUpperCase();
    for (const skill of this._store().values()) {
      for (const route of skill.routes) {
        if (route.method?.toUpperCase() === m && route.path === urlPath) {
          return { skill, route };
        }
      }
    }
    return null;
  }
}

module.exports = PluginManagerService;

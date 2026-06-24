/**
 * @file registry.js
 * @description Agent 方案注册表：统一管理 pi / langchain / loop / react 等 Executor 类。
 *              新增方案时：实现 Executor → 在此 register → 编写 docs/schemes/{name}/README.md
 */

'use strict';

const AgentExecutor = require('./base/executor');
const { PiExecutor } = require('./pi');
const { LangChainExecutor } = require('./langchain');
const { LoopExecutor } = require('./loop');
const { ReactExecutor } = require('./react');

/**
 * Agent 方案注册表（内存单例）
 */
class SchemeRegistry {
  constructor() {
    /** @type {Map<string, typeof AgentExecutor>} schemeId → Executor 类 */
    this._executors = new Map();
  }

  /**
   * 注册一个 Agent 方案执行器类
   * @param {typeof AgentExecutor} ExecutorClass - 必须定义 static schemeId
   */
  register(ExecutorClass) {
    const id = ExecutorClass.schemeId;
    if (!id) {
      throw new Error('Executor 必须定义 static schemeId');
    }
    this._executors.set(id, ExecutorClass);
  }

  /**
   * 批量注册内置方案
   */
  registerBuiltins() {
    this.register(PiExecutor);
    this.register(LangChainExecutor);
    this.register(LoopExecutor);
    this.register(ReactExecutor);
  }

  /**
   * 是否已注册某方案
   * @param {string} schemeId
   * @returns {boolean}
   */
  has(schemeId) {
    return this._executors.has(schemeId);
  }

  /**
   * 获取方案 ID 列表
   * @returns {string[]}
   */
  listSchemeIds() {
    return Array.from(this._executors.keys());
  }

  /**
   * 列出方案摘要（含就绪状态）
   * @returns {Array<{ id: string, ready: boolean, notReadyReason: string|null }>}
   */
  listSchemes() {
    return this.listSchemeIds().map(id => {
      const Cls = this._executors.get(id);
      const probe = AgentExecutor.create(Cls, { name: '_probe' });
      return {
        id,
        ready: probe.isReady(),
        notReadyReason: probe.getNotReadyReason(),
      };
    });
  }

  /**
   * 为指定 Skill 创建 Executor 实例
   * @param {string} schemeId - Skill.scheme
   * @param {Object} skill - Skill 元数据
   * @returns {AgentExecutor}
   */
  createExecutor(schemeId, skill) {
    const normalized = (schemeId || skill.agentType || '').trim().toLowerCase();
    const Cls = this._executors.get(normalized);
    if (!Cls) {
      throw new Error(`未注册的 Agent 方案: ${normalized}，已注册: ${this.listSchemeIds().join(', ')}`);
    }
    return AgentExecutor.create(Cls, skill);
  }
}

/** 全局单例 */
const registry = new SchemeRegistry();
registry.registerBuiltins();

module.exports = {
  SchemeRegistry,
  registry,
};

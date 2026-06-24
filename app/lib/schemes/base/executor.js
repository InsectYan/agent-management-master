/**
 * @file executor.js
 * @description Agent 执行器抽象基类。所有 Agent 方案（pi / langchain / loop / react）
 *              必须继承此类并实现 executeTask。
 */

'use strict';

/**
 * @typedef {Object} ExecuteContext
 * @property {import('egg').Application} app - Egg 应用实例
 * @property {import('egg').Context} [ctx] - HTTP 上下文（若有）
 * @property {Object} skill - 已加载的 Skill 元数据（含 callbacks、config）
 * @property {import('../../llm/types').LlmRuntimeConfig} llm - 解析后的 LLM 运行时配置
 */

/**
 * @typedef {Object} ExecuteParams
 * @property {Record<string, unknown>} input - 经 Skill 回调 enrich 后的输入
 * @property {Record<string, unknown>} [raw] - 原始请求参数（query / body）
 */

/**
 * @typedef {Object} ExecuteResult
 * @property {string} [text] - 文本回复
 * @property {unknown} [output] - 结构化输出
 * @property {Record<string, unknown>} [meta] - 元信息（模型、耗时等）
 */

/**
 * Agent 方案执行器基类
 */
class AgentExecutor {
  /**
   * @param {typeof AgentExecutor} ExecutorClass - 子类构造函数（用于读取 static schemeId）
   * @param {Object} skill - Skill 插件元数据
   */
  constructor(ExecutorClass, skill) {
    /** @type {string} 方案唯一标识，子类必须覆盖 static schemeId */
    this.schemeId = ExecutorClass.schemeId || 'unknown';
    /** @type {Object} 当前 Skill 配置与回调 */
    this.skill = skill;
  }

  /**
   * 创建执行器实例（工厂方法）
   * @param {typeof AgentExecutor} ExecutorClass
   * @param {Object} skill
   * @returns {AgentExecutor}
   */
  static create(ExecutorClass, skill) {
    return new ExecutorClass(ExecutorClass, skill);
  }

  /**
   * 执行 Skill 任务（子类必须实现）
   * @param {ExecuteContext} context - 执行上下文
   * @param {ExecuteParams} params - 输入参数
   * @returns {Promise<ExecuteResult>}
   */
  async executeTask(context, params) {
    throw new Error(`方案 ${this.schemeId} 未实现 executeTask 方法`);
  }

  /**
   * 初始化记忆系统（可选实现）
   * @param {Object} memoryConfig - Skill.memoryConfig
   * @returns {Promise<void>}
   */
  async setupMemory(memoryConfig) {
    // 默认无操作；vector / file 方案在 Phase 5 扩展
  }

  /**
   * 销毁记忆资源（可选实现）
   * @returns {Promise<void>}
   */
  async teardownMemory() {
    // 默认无操作
  }

  /**
   * 方案是否已就绪（骨架方案返回 false 并带说明）
   * @returns {boolean}
   */
  isReady() {
    return true;
  }

  /**
   * 未就绪时的说明文案
   * @returns {string|null}
   */
  getNotReadyReason() {
    return null;
  }
}

module.exports = AgentExecutor;

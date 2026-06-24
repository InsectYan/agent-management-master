/**
 * @file skillInvoke.js
 * @description Skill 统一调用编排：resolveLlm → callbacks → SchemeExecutor.executeTask → 格式化响应。
 *              对应开发方案 §6 流水线。
 */

'use strict';

const Service = require('egg').Service;
const { resolveLlm } = require('../lib/llm/resolveLlm');
const { resolveAction } = require('../lib/skill/skillDoc');
const { registry } = require('../lib/schemes/registry');

class SkillInvokeService extends Service {
  /**
   * 执行指定 Skill
   * @param {Object} options
   * @param {string} options.skillName - Skill 名称
   * @param {import('egg').Context} options.ctx - HTTP 上下文
   * @param {Record<string, unknown>} [options.bodyOverride] - 覆盖 body（测试用）
   * @returns {Promise<Object>} 格式化后的 API 响应体
   */
  async invoke({ skillName, ctx, bodyOverride }) {
    const skill = this.service.pluginManager.get(skillName);
    if (!skill) {
      const err = new Error(`Skill 不存在: ${skillName}`);
      err.status = 404;
      throw err;
    }

    if (skill.status !== 'enabled') {
      const err = new Error(`Skill 已禁用: ${skillName}`);
      err.status = 403;
      throw err;
    }

    const body = bodyOverride || ctx.request.body || {};
    const query = ctx.query || {};

    /** 三级 LLM 优先级解析 */
    const llm = resolveLlm({
      requestProfileId: body.llm_profile || query.llm_profile,
      skillDefaultProfile: skill.config?.llmDefaultProfile,
      appSettings: this.config.appSettings,
    });

    /** 合并请求参数，附带 HTTP 方法供 SKILL.md 默认动作解析 */
    let params = { ...query, ...body, _httpMethod: ctx.method };

    /** 预填 HTTP 方法对应的默认 action（完整校验在 beforeExecute 之后） */
    const actionDefaults = skill.config?.actionDefaults || {};
    if (!params.action && params._httpMethod && actionDefaults[params._httpMethod]) {
      params.action = actionDefaults[params._httpMethod];
    }

    /** Skill 前置回调：参数默认值与变换（须在 SKILL 必填校验前） */
    if (typeof skill.callbacks.beforeExecute === 'function') {
      params = await skill.callbacks.beforeExecute(ctx, params) || params;
    }

    /** 按 SKILL.md「执行动作」校验 action 与必填参数 */
    const resolved = resolveAction(skill.skillDoc, params, actionDefaults);
    if (resolved.errors.length) {
      const err = new Error(resolved.errors.join('；'));
      err.status = 400;
      throw err;
    }
    if (resolved.action) {
      params.action = resolved.action;
      params._actionDef = resolved.actionDef;
    }

    /** 拼 enrich 输入 */
    let input = params;
    if (typeof skill.callbacks.enrichContext === 'function') {
      input = await skill.callbacks.enrichContext(ctx, params) || params;
    } else if (typeof skill.callbacks.buildInput === 'function') {
      input = await skill.callbacks.buildInput(ctx, params) || params;
    }

    /** 创建方案 Executor 并执行 */
    const executor = registry.createExecutor(skill.scheme, skill);
    if (!executor.isReady()) {
      const reason = executor.getNotReadyReason() || '方案未就绪';
      const err = new Error(`Agent 方案「${skill.scheme}」不可用: ${reason}`);
      err.status = 501;
      throw err;
    }

    const result = await executor.executeTask(
      { app: this.app, ctx, skill, llm },
      { input, raw: params }
    );

    /** 持久化回调（返回值合并进 meta，便于客户端确认落库） */
    if (typeof skill.callbacks.persistResult === 'function') {
      const persistMeta = await skill.callbacks.persistResult(ctx, { ...result, params, llm });
      if (persistMeta && typeof persistMeta === 'object') {
        result.meta = { ...(result.meta || {}), ...persistMeta };
      }
    }

    /** 响应格式化 */
    let response;
    if (typeof skill.callbacks.formatResponse === 'function') {
      response = await skill.callbacks.formatResponse(ctx, result);
    } else {
      response = {
        reply: result.text || '',
        output: result.output,
        meta: result.meta,
      };
    }

    return {
      ...response,
      skill: skill.name,
      scheme: skill.scheme,
      llm_profile_id: llm.profileIdUsed,
      llm_label: llm.label,
      llm_source: llm.source,
    };
  }
}

module.exports = SkillInvokeService;

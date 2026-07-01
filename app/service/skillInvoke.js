/**
 * @file skillInvoke.js
 * @description Skill 统一调用编排：resolveLlm → callbacks → SchemeExecutor.executeTask → 格式化响应。
 *              对应开发方案 §6 流水线；Pi scheme 支持 SSE 流式（invokeStream）。
 */

'use strict';

const Service = require('egg').Service;
const { resolveLlm } = require('../lib/llm/resolveLlm');
const { resolveAction } = require('../lib/skill/skillDoc');
const { registry } = require('../lib/schemes/registry');

class SkillInvokeService extends Service {
  /**
   * 准备 invoke 上下文（校验 + enrich）
   * @param {Object} options
   * @returns {Promise<{ skill: Object, params: Object, input: Object, llm: Object, executor: Object }>}
   */
  async _prepareInvoke({ skillName, ctx, bodyOverride }) {
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

    const llm = resolveLlm({
      requestProfileId: body.llm_profile || query.llm_profile,
      skillDefaultProfile: skill.config?.llmDefaultProfile,
      appSettings: this.config.appSettings,
    });

    let params = { ...query, ...body, _httpMethod: ctx.method };

    const actionDefaults = skill.config?.actionDefaults || {};
    if (!params.action && params._httpMethod && actionDefaults[params._httpMethod]) {
      params.action = actionDefaults[params._httpMethod];
    }

    if (typeof skill.callbacks.beforeExecute === 'function') {
      params = await skill.callbacks.beforeExecute(ctx, params) || params;
    }

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

    let input = params;
    if (typeof skill.callbacks.enrichContext === 'function') {
      input = await skill.callbacks.enrichContext(ctx, params) || params;
    } else if (typeof skill.callbacks.buildInput === 'function') {
      input = await skill.callbacks.buildInput(ctx, params) || params;
    }

    const memQuery = input.message || input.topic || input.question || params.message || '';
    if (skill.memoryConfig?.enabled && !input._skipMemory) {
      input._memoryContext = await this.service.memoryEngine.getContext(skill.name, String(memQuery));
    }

    const executor = registry.createExecutor(skill.scheme, skill);
    if (!executor.isReady()) {
      const reason = executor.getNotReadyReason() || '方案未就绪';
      const err = new Error(`Agent 方案「${skill.scheme}」不可用: ${reason}`);
      err.status = 501;
      throw err;
    }

    return { skill, params, input, llm, executor };
  }

  /**
   * 执行 Executor 并格式化响应
   * @param {Object} options
   */
  async _finalizeInvoke({ skill, params, input, llm, executor, ctx, streamHooks }) {
    if (streamHooks?.piHooks) {
      ctx.state.piHooks = streamHooks.piHooks;
    }
    if (streamHooks?.schemeHooks) {
      ctx.state.schemeHooks = streamHooks.schemeHooks;
    }

    const result = await executor.executeTask(
      { app: this.app, ctx, skill, llm },
      { input, raw: params }
    );

    /** 应用 outbox memory_ops（清醒记忆路径） */
    if (skill.memoryConfig?.enabled) {
      const ops = result.output?.outbox?.memory_ops || result.output?.memory_ops;
      if (ops) {
        const memMeta = await this.service.memoryEngine.applyOps(skill.name, ops);
        result.meta = { ...(result.meta || {}), memory_ops_applied: memMeta.applied };
      }

      /** 睡梦记忆入队（PostgreSQL + 未跳过） */
      const skipDream = result.meta?.memory_ops_applied > 0
        && this.config.appSettings.memorySystem?.dream?.skipWhenWake !== false;
      if (!skipDream && params.session_id) {
        const { upsertDreamJob } = require('../lib/memory/dreamJobStore');
        const dream = await upsertDreamJob({
          skillName: skill.name,
          sessionId: String(params.session_id),
          idleMinutes: this.config.appSettings.memorySystem?.dream?.idleMinutes,
          requestJson: {
            action: params.action,
            wake_applied: result.meta?.memory_ops_applied || 0,
          },
        });
        if (dream.job_id) {
          result.meta = { ...(result.meta || {}), dream_job_id: dream.job_id };
        }
      }
    }

    if (typeof skill.callbacks.persistResult === 'function') {
      const persistMeta = await skill.callbacks.persistResult(ctx, { ...result, params, llm });
      if (persistMeta && typeof persistMeta === 'object') {
        result.meta = { ...(result.meta || {}), ...persistMeta };
      }
    }

    let response;
    if (typeof skill.callbacks.formatResponse === 'function') {
      response = await skill.callbacks.formatResponse(ctx, { ...result, params });
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

  /**
   * 执行指定 Skill（JSON 响应）
   * @param {Object} options
   */
  async invoke({ skillName, ctx, bodyOverride }) {
    const prepared = await this._prepareInvoke({ skillName, ctx, bodyOverride });
    return this._finalizeInvoke({ ...prepared, ctx });
  }

  /**
   * SSE 流式执行 Skill（Pi delta / status 事件）
   * @param {Object} options
   */
  async invokeStream({ skillName, ctx, bodyOverride }) {
    const mergedBody = { ...(bodyOverride || ctx.request.body || {}), stream: true };
    const prepared = await this._prepareInvoke({ skillName, ctx, bodyOverride: mergedBody });

    ctx.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    ctx.status = 200;
    ctx.respond = false;

    const res = ctx.res;

    /**
     * 推送 SSE 事件
     * @param {string} event
     * @param {unknown} data
     */
    const emit = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    emit('status', { phase: 'start', label: '开始执行…' });

    const piHooks = {
      onStatus: payload => emit('status', payload),
      onDelta: payload => emit('delta', payload),
    };
    const schemeHooks = {
      onStatus: payload => emit('status', payload),
      onDelta: payload => emit('delta', payload),
    };

    try {
      const body = await this._finalizeInvoke({
        ...prepared,
        ctx,
        streamHooks: { piHooks, schemeHooks },
      });
      emit('done', body);
    } catch (err) {
      emit('error', { message: err.message, status: err.status || 500 });
    } finally {
      res.end();
    }
  }
}

module.exports = SkillInvokeService;

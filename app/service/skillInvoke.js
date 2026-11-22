/**
 * @file skillInvoke.js
 * @description Skill 统一调用编排：resolveLlm → callbacks → SchemeExecutor.executeTask → 格式化响应。
 *              对应开发方案 §6 流水线；Pi scheme 支持 SSE 流式（invokeStream）。
 */

'use strict';

const Service = require('egg').Service;
const { resolveLlm } = require('../lib/llm/resolveLlm');
const { parseOverrideMaxTokens } = require('../lib/llm/localLlm');
const { resolveAction } = require('../lib/skill/skillDoc');
const { registry } = require('../lib/schemes/registry');
const { resolveWorkScope } = require('../lib/work/scope');
const { turnNote, writeWorkTrace, searchWorkKnowledge } = require('../lib/work/trace');

function decodeTrace(value) {
  const raw = String(value || '');
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function traceNote(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 300);
}

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
    const traceRunId = Number(ctx.get('x-trace-run-id') || body.trace_run_id) || 0;
    const traceTitle = decodeTrace(ctx.get('x-trace-title') || body.trace_title || '').slice(0, 80);
    const traceApp = String(ctx.get('x-trace-app') || body.trace_app || '').slice(0, 40);
    if (body && typeof body === 'object') {
      delete body.trace_run_id;
      delete body.trace_title;
      delete body.trace_app;
    }
    ctx.state.traceRunId = traceRunId;
    ctx.state.traceTitle = traceTitle;
    ctx.state.traceApp = traceApp;

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

    const work = resolveWorkScope(input, skill);
    if (work) {
      input.work_id = work.workId;
      input._workScope = work;
    }

    const memQuery = input.message || input.topic || input.user_message || input.question || params.message || '';
    if (skill.memoryConfig?.enabled && !input._skipMemory) {
      const memoryText = await this.service.memoryEngine.getContext(skill.name, String(memQuery), work?.workId);
      const knowledgeText = this._knowledgeContext(work, String(memQuery));
      input._memoryContext = [ memoryText, knowledgeText ].filter(Boolean).join('\n\n');
    }

    const overrideMaxTokens = parseOverrideMaxTokens(params.max_tokens ?? body.max_tokens ?? query.max_tokens);
    if (overrideMaxTokens) {
      input = { ...input, _maxTokensOverride: overrideMaxTokens };
    }

    const executor = registry.createExecutor(skill.scheme, skill);
    if (!executor.isReady()) {
      const reason = executor.getNotReadyReason() || '方案未就绪';
      const err = new Error(`Agent 方案「${skill.scheme}」不可用: ${reason}`);
      err.status = 501;
      throw err;
    }

    const llmAbort = new AbortController();
    let invokeFinished = false;
    const onClientGone = () => {
      if (!invokeFinished) llmAbort.abort();
    };
    ctx.req?.on?.('close', onClientGone);
    ctx.req?.on?.('aborted', onClientGone);
    ctx.res?.on?.('close', onClientGone);
    ctx.state.llmAbort = llmAbort;
    ctx.state._releaseLlmAbort = () => {
      invokeFinished = true;
      ctx.req?.off?.('close', onClientGone);
      ctx.req?.off?.('aborted', onClientGone);
      ctx.res?.off?.('close', onClientGone);
    };

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

    /** 应用 outbox memory_ops（清醒记忆路径），并按作品记一轮 */
    if (skill.memoryConfig?.enabled) {
      const workId = input._workScope?.workId;
      const ops = result.output?.outbox?.memory_ops || result.output?.memory_ops;
      if (ops) {
        const memMeta = await this.service.memoryEngine.applyOps(skill.name, ops, workId);
        result.meta = { ...(result.meta || {}), memory_ops_applied: memMeta.applied };
      }
      if (skill.memoryConfig.scope === 'work') {
        result.meta = { ...(result.meta || {}), ...(await this._recordWorkTurn({ skill, input, result })) };
      }

      /** 睡梦记忆入队（PostgreSQL + 未跳过） */
      const skipDream = result.meta?.memory_ops_applied > 0
        && this.config.appSettings.memorySystem?.dream?.skipWhenWake !== false;
      if (!skipDream && params.session_id && skill.memoryConfig.scope !== 'work') {
        const { upsertDreamJob } = require('../lib/memory/dreamJobStore');
        const dream = await upsertDreamJob({
          skillName: skill.name,
          projectId: skill.project,
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

    if (result.meta?.verification_blocked) {
      result.meta = {
        ...(result.meta || {}),
        persisted: false,
        reason: 'verification_blocked',
      };
    } else if (typeof skill.callbacks.persistResult === 'function') {
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

  _knowledgeContext(work, query) {
    if (!work) return '';
    try {
      const hits = searchWorkKnowledge(this.config.appSettings.workspacesRoot, work, query, 3);
      if (!hits.length) return '';
      return `## 作品知识库\n${hits.map(hit => hit.snippet).join('\n')}`;
    } catch (err) {
      if (err.code === 'KNOWLEDGE_PROJECT') return '';
      this.ctx.logger.warn('[skillInvoke] knowledge %s', err.message);
      return '';
    }
  }

  async _recordWorkTurn({ skill, input, result }) {
    const work = input._workScope;
    if (!work) return { work_trace: 'no_work' };
    const note = turnNote({
      action: input.action,
      scene: input.scene,
      message: input.user_message || input.message || input.topic,
      reply: result.text || result.output?.reply || result.output?.summary,
    });
    const meta = {
      work_id: work.workId,
      work_platform: work.platform,
    };
    try {
      await this.service.memoryEngine.append(skill.name, note, '作品', work.workId);
    } catch (err) {
      this.ctx.logger.warn('[skillInvoke] work memory %s', err.message);
      meta.work_memory = 'failed';
    }
    try {
      const trace = writeWorkTrace({
        workspacesRoot: this.config.appSettings.workspacesRoot,
        work,
        skillName: skill.name,
        traceId: input.trace_id,
        note,
        action: input.action,
        scene: input.scene,
      });
      meta.work_trace = trace.workspace;
    } catch (err) {
      this.ctx.logger.warn('[skillInvoke] work trace %s', err.message);
      meta.work_trace = 'failed';
    }
    return meta;
  }

  async _traceFailEarly(skillName, ctx, err) {
    try {
      const runId = await this.service.execution.open({
        app_key: ctx.state.traceApp || String(ctx.get('x-trace-app') || ''),
        skill_name: skillName,
        action: '',
        flow_key: 'skill',
        title: skillName,
        target_label: '',
      });
      const note = traceNote(err?.message || '失败');
      if (runId) {
        await this.service.execution.step(runId, {
          node_key: 'invoke',
          title: '调用',
          skill_name: skillName,
          status: 'error',
          log_text: note || '调用没有开始',
          error_text: note,
          elapsed_ms: 0,
        });
        await this.service.execution.finish(runId, {
          status: 'error',
          error_text: note,
          elapsed_ms: 0,
        });
      }
    } catch (traceErr) {
      this.ctx.logger.warn('[execution] early %s', traceErr.message);
    }
  }

  async _traceBegin(ctx, prepared) {
    const parentId = Number(ctx.state.traceRunId) || 0;
    const action = String(prepared.params?.action || '').slice(0, 80);
    const skillName = prepared.skill.name;
    const title = String(ctx.state.traceTitle || '').trim()
      || (action ? `${skillName} / ${action}` : skillName);
    const fields = {
      app_key: ctx.state.traceApp || '',
      skill_name: skillName,
      action,
      flow_key: 'skill',
      title,
      target_label: '',
    };
    let ownId = 0;
    let ownStep = 0;
    let parentStep = 0;
    try {
      ownId = await this.service.execution.open(fields);
      if (ownId) {
        ownStep = await this.service.execution.step(ownId, {
          node_key: action || 'invoke',
          title,
          skill_name: skillName,
          status: 'running',
          log_text: '已开始',
        });
      }
    } catch (err) {
      this.ctx.logger.warn('[execution] begin %s', err.message);
    }
    if (parentId) {
      try {
        parentStep = await this.service.execution.step(parentId, {
          node_key: action || 'invoke',
          title,
          skill_name: skillName,
          status: 'running',
          log_text: '已开始',
        });
      } catch (err) {
        this.ctx.logger.warn('[execution] parent %s', err.message);
      }
    }
    return {
      ownId,
      ownStep,
      parentId,
      parentStep,
      started: Date.now(),
    };
  }

  async _traceEnd(trace, status, note) {
    if (!trace) return;
    const elapsed = Math.max(0, Date.now() - (trace.started || Date.now()));
    const text = traceNote(note);
    const fields = {
      status,
      log_text: text || (status === 'ok' ? '已返回' : '失败'),
      error_text: status === 'error' ? text : '',
      elapsed_ms: elapsed,
    };
    try {
      if (trace.ownStep) await this.service.execution.finishStep(trace.ownStep, fields);
      if (trace.ownId) {
        await this.service.execution.finish(trace.ownId, {
          status,
          error_text: fields.error_text,
          elapsed_ms: elapsed,
        });
      }
      if (trace.parentStep) await this.service.execution.finishStep(trace.parentStep, fields);
    } catch (err) {
      this.ctx.logger.warn('[execution] end %s', err.message);
    }
  }

  /**
   * 执行指定 Skill（JSON 响应）
   * @param {Object} options
   */
  async invoke({ skillName, ctx, bodyOverride }) {
    let prepared;
    try {
      prepared = await this._prepareInvoke({ skillName, ctx, bodyOverride });
    } catch (err) {
      await this._traceFailEarly(skillName, ctx, err);
      throw err;
    }
    const trace = await this._traceBegin(ctx, prepared);
    try {
      const result = await this._finalizeInvoke({ ...prepared, ctx });
      await this._traceEnd(trace, 'ok', '已返回');
      return result;
    } catch (err) {
      await this._traceEnd(trace, 'error', err?.message || '失败');
      throw err;
    } finally {
      ctx.state._releaseLlmAbort?.();
    }
  }

  /**
   * SSE 流式执行 Skill（Pi delta / status 事件）
   * @param {Object} options
   */
  async invokeStream({ skillName, ctx, bodyOverride }) {
    const mergedBody = { ...(bodyOverride || ctx.request.body || {}), stream: true };
    let prepared;
    try {
      prepared = await this._prepareInvoke({ skillName, ctx, bodyOverride: mergedBody });
    } catch (err) {
      await this._traceFailEarly(skillName, ctx, err);
      throw err;
    }

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

    const trace = await this._traceBegin(ctx, prepared);
    try {
      const body = await this._finalizeInvoke({
        ...prepared,
        ctx,
        streamHooks: { piHooks, schemeHooks },
      });
      await this._traceEnd(trace, 'ok', '已返回');
      emit('done', body);
    } catch (err) {
      await this._traceEnd(trace, 'error', err?.message || '失败');
      emit('error', { message: err.message, status: err.status || 500 });
    } finally {
      ctx.state._releaseLlmAbort?.();
      res.end();
    }
  }
}

module.exports = SkillInvokeService;

/**
 * @file interactionLog.js
 * @description Agent 交互日志：写入 workspaces（可写），并可选推送到 testgen BFF。
 *              文件 I/O 失败时降级为内存 + BFF 推送，不影响 Skill 主流程。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const FIELD_MAX = 500;

/**
 * 可写日志目录（plugins/ 在 Docker 默认 ro，不可写）
 * @param {import('egg').Context} [ctx]
 */
function resolveLogDir(ctx) {
  const fromEnv = (process.env.TESTGEN_INTERACTION_LOG_DIR || '').trim();
  if (fromEnv) return fromEnv;

  const settings = ctx?.app?.config?.appSettings;
  const root = settings?.workspacesRoot
    || (process.env.WORKSPACES_ROOT || '').trim()
    || path.join(process.cwd(), 'workspaces');

  return path.join(root, 'testgen-skill', 'logs');
}

function truncate(text, max = FIELD_MAX) {
  const value = String(text ?? '');
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

function nowIso() {
  return new Date().toISOString();
}

function tryEnsureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

function tryAppendLine(filePath, line) {
  try {
    fs.appendFileSync(filePath, `${line}\n`, 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {Object} options
 * @param {string|number} [options.jobId]
 * @param {string|number} [options.runKey]
 * @param {(ctx: import('egg').Context, jobId: number, payload: Object) => Promise<void>} [options.pushContext]
 * @param {import('egg').Context} [options.ctx]
 */
function createInteractionLog(options = {}) {
  const jobId = options.jobId ? String(options.jobId) : 'unknown';
  const runKey = options.runKey || Date.now();
  const ctx = options.ctx || null;
  const pushContext = options.pushContext || null;
  const logDir = resolveLogDir(ctx);
  const dirOk = tryEnsureDir(logDir);
  const filePath = dirOk ? path.join(logDir, `job-${jobId}-${runKey}.jsonl`) : null;
  let fileEnabled = Boolean(filePath);

  if (!dirOk && ctx?.app?.logger) {
    ctx.app.logger.warn(
      '[testgen-skill] interaction log dir unavailable (%s), file logging disabled',
      logDir,
    );
  }

  let latestContext = {
    model: '',
    llm_profile_id: '',
    system_prompt: '',
    user_prompt: '',
    current_direction: 'Agent 初始化…',
    current_phase: 'analyze',
    updated_at: nowIso(),
  };

  /**
   * @param {Object} entry
   */
  function append(entry) {
    if (!fileEnabled || !filePath) return;
    const line = JSON.stringify({ ts: nowIso(), job_id: jobId, ...entry });
    if (!tryAppendLine(filePath, line)) {
      fileEnabled = false;
      ctx?.app?.logger?.warn('[testgen-skill] interaction log write failed, disabled for this run');
    }
  }

  /**
   * @param {Object} patch
   */
  function updateContext(patch = {}) {
    latestContext = {
      ...latestContext,
      ...patch,
      updated_at: nowIso(),
    };
    if (typeof pushContext === 'function' && ctx && jobId !== 'unknown') {
      pushContext(ctx, Number(jobId), latestContext).catch(err => {
        ctx.app?.logger?.warn('[testgen-skill] push agent context failed job=%s %s', jobId, err.message);
      });
    }
    return latestContext;
  }

  /**
   * @param {Object} payload - runLoop / llm onStatus payload
   */
  function handleStatus(payload = {}) {
    try {
      append({ type: 'status', ...payload });

      const patch = {};
      if (payload.model) patch.model = truncate(payload.model);
      if (payload.llm_profile_id) patch.llm_profile_id = payload.llm_profile_id;
      if (payload.system_prompt) patch.system_prompt = String(payload.system_prompt);
      if (payload.user_prompt) patch.user_prompt = String(payload.user_prompt);
      if (payload.current_phase) patch.current_phase = payload.current_phase;
      if (payload.label) patch.current_direction = truncate(payload.label, FIELD_MAX);

      if (payload.phase === 'init' && payload.system_prompt) {
        patch.current_direction = '已加载系统提示词，准备迭代生成';
      } else if (payload.phase === 'prompt') {
        patch.current_direction = truncate(
          payload.label || `准备第 ${payload.step || ''} 步 LLM 调用`,
          FIELD_MAX,
        );
      } else if (payload.phase === 'llm') {
        patch.current_direction = truncate(payload.label || '正在调用模型…', FIELD_MAX);
      } else if (payload.phase === 'loop') {
        patch.current_direction = truncate(payload.label || 'Loop 迭代中…', FIELD_MAX);
      } else if (payload.phase === 'step_done') {
        patch.current_direction = truncate(
          payload.label || `第 ${payload.step || ''} 步完成`,
          FIELD_MAX,
        );
      } else if (payload.phase === 'done') {
        patch.current_direction = 'Agent 执行完成';
      }

      if (Object.keys(patch).length) {
        updateContext(patch);
      }
    } catch (err) {
      ctx?.app?.logger?.warn('[testgen-skill] handleStatus error: %s', err.message);
    }
  }

  function finalize(meta = {}) {
    try {
      append({ type: 'finalize', meta });
      updateContext({
        current_direction: meta.error ? `执行失败：${meta.error}` : 'Agent 执行完成',
        ...(meta.error ? { abnormal_content: String(meta.error) } : {}),
      });
    } catch (err) {
      ctx?.app?.logger?.warn('[testgen-skill] finalize log error: %s', err.message);
    }
    return { filePath: filePath || null, context: latestContext };
  }

  append({ type: 'start', job_id: jobId });

  return {
    filePath: filePath || null,
    append,
    handleStatus,
    updateContext,
    finalize,
    getContext: () => ({ ...latestContext }),
  };
}

module.exports = {
  createInteractionLog,
  resolveLogDir,
  truncate,
};

/**
 * @file dreamWorker.js
 * @description 睡梦记忆：session 空闲后 LLM 离线整理 → merge 到 file/vector 记忆。
 */

'use strict';

const { llmChat, extractJsonObject } = require('../llm/chat');
const { resolveLlm } = require('../llm/resolveLlm');
const {
  claimNextDreamJob,
  completeDreamJob,
  failDreamJob,
} = require('./dreamJobStore');

/**
 * 按 Skill 拉取对话摘录（供睡梦整理）
 * @param {import('egg').Context} ctx
 * @param {Object} skill
 * @param {string} sessionId
 * @param {number} limit
 */
async function fetchDreamDialogue(ctx, skill, sessionId, limit = 15) {
  if (typeof skill.callbacks?.getDreamDialogue === 'function') {
    return skill.callbacks.getDreamDialogue(ctx, sessionId, limit);
  }

  const tables = skill.dbTables || [];
  if (tables.includes('note_entries')) {
    return ctx.service.dbManager.listNoteEntries(sessionId, limit);
  }
  if (tables.includes('qa_log')) {
    const rows = await ctx.service.dbManager.listQaLog(limit);
    return rows.map(r => ({
      user_message: r.question,
      assistant_reply: r.answer,
    }));
  }
  if (tables.includes('research_log')) {
    const rows = await ctx.service.dbManager.listResearchLog(limit);
    return rows.map(r => ({
      user_message: r.topic,
      assistant_reply: r.summary,
    }));
  }
  return [];
}

function formatDialogue(entries) {
  return entries.map(e =>
    `用户: ${e.user_message || e.question || e.topic || ''}\n助手: ${e.assistant_reply || e.answer || e.summary || ''}`
  ).join('\n---\n');
}

/**
 * 执行单个 dream job
 * @param {Object} ctx - Egg context
 * @param {Object} job
 */
async function processDreamJob(ctx, job) {
  const { skill_name: skillName, session_id: sessionId, job_id: jobId } = job;

  try {
    const skill = ctx.service.pluginManager.get(skillName);
    if (!skill?.memoryConfig?.enabled) {
      await completeDreamJob(jobId, { skipped: true, reason: 'memory disabled' });
      return;
    }

    const llm = resolveLlm({
      skillDefaultProfile: skill.config?.llmDefaultProfile,
      appSettings: ctx.app.config.appSettings,
    });

    const entries = await fetchDreamDialogue(ctx, skill, sessionId, 15);
    const dialogue = formatDialogue(entries);
    const existing = await ctx.service.memoryEngine.read(skillName);

    const prompt = [
      '你是睡梦记忆整理器。根据对话摘录，输出 JSON：',
      '{ "memory_ops": [{ "op": "append", "text": "...", "section": "偏好|事实" }] }',
      '只保留长期偏好/事实，忽略流水账。若无值得记忆则 memory_ops 为空数组。',
      '',
      `## 现有记忆\n${String(existing.content || '').slice(0, 2000) || '（空）'}`,
      '',
      `## 对话摘录\n${dialogue.slice(0, 4000) || '（无）'}`,
    ].join('\n');

    const result = await llmChat({
      llm,
      messages: [
        { role: 'system', content: '只输出 JSON，不要 markdown。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      maxTokens: 1024,
    });

    const parsed = extractJsonObject(result.text) || { memory_ops: [] };
    const ops = parsed.memory_ops || [];
    const applied = ops.length
      ? await ctx.service.memoryEngine.applyOps(skillName, ops)
      : { applied: 0 };

    await completeDreamJob(jobId, {
      applied: applied.applied,
      ops_count: ops.length,
      source: 'dream',
    });
  } catch (err) {
    await failDreamJob(jobId, err.message);
    throw err;
  }
}

/**
 * 启动轮询 worker
 * @param {import('egg').Application} app
 */
function startDreamWorker(app) {
  const cfg = app.config.appSettings.memorySystem?.dream || {};
  if (cfg.workerEnabled === false) return;

  const workerId = `dream-${process.pid}-${Date.now()}`;
  const intervalMs = Number(cfg.pollIntervalMs || process.env.MEMORY_DREAM_POLL_MS || 15_000);

  app.logger.info('[DreamWorker] 启动 workerId=%s interval=%dms', workerId, intervalMs);

  const timer = setInterval(async () => {
    let job;
    try {
      job = await claimNextDreamJob(workerId);
      if (!job) return;
      app.logger.info('[DreamWorker] 处理 job=%s skill=%s session=%s', job.job_id, job.skill_name, job.session_id);
      const ctx = app.createAnonymousContext();
      await processDreamJob(ctx, job);
    } catch (err) {
      app.logger.error('[DreamWorker] %s', err.message);
      if (job?.job_id) {
        await failDreamJob(job.job_id, err.message).catch(() => {});
      }
    }
  }, intervalMs);

  timer.unref?.();
  app.dreamWorkerTimer = timer;
}

function stopDreamWorker(app) {
  if (app.dreamWorkerTimer) {
    clearInterval(app.dreamWorkerTimer);
    app.dreamWorkerTimer = null;
  }
}

module.exports = {
  fetchDreamDialogue,
  processDreamJob,
  startDreamWorker,
  stopDreamWorker,
};

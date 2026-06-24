/**
 * @file runLoop.js
 * @description Loop 方案：固定步数循环，每步 LLM 更新 state 直至 done。
 */

'use strict';

const { llmChat, extractJsonObject, llmAvailable } = require('../../llm/chat');

/**
 * @typedef {Object} LoopStep
 * @property {number} step
 * @property {Record<string, unknown>} state
 * @property {string} partialOutput
 * @property {boolean} done
 */

/**
 * 执行 Loop 迭代
 * @param {Object} options
 * @param {import('../../llm/types').LlmRuntimeConfig} options.llm
 * @param {Object} options.skill
 * @param {Record<string, unknown>} options.input
 * @param {Object} [options.hooks]
 */
async function runLoop(options) {
  const { llm, skill, input, hooks } = options;
  const loopConfig = skill.config?.loop || {};
  const maxSteps = Math.min(Math.max(Number(loopConfig.maxSteps) || 5, 1), 10);
  const topic = String(input.topic || input.message || input.query || '未命名主题');
  const stopWhen = loopConfig.stopWhen || 'llm-done';

  /** 只读 list 动作 */
  if (input.action === 'list' && Array.isArray(input.research_log)) {
    const lines = input.research_log.map(r =>
      `- [${r.created_at}] ${r.topic}: ${r.summary?.slice(0, 80)}`
    );
    const reply = lines.length
      ? `最近 ${lines.length} 条调研记录：\n${lines.join('\n')}`
      : '暂无调研记录';
    return {
      text: reply,
      output: { action: 'list', entries: input.research_log, scheme: 'loop' },
      meta: { scheme: 'loop', skill_action: 'list' },
    };
  }

  if (!llmAvailable(llm)) {
    const stub = `[Loop 占位] 主题「${topic}」— 请配置 LLM 后重试（maxSteps=${maxSteps}）`;
    return {
      text: stub,
      output: {
        topic,
        summary: stub,
        steps: [],
        stoppedReason: 'no_llm',
        scheme: 'loop',
      },
      meta: { scheme: 'loop', maxSteps },
    };
  }

  /** @type {LoopStep[]} */
  const steps = [];
  let state = { topic, notes: [], summary: '' };
  let stoppedReason = 'max_steps';

  for (let step = 0; step < maxSteps; step++) {
    hooks?.onStatus?.({ phase: 'loop', label: `Loop 第 ${step + 1}/${maxSteps} 步…` });

    const systemPrompt = [
      '你是调研助手，采用循环迭代方式逐步完善调研摘要。',
      '每次只输出 JSON：',
      '{ "continue": boolean, "note": string, "summary": string, "done": boolean }',
      '- note: 本步新发现',
      '- summary: 截至目前的综合摘要',
      '- done=true 且 continue=false 时结束循环',
    ].join('\n');

    const userPrompt = [
      `主题：${topic}`,
      `当前步：${step + 1}/${maxSteps}`,
      input._memoryContext ? `相关记忆：\n${input._memoryContext}` : '',
      `已有 notes：${JSON.stringify(state.notes)}`,
      `当前 summary：${state.summary || '（空）'}`,
      stopWhen === 'llm-done' ? '若摘要已足够完整，请设置 done=true, continue=false' : '',
    ].filter(Boolean).join('\n');

    let parsed;
    try {
      const result = await llmChat({
        llm,
        hooks,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.6,
        maxTokens: 512,
      });
      parsed = extractJsonObject(result.text) || {
        continue: step < maxSteps - 1,
        note: result.text.slice(0, 200),
        summary: result.text.slice(0, 400),
        done: false,
      };
    } catch (err) {
      stoppedReason = 'llm_error';
      state.summary = `【LLM 错误】${err.message}`;
      break;
    }

    if (parsed.note) state.notes.push(String(parsed.note));
    if (parsed.summary) state.summary = String(parsed.summary);

    steps.push({
      step: step + 1,
      state: { ...state },
      partialOutput: String(parsed.note || ''),
      done: Boolean(parsed.done),
    });

    if (parsed.done || parsed.continue === false) {
      stoppedReason = 'llm-done';
      break;
    }
  }

  const reply = state.summary || `已完成 ${steps.length} 步调研，主题：${topic}`;

  /** 将摘要写入 vector 记忆（成功完成时） */
  const memoryOps = (state.summary && stoppedReason !== 'llm_error')
    ? [{ op: 'append', text: `[${topic}] ${state.summary.slice(0, 500)}` }]
    : null;

  return {
    text: reply,
    output: {
      topic,
      summary: state.summary,
      notes: state.notes,
      steps,
      stoppedReason,
      scheme: 'loop',
      memory_ops: memoryOps,
    },
    meta: {
      scheme: 'loop',
      maxSteps,
      stepsRun: steps.length,
      model: llm.model,
    },
  };
}

module.exports = { runLoop };

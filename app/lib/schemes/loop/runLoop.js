/**
 * @file runLoop.js
 * @description Loop 方案：固定步数循环，每步 LLM 更新 state 直至 done。
 *              Skill 可通过 config.loop 自定义 Prompt 与 state 合并策略。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { llmChat, extractJsonObject, llmAvailable } = require('../../llm/chat');

/** 默认调研类 Prompt（research-skill 等未自定义时使用） */
const DEFAULT_SYSTEM_PROMPT = [
  '你是调研助手，采用循环迭代方式逐步完善调研摘要。',
  '每次只输出 JSON：',
  '{ "continue": boolean, "note": string, "summary": string, "done": boolean }',
  '- note: 本步新发现',
  '- summary: 截至目前的综合摘要',
  '- done=true 且 continue=false 时结束循环',
].join('\n');

const DEFAULT_JSON_SCHEMA = '{ "continue": boolean, "note": string, "summary": string, "done": boolean }';

/** Hook 失败（如日志只读）不中断 Loop */
function emitStatus(hooks, payload) {
  try {
    hooks?.onStatus?.(payload);
  } catch {
    // ignore
  }
}

/**
 * @typedef {Object} LoopStep
 * @property {number} step
 * @property {Record<string, unknown>} state
 * @property {string} partialOutput
 * @property {boolean} done
 */

/**
 * 读取 Skill templates 下的 Prompt 文件
 * @param {Object} skill
 * @param {string} filename
 */
function loadTemplate(skill, filename) {
  if (!skill?.dirPath || !filename) return null;
  const filePath = path.join(skill.dirPath, 'templates', filename);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8').trim();
}

/**
 * 按 stateMerge 策略合并 LLM 解析字段到 state
 * @param {Record<string, unknown>} state
 * @param {Record<string, unknown>} parsed
 * @param {Record<string, string>} stateMerge - 如 { note: 'append', testCases: 'concat' }
 */
function mergeParsedIntoState(state, parsed, stateMerge) {
  for (const [ key, mode ] of Object.entries(stateMerge)) {
    const value = parsed[key];
    if (value === undefined || value === null) continue;

    if (mode === 'append') {
      if (!Array.isArray(state[key])) state[key] = [];
      if (Array.isArray(value)) state[key].push(...value.map(String));
      else state[key].push(String(value));
    } else if (mode === 'concat') {
      if (!Array.isArray(state[key])) state[key] = [];
      if (Array.isArray(value)) state[key] = state[key].concat(value);
      else state[key].push(value);
    } else if (mode === 'replace') {
      state[key] = value;
    } else if (mode === 'merge-object' && typeof value === 'object') {
      state[key] = { ...(state[key] || {}), ...value };
    }
  }
}

/**
 * 只读 list 动作的统一处理
 * @param {Record<string, unknown>} input
 * @param {Object} loopConfig
 */
function handleListAction(input, loopConfig) {
  const listKey = loopConfig.listRecordsKey || 'research_log';
  const records = input[listKey];
  if (input.action !== 'list' || !Array.isArray(records)) return null;

  const labelField = loopConfig.listLabelField || 'topic';
  const summaryField = loopConfig.listSummaryField || 'summary';
  const emptyText = loopConfig.listEmptyText || '暂无记录';

  const lines = records.map(r => {
    const label = r[labelField] ?? r.title ?? r.id ?? '';
    const summary = String(r[summaryField] ?? '').slice(0, 80);
    return `- [${r.created_at || ''}] ${label}: ${summary}`;
  });

  const reply = lines.length
    ? `最近 ${lines.length} 条记录：\n${lines.join('\n')}`
    : emptyText;

  return {
    text: reply,
    output: { action: 'list', entries: records, scheme: 'loop' },
    meta: { scheme: 'loop', skill_action: 'list' },
  };
}

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
  const topic = String(input.topic || input.title || input.message || input.query || '未命名主题');
  const stopWhen = loopConfig.stopWhen || 'llm-done';
  const stateMerge = loopConfig.stateMerge || { note: 'append', summary: 'replace' };
  const initialState = loopConfig.initialState || { notes: [], summary: '' };

  const listResult = handleListAction(input, loopConfig);
  if (listResult) return listResult;

  /** 只读 get：由 Skill enrichContext 注入 run */
  if (input.action === 'get' && input.run) {
    const run = input.run;
    const cases = run.test_cases || [];
    return {
      text: `共 ${cases.length} 条测试用例（run_id=${run.id}）`,
      output: {
        action: 'get',
        run_id: run.id,
        doc_title: run.doc_title,
        summary: run.summary,
        test_cases: cases,
        coverage_notes: run.coverage_notes,
        steps_count: run.steps_count,
        created_at: run.created_at,
        scheme: 'loop',
      },
      meta: { scheme: 'loop', skill_action: 'get' },
    };
  }

  /** 注册文档：跳过 LLM，由 Skill persistResult 落库 */
  if (input.action === 'register-doc') {
    const title = String(input.doc_title || input.topic || '未命名文档');
    return {
      text: `文档待注册：${title}`,
      output: {
        action: 'register-doc',
        doc_title: title,
        doc_content: input.doc_content || '',
        doc_type: input.doc_type || 'markdown',
        source: input.source || 'api',
        tags: input.tags || [],
        scheme: 'loop',
      },
      meta: { scheme: 'loop', skill_action: 'register-doc' },
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

  const systemPrompt = loopConfig.systemPrompt
    || loadTemplate(skill, loopConfig.systemPromptFile)
    || DEFAULT_SYSTEM_PROMPT;

  emitStatus(hooks, {
    phase: 'init',
    label: 'Loop Agent 初始化',
    model: llm.model,
    llm_profile_id: llm.profileIdUsed || llm.profileId || '',
    system_prompt: systemPrompt,
  });

  const jsonSchemaHint = loopConfig.jsonSchemaHint || DEFAULT_JSON_SCHEMA;
  const userContextBlock = loopConfig.userContextFields || [];
  const extraUserLines = [];

  for (const field of userContextBlock) {
    if (input[field] !== undefined && input[field] !== null && input[field] !== '') {
      extraUserLines.push(`${field}：${typeof input[field] === 'string' ? input[field] : JSON.stringify(input[field])}`);
    }
  }

  if (input.doc_content) {
    const maxLen = Number(loopConfig.docContentMaxLen) || 6000;
    extraUserLines.push(`文档内容：\n${String(input.doc_content).slice(0, maxLen)}`);
  }

  /** @type {LoopStep[]} */
  const steps = [];
  let state = { topic, ...initialState };
  let stoppedReason = 'max_steps';

    for (let step = 0; step < maxSteps; step++) {
    const stepPhases = loopConfig.stepPhases || [];
    const expectedPhase = stepPhases[step] || state.phase || 'analyze';

    const stepDirectives = [];
    if (stepPhases.length) {
      stepDirectives.push(`本步强制 phase="${expectedPhase}"（与步序对齐，勿停留在 analyze）。`);
    }
    if (typeof loopConfig.buildStepDirective === 'function') {
      stepDirectives.push(
        loopConfig.buildStepDirective({ step, maxSteps, expectedPhase, input, state, loopConfig }),
      );
    }

    const userPrompt = [
      `主题：${topic}`,
      `当前步：${step + 1}/${maxSteps}`,
      stepPhases.length ? `本步阶段：${expectedPhase}` : '',
      `期望 JSON 结构：${jsonSchemaHint}`,
      input._memoryContext ? `相关记忆：\n${input._memoryContext}` : '',
      ...extraUserLines,
      ...stepDirectives,
      `当前 state：${JSON.stringify(state)}`,
      stopWhen === 'llm-done' ? '若任务已足够完整，请设置 done=true, continue=false' : '',
      loopConfig.stepHint || '',
    ].filter(Boolean).join('\n\n');

    emitStatus(hooks, {
      phase: 'prompt',
      label: `准备第 ${step + 1}/${maxSteps} 步 LLM 调用`,
      step: step + 1,
      maxSteps,
      current_phase: state.phase || 'analyze',
      user_prompt: userPrompt,
      model: llm.model,
    });

    emitStatus(hooks, { phase: 'loop', label: `Loop 第 ${step + 1}/${maxSteps} 步…` });

    let parsed;
    let rawText = '';
    try {
      const result = await llmChat({
        llm,
        hooks,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: loopConfig.temperature ?? 0.5,
        maxTokens: loopConfig.maxTokens ?? 1024,
      });
      rawText = String(result.text || '').trim();
      if (typeof loopConfig.parseStepOutput === 'function') {
        parsed = loopConfig.parseStepOutput(rawText, {
          step,
          maxSteps,
          expectedPhase,
          input,
          state,
          loopConfig,
        });
      } else {
        parsed = extractJsonObject(rawText) || {
          continue: step < maxSteps - 1,
          note: rawText.slice(0, 200),
          summary: rawText.slice(0, 400),
          done: false,
        };
      }
    } catch (err) {
      stoppedReason = 'llm_error';
      state.summary = `【LLM 错误】${err.message}`;
      break;
    }

    mergeParsedIntoState(state, parsed, stateMerge);

    if (loopConfig.enforcePhaseByStep && expectedPhase) {
      state.phase = expectedPhase;
    }

    const mergedCases = Array.isArray(state.testCases) ? state.testCases : [];
    if (loopConfig.blockDoneWithoutCases && parsed.done && !mergedCases.length && step < maxSteps - 1) {
      parsed.done = false;
      parsed.continue = true;
    }

    const partialOutput = String(
      parsed.note || parsed._parse_warning || parsed.phase || parsed.summary || '',
    ).slice(0, 500);

    steps.push({
      step: step + 1,
      phase: expectedPhase,
      state: JSON.parse(JSON.stringify(state)),
      partialOutput,
      rawText: rawText.slice(0, 12000),
      parseWarning: parsed._parse_warning || null,
      done: Boolean(parsed.done),
    });

    emitStatus(hooks, {
      phase: 'step_done',
      label: partialOutput || `第 ${step + 1} 步完成`,
      step: step + 1,
      current_phase: state.phase || 'analyze',
    });

    if (parsed.done || parsed.continue === false) {
      stoppedReason = 'llm-done';
      break;
    }
  }

  emitStatus(hooks, { phase: 'done', label: 'Loop 执行完成', model: llm.model });

  const reply = state.summary || `已完成 ${steps.length} 步迭代，主题：${topic}`;

  const memoryText = loopConfig.memoryTemplate
    ? loopConfig.memoryTemplate.replace('{{topic}}', topic).replace('{{summary}}', String(state.summary || '').slice(0, 500))
    : `[${topic}] ${String(state.summary || '').slice(0, 500)}`;

  const memoryOps = (state.summary && stoppedReason !== 'llm_error')
    ? [{ op: 'append', text: memoryText }]
    : null;

  const output = {
    topic,
    summary: state.summary,
    steps,
    stoppedReason,
    scheme: 'loop',
    memory_ops: memoryOps,
    ...Object.fromEntries(
      Object.keys(stateMerge)
        .filter(k => k !== 'summary' && state[k] !== undefined)
        .map(k => [ k, state[k] ])
    ),
  };

  if (state.notes) output.notes = state.notes;

  return {
    text: reply,
    output,
    meta: {
      scheme: 'loop',
      maxSteps,
      stepsRun: steps.length,
      model: llm.model,
    },
  };
}

module.exports = { runLoop };

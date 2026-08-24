/**
 * @file fitness-judge-skill/index.js
 * @description Fitness 语义判定 Agent（Loop 短步）
 */

'use strict';

const { getRubric, listRubrics } = require('./lib/rubricRegistry');
const {
  ruleBasedJudge,
  ruleBasedPreReview,
  ruleBasedExplain,
  ruleBasedSummary,
} = require('./lib/ruleFallback');

function formatObservations(observations = []) {
  return observations.map((o, i) => [
    `### 子项 #${o.sub_run_index ?? i} · ${o.sub_verdict || (o.pass ? 'pass' : o.verdict || '—')}`,
    o.template_code ? `- 模板: ${o.template_code}${o.scheme_id ? ` (${o.scheme_id})` : ''}` : '',
    o.runner_type ? `- Runner: ${o.runner_type}` : '',
    `- HTTP: ${o.http_status ?? '—'}${o.poll_status != null ? ` · poll HTTP ${o.poll_status}` : ''}`,
    `- 输入: ${o.input_summary || '—'}`,
    `- 期望观测: ${o.expected_hint || '—'}`,
    `- 响应摘要: ${o.response_excerpt || o.output_summary || '—'}`,
    o.template_hints ? `- 模板线索: ${o.template_hints}` : '',
    o.semantic_summary ? `- 语义比对: ${o.semantic_summary}` : '',
    o.perf_summary ? `- 压测指标: ${o.perf_summary}` : '',
    o.assertion_types?.length ? `- 断言类型: ${o.assertion_types.join(', ')}` : '',
    o.assertion_failures ? `- 断言失败: ${o.assertion_failures}` : '',
    o.error_message ? `- 运行错误: ${o.error_message}` : '',
    o.journey_summary ? `- Journey: ${JSON.stringify(o.journey_summary).slice(0, 600)}` : '',
    o.cli_command ? `- CLI: ${o.cli_command} (exit ${o.cli_exit_code ?? '—'})` : '',
  ].filter(Boolean).join('\n')).join('\n\n');
}

function formatRunContext(ctx = {}) {
  if (!ctx || !Object.keys(ctx).length) return '';
  return [
    '## 运行上下文',
    `- Run 状态: ${ctx.status ?? '—'} · 判定: ${ctx.verdict ?? '—'}`,
    `- 方案/验证: ${ctx.scheme_id ?? '—'} / ${ctx.validation_id ?? '—'}`,
    ctx.template_code ? `- 配置模板: ${ctx.template_code}${ctx.template_name ? ` · ${ctx.template_name}` : ''}` : '',
    `- 用例: ${ctx.item_id ?? '—'} ${ctx.item_name ? `· ${ctx.item_name}` : ''}`,
    ctx.category_major_id ? `- 大类: ${ctx.category_major_id}` : '',
    ctx.detail_summary ? `- 用例摘要: ${String(ctx.detail_summary).slice(0, 300)}` : '',
    ctx.expected_observation ? `- 期望观测: ${String(ctx.expected_observation).slice(0, 400)}` : '',
    `- 子项统计: 通过 ${ctx.pass_count ?? 0} / 失败 ${ctx.fail_count ?? 0} / 共 ${ctx.total_count ?? 0}`,
    ctx.error_message ? `- Run 级错误: ${ctx.error_message}` : '',
  ].filter(Boolean).join('\n');
}

function buildLoopTopic(action, params) {
  if (action === 'explain') {
    return [
      '任务：对比【配置项】【目标项】【实际返回】，分析导致本 Run 失败的差异与根因。',
      '禁止只汇总详情；必须输出差异对照与可操作建议。',
      `run_id=${params.run_id || '—'} item_id=${params.item_id || '—'}`,
    ].join(' ');
  }
  if (action === 'pre_review') {
    return `fitness_pre_review_${params.run_id || params.item_id || 'unknown'}`;
  }
  if (action === 'summary') {
    return `fitness_plan_summary_${params.plan_id || 'unknown'}`;
  }
  if (action === 'judge') {
    return `fitness_judge_${params.rubric_id || 'default'}`;
  }
  return `fitness_judge_${action}`;
}

function jsonSchemaForAction(action) {
  if (action === 'explain') {
    return '{ "done": true, "continue": false, "summary": "Markdown 解读正文" }';
  }
  if (action === 'summary') {
    return '{ "done": true, "continue": false, "summary": "Markdown 计划摘要" }';
  }
  if (action === 'pre_review') {
    return '{ "done": true, "continue": false, "score": number, "checklist": [{ "item", "ok", "note" }], "summary": string }';
  }
  return '{ "continue": false, "done": true, "pass": boolean, "score": number, "reasons": string[], "summary": string }';
}

function tryParseJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

function parseLoopStepOutput(rawText, ctx = {}) {
  const text = String(rawText || '').trim();
  const action = ctx.input?.action;
  const parsed = tryParseJsonObject(text);

  if (parsed?.summary) {
    return { ...parsed, done: parsed.done !== false, continue: false };
  }

  if ((action === 'explain' || action === 'summary') && text.length > 48) {
    const looksLikeMd = /^#|^- |^\*\*|^## /m.test(text) || text.includes('\n');
    if (looksLikeMd || !text.startsWith('{')) {
      return { summary: text, done: true, continue: false };
    }
  }

  if (parsed) return parsed;

  return {
    continue: false,
    note: text.slice(0, 200),
    summary: text.slice(0, 4000),
    done: text.length > 0,
  };
}

function needsRuleFallback(result) {
  const output = result.output || {};
  const meta = result.meta || {};
  if (meta.stoppedReason === 'no_llm' || output.stoppedReason === 'no_llm') return true;
  if (output.error === 'missing_question') return true;
  const text = String(result.text || output.summary || '').trim();
  if (!text) return true;
  if (/^已完成 \d+ 步迭代，主题：/.test(text)) return true;
  if (text.length < 24 && !output.summary) return true;
  if (!result.text && output.score == null && output.pass == null && !output.summary) return true;
  return /占位|请配置 LLM|no_llm|missing_question|请提供 message 或 question/i.test(text);
}

function parseJudgeOutput(output, text, rubric, thresholdJson = {}) {
  const passThreshold = Number(thresholdJson.pass_threshold ?? rubric.pass_threshold ?? 0.7);
  const score = Number(output.score);
  const hasScore = Number.isFinite(score);
  const pass = output.pass === true || (hasScore && score >= passThreshold);
  return {
    pass,
    score: hasScore ? score : (pass ? passThreshold : 0),
    reasons: Array.isArray(output.reasons) ? output.reasons : [ output.summary || text || '' ].filter(Boolean),
  };
}

module.exports = {
  name: 'fitness-judge-skill',
  version: '1.2.0',
  description: 'Fitness 语义判定 — judge / explain / pre_review / summary',
  scheme: 'loop',
  routes: [
    {
      path: '/api/skills/fitness-judge',
      method: 'POST',
      description: 'Fitness 语义判定',
      requiresAuth: false,
    },
  ],
  dbTables: [ 'fitness_judge_runs' ],
  config: {
    llmDefaultProfile: 'ollama-qwen',
    actionDefaults: { POST: 'judge' },
    loop: {
      maxSteps: 2,
      stopWhen: 'llm-done',
      systemPromptFile: 'judge-system.md',
      temperature: 0.2,
      maxTokens: 4096,
      llmTimeoutMs: 900000,
      stateMerge: {
        summary: 'replace',
        reasons: 'replace',
        pass: 'replace',
        score: 'replace',
        checklist: 'replace',
      },
      initialState: { summary: '', reasons: [] },
      parseStepOutput: parseLoopStepOutput,
      userContextFields: [
        'action',
        'explain_task',
        'config_text',
        'expected_text',
        'actual_text',
        'assertion_diff_text',
        'rubric',
        'observations_text',
        'run_id',
        'item_id',
        'materials_text',
        'focus',
        'threshold_json',
      ],
    },
  },
  callbacks: {
    async beforeExecute(ctx, params) {
      const action = params.action || 'judge';

      if (action === 'list-rubrics') {
        return { ...params, action, rubrics: listRubrics() };
      }

      if (action === 'judge') {
        const rubricId = params.rubric_id || 'consult_quality_v1';
        const observations = params.observations;
        if (!Array.isArray(observations) || !observations.length) {
          const err = new Error('judge 缺少 observations[]');
          err.status = 400;
          throw err;
        }
        return {
          ...params,
          action,
          rubric_id: rubricId,
          rubric: getRubric(rubricId),
          observations,
          threshold_json: params.threshold_json || {},
        };
      }

      if (action === 'pre_review') {
        const materials = params.materials || {
          observations: params.observations,
          expected_observation: params.expected_observation,
          threshold_json: params.threshold_json,
        };
        const rubricId = params.rubric_id || materials.rubric_id || 'consult_quality_v1';
        return {
          ...params,
          action,
          rubric_id: rubricId,
          rubric: getRubric(rubricId),
          materials,
          observations: materials.observations || params.observations || [],
        };
      }

      if (action === 'explain') {
        const observations = params.observations || [];
        if (!Array.isArray(observations) || !observations.length) {
          const err = new Error('explain 缺少 observations[]');
          err.status = 400;
          throw err;
        }
        return {
          ...params,
          action,
          run_id: params.run_id,
          item_id: params.item_id,
          observations,
          run_context: params.run_context || {},
          config_text: params.config_text || '',
          expected_text: params.expected_text || '',
          actual_text: params.actual_text || '',
          assertion_diff_text: params.assertion_diff_text || '',
          focus: params.focus || 'failed',
        };
      }

      if (action === 'summary') {
        const observations = params.observations || [];
        return {
          ...params,
          action,
          plan_id: params.plan_id,
          plan_name: params.plan_name,
          observations,
        };
      }

      const err = new Error(`不支持的动作: ${action}`);
      err.status = 400;
      throw err;
    },

    async enrichContext(ctx, params) {
      if (params.action === 'list-rubrics') {
        return { action: 'list-rubrics', rubrics: params.rubrics || listRubrics() };
      }

      const action = params.action || 'judge';
      const rubric = params.rubric || getRubric(params.rubric_id);
      const observations = params.observations || params.materials?.observations || [];
      const observationsText = formatObservations(observations);
      const runContextText = action === 'explain'
        ? formatRunContext(params.run_context)
        : '';
      const topic = buildLoopTopic(action, params);

      const base = {
        action,
        topic,
        message: topic,
        run_id: params.run_id,
        item_id: params.item_id,
        rubric_id: params.rubric_id || rubric?.name,
        rubric: rubric ? {
          name: rubric.name,
          dimensions: rubric.dimensions,
          pass_threshold: rubric.pass_threshold,
          criteria: rubric.prompt,
        } : undefined,
        observations_text: [ runContextText, observationsText ].filter(Boolean).join('\n\n'),
        materials_text: params.materials ? JSON.stringify(params.materials, null, 2).slice(0, 4000) : '',
        threshold_json: params.threshold_json || params.materials?.threshold_json || params.run_context?.threshold_json || {},
        focus: params.focus,
        loop_json_schema_hint: jsonSchemaForAction(action),
        _observations: observations,
        _materials: params.materials,
        _run_context: params.run_context,
      };

      if (action === 'explain') {
        return {
          ...base,
          explain_task: topic,
          config_text: params.config_text || '',
          expected_text: params.expected_text || '',
          actual_text: params.actual_text || '',
          assertion_diff_text: params.assertion_diff_text || '',
          loop_system_prompt_file: 'explain-system.md',
        };
      }

      return base;
    },

    async formatResponse(ctx, result) {
      const output = result.output || {};
      const action = output.action || result.meta?.skill_action || 'judge';
      const params = result.params || result.meta?.params || {};

      if (action === 'list-rubrics') {
        return {
          reply: '内置 rubric 列表',
          output: { rubrics: output.rubrics || listRubrics() },
          meta: { ...result.meta, action },
        };
      }

      if (action === 'explain') {
        let markdown = output.summary || output.markdown || result.text || '';
        const fallback = needsRuleFallback(result)
          || /^已完成 \d+ 步迭代，主题：/.test(String(markdown || result.text || ''));
        if (fallback || !String(markdown || '').trim()) {
          // 不再用规则汇总冒充 AI：返回明确不可用，由 BFF 报错
          const hint = ruleBasedExplain(
            params.run_id || output.run_id,
            params._observations || params.observations || [],
            params._run_context || params.run_context,
          );
          return {
            reply: '',
            output: { markdown: '', action: 'explain', debug_rule_hint: hint.slice(0, 500) },
            meta: {
              ...result.meta,
              action,
              run_id: output.run_id || params.run_id,
              fallback: true,
              error: 'EXPLAIN_AI_UNAVAILABLE',
            },
          };
        }
        return {
          reply: markdown,
          output: { markdown, action: 'explain' },
          meta: {
            ...result.meta,
            action,
            run_id: output.run_id || params.run_id,
            fallback: false,
          },
        };
      }

      if (action === 'summary') {
        const planName = params.plan_name || output.plan_name || `计划 #${params.plan_id || ''}`;
        const observations = params.observations || params._observations || [];
        let markdown = output.summary || output.markdown || result.text || '';
        if (!markdown || needsRuleFallback(result)) {
          markdown = ruleBasedSummary(planName, observations);
        }
        const passed = observations.filter(o => o.result_status === 'passed').length;
        const total = observations.length;
        return {
          reply: markdown,
          output: {
            action: 'summary',
            markdown,
            pass_rate: total ? Math.round(100 * passed / total) : 0,
            totals: { total, passed },
          },
          meta: { ...result.meta, action, plan_id: params.plan_id, fallback: needsRuleFallback(result) },
        };
      }

      if (action === 'pre_review') {
        const rubric = getRubric(params.rubric_id || output.rubric_id);
        let preReview;
        if (needsRuleFallback(result) || !Array.isArray(output.checklist)) {
          preReview = ruleBasedPreReview(params._materials || params.materials || {}, rubric);
        } else {
          preReview = {
            score: Number(output.score) || 0,
            checklist: output.checklist,
          };
        }
        return {
          reply: result.text || `预审得分 ${preReview.score}`,
          output: { action: 'pre_review', score: preReview.score, checklist: preReview.checklist },
          meta: { ...result.meta, action, rubric_id: rubric.name, skill: 'fitness-judge-skill', fallback: !!preReview.fallback },
        };
      }

      const rubric = getRubric(params.rubric_id || output.rubric_id);
      const thresholdJson = params.threshold_json || {};
      let judge;

      if (needsRuleFallback(result)) {
        judge = ruleBasedJudge(params._observations || params.observations || [], rubric, thresholdJson);
      } else {
        judge = parseJudgeOutput(output, result.text, rubric, thresholdJson);
      }

      return {
        reply: result.text || (judge.pass ? '判定通过' : '判定未通过'),
        output: {
          action: 'judge',
          judge,
          pass: judge.pass,
          score: judge.score,
          reasons: judge.reasons,
        },
        meta: {
          ...result.meta,
          action: 'judge',
          rubric_id: rubric.name,
          skill: 'fitness-judge-skill',
          fallback: !!judge.fallback,
        },
      };
    },
  },
};

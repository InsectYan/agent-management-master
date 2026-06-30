/**
 * @file fitness-judge-skill/index.js
 * @description Fitness 语义判定 Agent（react 短步）
 */

'use strict';

const { getRubric, listRubrics } = require('./lib/rubricRegistry');
const {
  ruleBasedJudge,
  ruleBasedPreReview,
  ruleBasedExplain,
} = require('./lib/ruleFallback');

function formatObservations(observations = []) {
  return observations.map((o, i) => [
    `### 子项 #${o.sub_run_index ?? i}`,
    `- HTTP: ${o.http_status ?? '—'}`,
    `- 输入: ${o.input_summary || '—'}`,
    `- 期望提示: ${o.expected_hint || '—'}`,
    `- 响应摘要: ${o.response_excerpt || '—'}`,
    o.journey_summary ? `- Journey: ${JSON.stringify(o.journey_summary)}` : '',
  ].filter(Boolean).join('\n')).join('\n\n');
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

function needsRuleFallback(result) {
  const output = result.output || {};
  const meta = result.meta || {};
  if (meta.stoppedReason === 'no_llm' || output.stoppedReason === 'no_llm') return true;
  if (!result.text && output.score == null && output.pass == null) return true;
  const text = result.text || '';
  return /占位|请配置 LLM|no_llm/i.test(text);
}

module.exports = {
  name: 'fitness-judge-skill',
  version: '1.0.0',
  description: 'Fitness 语义判定 — judge / explain / pre_review',
  scheme: 'react',
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
    react: {
      maxSteps: 2,
      stopWhen: 'llm-done',
      systemPromptFile: 'judge-system.md',
      temperature: 0.2,
      maxTokens: 2048,
      jsonSchemaHint: '{ "continue": boolean, "done": boolean, "pass": boolean, "score": number, "reasons": string[], "summary": string, "checklist": [{ "item", "ok", "note" }] }',
      userContextFields: [ 'action', 'rubric', 'observations_text', 'run_id', 'item_id', 'materials_text' ],
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
        return {
          ...params,
          action,
          run_id: params.run_id,
          item_id: params.item_id,
          observations: params.observations || [],
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

      const rubric = params.rubric || getRubric(params.rubric_id);
      const observations = params.observations || params.materials?.observations || [];
      const observationsText = formatObservations(observations);

      return {
        action: params.action,
        run_id: params.run_id,
        item_id: params.item_id,
        rubric_id: params.rubric_id || rubric.name,
        rubric: {
          name: rubric.name,
          dimensions: rubric.dimensions,
          pass_threshold: rubric.pass_threshold,
          criteria: rubric.prompt,
        },
        observations_text: observationsText,
        materials_text: params.materials ? JSON.stringify(params.materials, null, 2).slice(0, 4000) : '',
        threshold_json: params.threshold_json || params.materials?.threshold_json || {},
        _observations: observations,
        _materials: params.materials,
      };
    },

    async formatResponse(ctx, result) {
      const output = result.output || {};
      const action = output.action || result.meta?.skill_action || 'judge';
      const params = result.meta?.params || {};

      if (action === 'list-rubrics') {
        return {
          reply: '内置 rubric 列表',
          output: { rubrics: output.rubrics || listRubrics() },
          meta: { ...result.meta, action },
        };
      }

      if (action === 'explain') {
        let markdown = output.summary || output.markdown || result.text || '';
        if (!markdown || needsRuleFallback(result)) {
          markdown = ruleBasedExplain(params.run_id || output.run_id, params._observations || params.observations || []);
        }
        return {
          reply: markdown,
          output: { markdown, action: 'explain' },
          meta: { ...result.meta, action, run_id: output.run_id || params.run_id },
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

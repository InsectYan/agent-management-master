/**
 * @file fitness-judge-skill/index.js
 * @description Fitness 语义判定 Agent（react 短步）
 */

'use strict';

const { getRubric, listRubrics } = require('./lib/rubricRegistry');

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

function parseJudgeOutput(output, text, rubric) {
  const passThreshold = rubric.pass_threshold ?? 0.7;
  const score = Number(output.score);
  const pass = output.pass === true
    || (Number.isFinite(score) && score >= passThreshold);
  return {
    pass,
    score: Number.isFinite(score) ? score : (pass ? passThreshold : 0),
    reasons: Array.isArray(output.reasons) ? output.reasons : [ output.summary || text || '' ].filter(Boolean),
  };
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
  config: {
    llmDefaultProfile: 'ollama-qwen',
    actionDefaults: { POST: 'judge' },
    react: {
      maxSteps: 2,
      stopWhen: 'llm-done',
      systemPromptFile: 'judge-system.md',
      temperature: 0.2,
      maxTokens: 2048,
      jsonSchemaHint: '{ "continue": boolean, "done": boolean, "pass": boolean, "score": number, "reasons": string[], "summary": string }',
      userContextFields: [ 'action', 'rubric', 'observations_text', 'run_id', 'item_id' ],
    },
  },
  callbacks: {
    async beforeExecute(ctx, params) {
      const action = params.action || 'judge';

      if (action === 'list-rubrics') {
        return { ...params, action, rubrics: listRubrics() };
      }

      if (action === 'judge' || action === 'pre_review') {
        const rubricId = params.rubric_id || 'consult_quality_v1';
        const observations = params.observations;
        if (!Array.isArray(observations) || !observations.length) {
          const err = new Error(`${action} 缺少 observations[]`);
          err.status = 400;
          throw err;
        }
        return {
          ...params,
          action,
          rubric_id: rubricId,
          rubric: getRubric(rubricId),
          observations,
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
      const observationsText = formatObservations(params.observations || []);

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
        threshold_json: params.threshold_json || {},
      };
    },

    async formatResponse(ctx, result) {
      const output = result.output || {};
      const action = output.action || result.meta?.skill_action || 'judge';

      if (action === 'list-rubrics') {
        return {
          reply: '内置 rubric 列表',
          output: { rubrics: output.rubrics || listRubrics() },
          meta: { ...result.meta, action },
        };
      }

      if (action === 'explain') {
        const markdown = output.summary || result.text || '';
        return {
          reply: markdown,
          output: { markdown, action: 'explain' },
          meta: { ...result.meta, action, run_id: output.run_id },
        };
      }

      const rubric = getRubric(result.meta?.rubric_id || output.rubric_id);
      const judge = parseJudgeOutput(output, result.text, rubric);

      return {
        reply: result.text || (judge.pass ? '判定通过' : '判定未通过'),
        output: {
          action,
          judge,
          pass: judge.pass,
          score: judge.score,
          reasons: judge.reasons,
        },
        meta: {
          ...result.meta,
          action,
          rubric_id: rubric.name,
          skill: 'fitness-judge-skill',
        },
      };
    },
  },
};

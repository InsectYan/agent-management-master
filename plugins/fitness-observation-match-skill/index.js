/**
 * @file fitness-observation-match-skill/index.js
 * @description TPL-API-CTX 内容验证：期望观测 vs 实际响应文案
 */

'use strict';

const {
  ruleBasedObservationMatch,
  parseMatchOutput,
  needsRuleFallback,
  parseLoopStepOutput,
} = require('./lib/ruleFallback');

module.exports = {
  name: 'fitness-observation-match-skill',
  version: '1.1.0',
  description: 'Fitness 观测文案比对 — 多样本共用一条 expected_observation',
  scheme: 'loop',
  routes: [
    {
      path: '/api/skills/fitness-observation-match',
      method: 'POST',
      description: '期望观测 vs 实际响应文案',
      requiresAuth: false,
    },
  ],
  dbTables: [ 'fitness_observation_match_runs' ],
  config: {
    llmDefaultProfile: 'ollama-qwen',
    actionDefaults: { POST: 'match' },
    loop: {
      maxSteps: 2,
      stopWhen: 'llm-done',
      systemPromptFile: 'match-system.md',
      temperature: 0.1,
      maxTokens: 1024,
      jsonSchemaHint: '{ "done": boolean, "pass": boolean, "score": number, "reasons": string[], "summary": string }',
      parseStepOutput: (rawText) => parseLoopStepOutput(rawText),
      stateMerge: { summary: 'replace', reasons: 'replace', pass: 'replace', score: 'replace' },
      initialState: { summary: '', reasons: [] },
      userContextFields: [
        'action',
        'expected_observation',
        'actual_text',
        'input_summary',
      ],
    },
  },
  callbacks: {
    async beforeExecute(ctx, params) {
      const action = params.action || 'match';
      if (action !== 'match') {
        const err = new Error(`不支持的动作: ${action}`);
        err.status = 400;
        throw err;
      }
      const expected = params.expected_observation;
      const actual = params.actual_text;
      if (!expected && !actual) {
        const err = new Error('match 需要 expected_observation 或 actual_text');
        err.status = 400;
        throw err;
      }
      return {
        ...params,
        action,
        expected_observation: expected || '',
        actual_text: actual || '',
        threshold_json: params.threshold_json || {},
      };
    },

    async enrichContext(ctx, params) {
      return {
        action: 'match',
        topic: 'observation_match',
        message: 'observation_match',
        expected_observation: String(params.expected_observation || '').slice(0, 800),
        actual_text: String(params.actual_text || '').slice(0, 4000),
        input_summary: String(params.input_summary || '').slice(0, 400),
        threshold_json: params.threshold_json || {},
        loop_json_schema_hint: '{ "done": true, "pass": boolean, "score": number, "reasons": string[], "summary": string }',
        _expected: params.expected_observation,
        _actual: params.actual_text,
      };
    },

    async formatResponse(ctx, result) {
      const output = result.output || {};
      const params = result.params || result.meta?.params || {};
      const thresholdJson = params.threshold_json || {};
      let match;

      if (needsRuleFallback(result)) {
        match = ruleBasedObservationMatch(
          params._expected || params.expected_observation,
          params._actual || params.actual_text,
          thresholdJson,
        );
      } else {
        match = parseMatchOutput(
          output,
          result.text,
          params._expected || params.expected_observation,
          params._actual || params.actual_text,
          thresholdJson,
        );
        if (match.fallback) {
          match = ruleBasedObservationMatch(
            params._expected || params.expected_observation,
            params._actual || params.actual_text,
            thresholdJson,
          );
        }
      }

      return {
        reply: result.text || (match.pass ? '观测符合期望' : '观测不符合期望'),
        output: {
          action: 'match',
          match,
          pass: match.pass,
          score: match.score,
          reasons: match.reasons,
        },
        meta: {
          ...result.meta,
          action: 'match',
          skill: 'fitness-observation-match-skill',
          fallback: !!match.fallback,
        },
      };
    },
  },
};

/**
 * @file novel-orchestrator-skill/index.js
 * @description 小说开书任务拆分：只出 plan.tasks，不写正文，不 invoke 其他 Skill。
 */

'use strict';

const { parsePlanStep } = require('./lib/parseStep');

module.exports = {
  name: 'novel-orchestrator-skill',
  version: '0.1.0',
  description: '小说开书任务拆分：产出 tasks 计划，不写设定正文',
  scheme: 'loop',
  routes: [
    {
      path: '/api/skills/novel-orchestrator',
      method: 'POST',
      description: 'plan / replan',
      requiresAuth: false,
    },
  ],
  dbTables: [],
  memoryConfig: { enabled: false },
  config: {
    llmDefaultProfile: 'ollama-qwen',
    actionDefaults: { POST: 'plan' },
    loop: {
      maxSteps: 1,
      stopWhen: 'llm-done',
      systemPromptFile: 'loop-system.md',
      temperature: 0.4,
      maxTokens: 4096,
      parseStepOutput: parsePlanStep,
      jsonSchemaHint: [
        '{',
        '  "done": true,',
        '  "continue": false,',
        '  "thinking": "内部推理",',
        '  "reply": "给作者看的计划说明",',
        '  "summary": "与 reply 相同",',
        '  "patch": {',
        '    "tasks": [',
        '      { "id": "t_basic", "path": "plan.basic", "status": "pending", "reason": "…" }',
        '    ]',
        '  }',
        '}',
      ].join('\n'),
      userContextFields: [
        'scene',
        'action',
        'user_message',
        'target_fields',
        'bound_context',
        'coverage',
        'catalog',
        'history',
      ],
      initialState: {
        thinking: '',
        reply: '',
        summary: '',
        target_fields: [],
        patch: {},
        done: false,
      },
      stateMerge: {
        thinking: 'replace',
        reply: 'replace',
        summary: 'replace',
        target_fields: 'replace',
        patch: 'merge-object',
        done: 'replace',
      },
    },
  },
  callbacks: {
    async beforeExecute(ctx, params) {
      const action = params.action || 'plan';
      const message = String(params.user_message || params.message || params.topic || '').trim();
      const coverage = (params.bound_context && params.bound_context.coverage) || params.coverage || {};
      return {
        ...params,
        action,
        coverage,
        topic: message || `novel_${action}`,
        user_message: message,
      };
    },

    async formatResponse(ctx, result) {
      const output = result.output || {};
      const patch = output.patch && typeof output.patch === 'object' ? output.patch : {};
      let reply = output.reply || output.summary || result.text || '';
      if (/^已完成 \d+ 步迭代/.test(reply)) {
        const n = Array.isArray(patch.tasks) ? patch.tasks.length : 0;
        reply = n ? `已拆成 ${n} 步，可执行下一步。` : '没有解析到计划，请再试一次。';
      }
      return {
        reply,
        thinking: output.thinking || '',
        output: {
          thinking: output.thinking || '',
          reply,
          target_fields: Array.isArray(output.target_fields) ? output.target_fields : ['tasks'],
          patch,
        },
        meta: result.meta,
      };
    },
  },
};

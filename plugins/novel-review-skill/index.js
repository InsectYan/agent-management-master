/**
 * @file novel-review-skill/index.js
 * @description 小说设定/章节核检：只出 findings，不写库。
 */

'use strict';

const { parseReviewStep } = require('./lib/parseStep');

module.exports = {
  name: 'novel-review-skill',
  version: '0.1.0',
  description: '小说全流程核检：check_consistency / validate_module / validate_chapter，只出 findings',
  scheme: 'loop',
  routes: [
    {
      path: '/api/skills/novel-review',
      method: 'POST',
      description: 'check_consistency | validate_module | validate_chapter',
      requiresAuth: false,
    },
  ],
  dbTables: [],
  memoryConfig: { enabled: false },
  config: {
    llmDefaultProfile: 'ollama-qwen',
    actionDefaults: { POST: 'check_consistency' },
    loop: {
      maxSteps: 1,
      stopWhen: 'llm-done',
      systemPromptFile: 'loop-system.md',
      temperature: 0.2,
      maxTokens: 4096,
      parseStepOutput: parseReviewStep,
      jsonSchemaHint: [
        '{',
        '  "done": true,',
        '  "continue": false,',
        '  "thinking": "内部推理",',
        '  "reply": "核检摘要",',
        '  "summary": "与 reply 相同",',
        '  "findings": [',
        '    {',
        '      "module": "characters",',
        '      "code": "unknown_character",',
        '      "severity": "error",',
        '      "entity": "玄机老人",',
        '      "message": "正文出现未入库人物",',
        '      "evidence": "原文摘录",',
        '      "suggestion": "补入人物库或改名"',
        '    }',
        '  ]',
        '}',
      ].join('\n'),
      userContextFields: [
        'action',
        'module',
        'chapter_id',
        'bound_context',
        'deterministic_findings',
        'user_message',
      ],
      initialState: {
        thinking: '',
        reply: '',
        summary: '',
        findings: [],
        done: false,
      },
      stateMerge: {
        thinking: 'replace',
        reply: 'replace',
        summary: 'replace',
        findings: 'replace',
        done: 'replace',
      },
    },
  },
  callbacks: {
    async beforeExecute(ctx, params) {
      const action = params.action || 'check_consistency';
      return {
        ...params,
        action,
        topic: `novel_review_${action}`,
        user_message: params.user_message
          || `请按 action=${action} 对照 bound_context 做核检，补充确定性预检未覆盖的语义问题。已有 deterministic_findings 勿重复。`,
      };
    },

    async formatResponse(ctx, result) {
      const output = result.output || {};
      return {
        ok: true,
        action: ctx.params?.action || 'check_consistency',
        reply: output.reply || output.summary || '',
        summary: output.summary || output.reply || '',
        findings: Array.isArray(output.findings) ? output.findings : [],
        thinking: output.thinking || '',
      };
    },
  },
};

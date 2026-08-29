'use strict';

const { parseBrainstormStep } = require('./lib/parseStep');

module.exports = {
  name: 'novel-brainstorm-skill',
  version: '0.1.0',
  description: '小说开书头脑风暴：书名/立意火花，不写 patch',
  scheme: 'loop',
  routes: [
    {
      path: '/api/skills/novel-brainstorm',
      method: 'POST',
      description: '开书头脑风暴',
      requiresAuth: false,
    },
  ],
  dbTables: [],
  memoryConfig: { enabled: false },
  config: {
    llmDefaultProfile: 'ollama-qwen',
    actionDefaults: { POST: 'ideate' },
    loop: {
      maxSteps: 1,
      stopWhen: 'llm-done',
      systemPromptFile: 'loop-system.md',
      temperature: 0.85,
      maxTokens: 4096,
      parseStepOutput: parseBrainstormStep,
      jsonSchemaHint: [
        '{',
        '  "done": true,',
        '  "continue": false,',
        '  "thinking": "内部推理",',
        '  "reply": "给作者看的火花",',
        '  "summary": "与 reply 相同",',
        '  "sparks": ["候选书名或立意"],',
        '  "suggested_fields": ["title"]',
        '}',
      ].join('\n'),
      userContextFields: [
        'scene',
        'focus',
        'user_message',
        'target_fields',
        'bound_context',
        'catalog',
        'history',
      ],
      initialState: {
        thinking: '',
        reply: '',
        summary: '',
        sparks: [],
        suggested_fields: [],
        done: false,
      },
      stateMerge: {
        thinking: 'replace',
        reply: 'replace',
        summary: 'replace',
        sparks: 'concat',
        suggested_fields: 'replace',
        done: 'replace',
      },
    },
  },
  callbacks: {
    async beforeExecute(ctx, params) {
      const message = String(params.user_message || params.message || params.topic || '').trim();
      return {
        ...params,
        action: params.action || 'ideate',
        topic: message || 'novel_ideate',
        user_message: message,
        focus: params.focus || 'auto',
      };
    },

    async formatResponse(ctx, result) {
      const output = result.output || {};
      const sparks = Array.isArray(output.sparks) ? output.sparks : [];
      let reply = output.reply || output.summary || result.text || '';
      if (/^已完成 \d+ 步迭代/.test(reply)) {
        reply = sparks.length
          ? sparks.map((s, i) => `${i + 1}. ${s}`).join('\n')
          : '这一轮没有迸出火花，换个说法再试一次。';
      }
      return {
        reply,
        thinking: output.thinking || '',
        output: {
          thinking: output.thinking || '',
          reply,
          sparks,
          suggested_fields: Array.isArray(output.suggested_fields) ? output.suggested_fields : [],
        },
        meta: result.meta,
      };
    },
  },
};

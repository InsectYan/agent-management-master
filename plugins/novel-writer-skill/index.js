/**
 * @file novel-writer-skill/index.js
 * @description 小说结构化生成（Loop 单步 JSON）：基础信息、世界观、门派、人物、大纲、章节与单章正文。
 */

'use strict';

const { parseWriterStep } = require('./lib/schemaHints');

module.exports = {
  name: 'novel-writer-skill',
  version: '0.1.0',
  description: '小说结构化生成：基础信息、世界观、门派、人物、大纲、章节与单章正文 patch',
  scheme: 'loop',
  routes: [
    {
      path: '/api/skills/novel-writer',
      method: 'POST',
      description: 'fill_basic / fill_world / fill_factions / fill_characters / fill_outline / fill_chapters / fill_chapter_body / rewrite_field',
      requiresAuth: false,
    },
  ],
  dbTables: [],
  memoryConfig: { enabled: false },
  config: {
    llmDefaultProfile: 'ollama-qwen',
    actionDefaults: { POST: 'fill_basic' },
    loop: {
      maxSteps: 1,
      stopWhen: 'llm-done',
      systemPromptFile: 'loop-system.md',
      temperature: 0.6,
      maxTokens: 24576,
      localMaxTokens: 8192,
      llmTimeoutMs: 300000,
      localLlmTimeoutMs: 600000,
      localHistoryLimit: 4,
      localStepHint: [
        '【本地模型】patch.body 控制在 1600～2000 字，必须输出完整可解析 JSON，且一定要带 patch.body。',
        '宁可短于 word_target，也不要只写摘要。接近上限时收束本章并闭合 JSON。禁止 think / <think>。',
      ].join(''),
      stepHint: [
        '【云端模型】patch.body 尽量靠近 bound_context.word_target，可写满目标字数。',
        '必须输出完整 JSON，patch.body 只含当前这一章。',
      ].join(''),
      parseStepOutput: parseWriterStep,
      jsonSchemaHint: [
        '{',
        '  "done": true,',
        '  "continue": false,',
        '  "thinking": "内部推理",',
        '  "reply": "给作者看的说明",',
        '  "summary": "与 reply 相同",',
        '  "target_fields": ["characters"],',
        '  "patch": { "chapters": [{ "title": "章名", "faction": "hero", "outline_ref": "小节标题" }] }',
        '}',
      ].join('\n'),
      userContextFields: [
        'scene',
        'action',
        'user_message',
        'target_fields',
        'bound_context',
        'catalog',
        'history',
        'sparks',
        'brainstorm_reply',
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
      const action = params.action || 'fill_basic';
      const message = String(params.user_message || params.message || params.topic || '').trim();
      return {
        ...params,
        action,
        topic: message || `novel_${action}`,
        user_message: message,
      };
    },

    async formatResponse(ctx, result) {
      const output = result.output || {};
      const patch = output.patch && typeof output.patch === 'object' ? output.patch : {};
      let reply = output.reply || output.summary || result.text || '';
      if (/^已完成 \d+ 步迭代/.test(reply)) {
        const keys = Object.keys(patch);
        reply = keys.length
          ? `已写好 ${keys.join('、')}，可应用到表单。`
          : '没有解析到结构化结果，请再试一次或换个说法。';
      }
      return {
        reply,
        thinking: output.thinking || '',
        output: {
          thinking: output.thinking || '',
          reply,
          target_fields: Array.isArray(output.target_fields) ? output.target_fields : Object.keys(patch),
          patch,
        },
        meta: result.meta,
      };
    },
  },
};

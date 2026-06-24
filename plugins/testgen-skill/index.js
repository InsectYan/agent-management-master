/**
 * @file testgen-skill/index.js
 * @description Loop 方案示例 — 根据文档信息多步迭代生成测试用例。
 *              执行契约见同目录 SKILL.md。
 */

'use strict';

const {
  parseDocument,
  loadDocumentFile,
  normalizeTestCases,
} = require('./lib/docParser');
const store = require('./lib/store');

const SKILL_DIR = __dirname;

module.exports = {
  name: 'testgen-skill',
  version: '1.0.0',
  description: 'Loop 方案 — 根据文档多步生成测试用例',
  scheme: 'loop',
  routes: [
    {
      path: '/api/skills/testgen',
      method: 'POST',
      description: '根据文档生成测试用例',
      requiresAuth: false,
    },
  ],
  dbTables: [ 'testgen_documents', 'testgen_runs' ],
  memoryConfig: {
    enabled: true,
    type: 'vector',
    table: 'testgen_memory',
  },
  config: {
    llmDefaultProfile: 'ollama-qwen',
    actionDefaults: { POST: 'generate' },
    loop: {
      maxSteps: 4,
      stopWhen: 'llm-done',
      systemPromptFile: 'loop-system.md',
      temperature: 0.4,
      maxTokens: 2048,
      docContentMaxLen: 8000,
      listRecordsKey: 'testgen_runs',
      listLabelField: 'doc_title',
      listSummaryField: 'summary',
      listEmptyText: '暂无测试用例生成记录',
      memoryTemplate: '[testgen] {{topic}} — {{summary}}',
      initialState: {
        notes: [],
        summary: '',
        coverage_notes: '',
        testCases: [],
        phase: 'analyze',
      },
      stateMerge: {
        note: 'append',
        summary: 'replace',
        coverage_notes: 'replace',
        testCases: 'concat',
        phase: 'replace',
      },
      jsonSchemaHint: [
        '{ "continue": boolean, "phase": "analyze|functional|edge|review",',
        '"note": string, "summary": string, "coverage_notes": string,',
        '"testCases": [{ "id", "title", "type", "priority", "preconditions", "steps", "expected", "tags" }],',
        '"done": boolean }',
      ].join(' '),
      stepHint: '请根据当前 phase 专注本步任务；functional/edge 阶段务必输出 testCases 数组。',
      userContextFields: [ 'doc_meta', 'endpoints', 'requirements_hint' ],
    },
  },
  callbacks: {
    /**
     * 执行前：解析 doc_content / doc_id / doc_path
     * @param {import('egg').Context} ctx
     * @param {Object} params
     */
    async beforeExecute(ctx, params) {
      const action = params.action || 'generate';

      if (action === 'list' || action === 'get') {
        return { ...params, action };
      }

      if (action === 'register-doc') {
        const content = params.doc_content || params.content || '';
        if (!content.trim()) {
          const err = new Error('register-doc 缺少 doc_content');
          err.status = 400;
          throw err;
        }
        return {
          ...params,
          action,
          doc_content: String(content),
          doc_title: String(params.doc_title || params.title || '未命名文档'),
        };
      }

      let docContent = params.doc_content || params.content || '';
      let docTitle = params.doc_title || params.title || '';
      let docId = params.doc_id ? Number(params.doc_id) : null;

      if (!docContent && params.doc_path) {
        const loaded = loadDocumentFile(SKILL_DIR, params.doc_path);
        docContent = loaded.content;
      }

      if (!docContent && docId) {
        const doc = await store.getDocument(ctx, docId);
        if (!doc) {
          const err = new Error(`文档不存在: doc_id=${docId}`);
          err.status = 404;
          throw err;
        }
        docContent = doc.content;
        docTitle = docTitle || doc.title;
      }

      if (!docContent.trim() && action === 'generate') {
        const err = new Error('generate 需提供 doc_content、doc_id 或 doc_path');
        err.status = 400;
        throw err;
      }

      const parsed = parseDocument(docContent, { title: docTitle });
      return {
        ...params,
        action: 'generate',
        doc_id: docId,
        doc_content: docContent,
        topic: parsed.title,
        doc_title: parsed.title,
        doc_meta: parsed,
      };
    },

    /**
     * 拼 Loop 执行输入
     * @param {import('egg').Context} ctx
     * @param {Object} params
     */
    async enrichContext(ctx, params) {
      if (params.action === 'list') {
        const testgen_runs = await store.listRuns(ctx, 15);
        return { action: 'list', testgen_runs };
      }

      if (params.action === 'get') {
        const runId = Number(params.run_id);
        const run = await store.getRun(ctx, runId);
        if (!run) {
          const err = new Error(`生成记录不存在: run_id=${runId}`);
          err.status = 404;
          throw err;
        }
        return { action: 'get', run };
      }

      if (params.action === 'register-doc') {
        return {
          action: 'register-doc',
          topic: params.doc_title,
          doc_title: params.doc_title,
          doc_content: params.doc_content,
          doc_type: params.doc_type || 'markdown',
          source: params.source || 'api',
          tags: params.tags || [],
        };
      }

      const meta = params.doc_meta || {};
      return {
        action: 'generate',
        topic: params.topic || params.doc_title,
        doc_content: params.doc_content,
        doc_id: params.doc_id,
        doc_meta: {
          title: meta.title,
          sectionCount: meta.sectionCount,
          endpoints: meta.endpoints,
          requirements: meta.requirements,
        },
        endpoints: (meta.endpoints || []).join('\n'),
        requirements_hint: (meta.requirements || [])
          .map(r => `- ${r.section}: ${r.excerpt?.slice(0, 120)}`)
          .join('\n'),
      };
    },

    /**
     * 落库：生成结果 / 注册文档
     * @param {import('egg').Context} ctx
     * @param {Object} payload
     */
    async persistResult(ctx, payload) {
      const action = payload.params?.action;

      if (action === 'list' || action === 'get') {
        return { persisted: false, reason: '只读动作' };
      }

      if (action === 'register-doc') {
        const output = payload.output || {};
        const info = await store.insertDocument(ctx, {
          title: output.doc_title || payload.params?.doc_title || '',
          doc_type: output.doc_type || 'markdown',
          content: output.doc_content || payload.params?.doc_content || '',
          source: output.source || 'api',
          tags: output.tags || [],
        });
        return {
          persisted: true,
          doc_id: Number(info.lastInsertRowid),
        };
      }

      const output = payload.output || {};
      const testCases = normalizeTestCases(output.testCases);

      const info = await store.insertRun(ctx, {
        doc_id: payload.params?.doc_id ?? null,
        doc_title: output.topic || payload.params?.doc_title || '',
        summary: output.summary || payload.text || '',
        test_cases: testCases,
        steps_count: output.steps?.length || 0,
        stopped_reason: output.stoppedReason || '',
        coverage_notes: output.coverage_notes || '',
        llm_profile_id: payload.llm?.profileIdUsed || payload.llm?.profileId || '',
      });

      return {
        persisted: true,
        run_id: Number(info.lastInsertRowid),
        test_case_count: testCases.length,
      };
    },

    /**
     * 格式化 HTTP 响应
     * @param {import('egg').Context} ctx
     * @param {Object} result
     */
    async formatResponse(ctx, result) {
      const output = result.output || {};
      const action = output.action || result.meta?.skill_action;

      if (action === 'get') {
        return {
          reply: result.text,
          output: {
            run_id: output.run_id,
            doc_title: output.doc_title,
            summary: output.summary,
            test_cases: output.test_cases,
            coverage_notes: output.coverage_notes,
            created_at: output.created_at,
          },
          meta: { ...result.meta, action: 'get', persisted: false },
        };
      }

      if (action === 'register-doc') {
        return {
          reply: result.text?.replace('待注册', '已注册') || `文档已注册：${output.doc_title}`,
          output: {
            doc_id: result.meta?.doc_id,
            doc_title: output.doc_title,
            action: 'register-doc',
          },
          meta: { ...result.meta, action: 'register-doc' },
        };
      }

      const testCases = normalizeTestCases(output.testCases);
      return {
        reply: result.text,
        output: {
          ...output,
          testCases,
          test_case_count: testCases.length,
        },
        meta: result.meta,
      };
    },
  },
};

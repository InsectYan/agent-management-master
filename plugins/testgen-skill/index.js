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
const {
  parseTestgenStepOutput,
  buildStepDirective,
  STEP_PHASES,
  salvageTestCasesArray,
} = require('./lib/loopStepParser');
const store = require('./lib/store');
const bffClient = require('./lib/bffClient');
const { createInteractionLog } = require('./lib/interactionLog');
const { buildQuotaPlan, formatQuotaPrompt } = require('./lib/testTypeQuota');
const { validateTestCaseDraft } = require('./lib/draftValidator');

const SKILL_DIR = __dirname;

/** @type {Map<string, ReturnType<typeof createInteractionLog>>} */
const activeLogs = new Map();

function attachInteractionHooks(ctx, params) {
  const jobId = params.job_id;
  if (!jobId || params.action === 'list' || params.action === 'get') {
    return params;
  }

  try {
    const logKey = String(jobId);
    const log = createInteractionLog({
      jobId,
      ctx,
      pushContext: bffClient.pushAgentContext,
    });
    activeLogs.set(logKey, log);

    ctx.state = ctx.state || {};
    ctx.state.schemeHooks = {
      onStatus: payload => log.handleStatus(payload),
    };
    ctx.state._testgenInteractionLogKey = logKey;
  } catch (err) {
    ctx.app?.logger?.warn('[testgen-skill] interaction log disabled: %s', err.message);
  }

  return params;
}

function takeInteractionLog(jobId) {
  const key = String(jobId);
  const log = activeLogs.get(key);
  if (log) activeLogs.delete(key);
  return log;
}

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
    testgenBff: {
      baseUrl: process.env.TESTGEN_BFF_URL || 'http://127.0.0.1:5202',
      internalToken: process.env.TESTGEN_INTERNAL_TOKEN || '',
    },
    actionDefaults: { POST: 'generate' },
    loop: {
      maxSteps: 4,
      stopWhen: 'llm-done',
      systemPromptFile: 'loop-system.md',
      temperature: 0.4,
      maxTokens: 4096,
      docContentMaxLen: 8000,
      stepPhases: STEP_PHASES,
      enforcePhaseByStep: true,
      blockDoneWithoutCases: true,
      parseStepOutput: parseTestgenStepOutput,
      buildStepDirective,
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
      stepHint: 'functional/edge 步必须输出 testCases 数组；仅 review 最后一步可 done=true。',
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
        return attachInteractionHooks(ctx, {
          ...params,
          action,
          doc_content: String(content),
          doc_title: String(params.doc_title || params.title || '未命名文档'),
        });
      }

      if (action === 'enrich_samples') {
        const items = Array.isArray(params.test_cases)
          ? params.test_cases.map(tc => ({
            input_data: {
              runner: 'http',
              path: tc.steps?.[0] || tc.path || '/',
              method: tc.method || 'POST',
              body: tc.body || tc.input,
            },
            expected_data: { expected: tc.expected },
            metadata: { source: 'testgen-skill', case_id: tc.id },
          }))
          : [];
        const bulk = await bffClient.bulkCreateSamples(ctx, params.sample_set_id, items);
        return { ...params, action, bulk_result: bulk };
      }

      if (action === 'validate_draft') {
        const testCases = params.test_cases || params.draft?.test_cases || params.draft?.testCases || [];
        const validation = validateTestCaseDraft(testCases);
        if (!validation.valid) {
          return { ...params, action, validation };
        }
        let dryRunResult = null;
        if (params.item_id) {
          dryRunResult = await bffClient.dryRunFitness(ctx, params.item_id, {
            scheme_id: params.scheme_id,
            dry_run: true,
            test_cases: testCases,
          });
        }
        return { ...params, action, validation, dry_run_result: dryRunResult };
      }

      if (action === 'sync_to_item') {
        const patch = await bffClient.patchFitnessItem(ctx, params.item_id, {
          expected_observation: params.expected_observation,
          execution_note: params.execution_note,
        });
        return { ...params, action, patch_result: patch };
      }

      let docContent = params.doc_content || params.content || '';
      let docTitle = params.doc_title || params.title || '';
      let docId = params.doc_id ? Number(params.doc_id) : null;

      if (!docContent && params.doc_path) {
        const loaded = loadDocumentFile(SKILL_DIR, params.doc_path);
        docContent = loaded.content;
      }

      if (!docContent && docId) {
        let doc = await store.getDocument(ctx, docId);
        if (!doc) {
          doc = await bffClient.fetchDocument(ctx, docId);
        }
        if (!doc) {
          const err = new Error(`文档不存在: doc_id=${docId}`);
          err.status = 404;
          throw err;
        }
        docContent = doc.content;
        docTitle = docTitle || doc.title;
      }

      if (!docContent.trim() && (action === 'generate' || action === 'generate_for_fitness')) {
        const err = new Error('generate 需提供 doc_content、doc_id 或 doc_path');
        err.status = 400;
        throw err;
      }

      const parsed = parseDocument(docContent, { title: docTitle });
      const resolvedAction = action === 'generate_for_fitness' ? 'generate_for_fitness' : 'generate';
      return attachInteractionHooks(ctx, {
        ...params,
        action: resolvedAction,
        doc_id: docId,
        doc_content: docContent,
        topic: parsed.title,
        doc_title: parsed.title,
        doc_meta: parsed,
      });
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

      if (params.action === 'validate_draft') {
        return {
          action: 'validate_draft',
          validation: params.validation,
          dry_run_result: params.dry_run_result,
          _skipMemory: true,
        };
      }

      if ([ 'enrich_samples', 'sync_to_item' ].includes(params.action)) {
        return { action: params.action, ...params };
      }

      const meta = params.doc_meta || {};
      const typeCounts = params.options?.type_counts || params.type_counts || {};
      const quotaPlan = buildQuotaPlan(params.test_types, typeCounts);
      const quotaPrompt = formatQuotaPrompt(quotaPlan);

      let knowledgeHint = '';
      if (params.module) {
        const entries = await bffClient.fetchKnowledge(ctx, { module: params.module });
        if (entries.length) {
          knowledgeHint = entries
            .slice(0, 8)
            .map(e => `- [${e.tag || e.module}] ${e.title || ''}: ${String(e.content || '').slice(0, 100)}`)
            .join('\n');
        }
      }

      let fitnessHint = '';
      if (params.action === 'generate_for_fitness' || params.fitness_context?.scheme_id || params.scheme_id) {
        const schemeId = params.scheme_id || params.fitness_context?.scheme_id;
        const suggestions = await bffClient.fetchFitnessItemSuggestions(ctx, {
          module: params.module,
          scheme_id: schemeId,
          limit: 8,
        });
        if (suggestions.length) {
          fitnessHint = suggestions.map(s =>
            `- ${s.item_id}: ${s.title} [${s.scheme_primary_id}] example=${String(s.test_input_example || '').slice(0, 80)}`,
          ).join('\n');
        }
      }

      return {
        action: params.action === 'generate_for_fitness' ? 'generate_for_fitness' : 'generate',
        topic: params.topic || params.doc_title,
        doc_content: params.doc_content,
        doc_id: params.doc_id,
        module: params.module,
        test_types: params.test_types,
        options: params.options,
        doc_meta: {
          title: meta.title,
          sectionCount: meta.sectionCount,
          endpoints: meta.endpoints,
          requirements: meta.requirements,
        },
        endpoints: (meta.endpoints || []).join('\n'),
        requirements_hint: [
          quotaPrompt,
          (meta.requirements || [])
            .map(r => `- ${r.section}: ${r.excerpt?.slice(0, 120)}`)
            .join('\n'),
          knowledgeHint ? `\n## 知识库\n${knowledgeHint}` : '',
          fitnessHint ? `\n## Fitness 测试项参考\n${fitnessHint}\n方案: ${params.scheme_id || params.fitness_context?.scheme_id || '—'}` : '',
          params.options?.hint ? `\n## 补充说明\n${params.options.hint}` : '',
        ].filter(Boolean).join('\n'),
        test_type_quotas: quotaPlan,
        _skipMemory: true,
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

      const jobId = payload.params?.job_id;
      const log = jobId ? takeInteractionLog(jobId) : null;
      if (log) {
        try {
          log.finalize({
            run_id: Number(info.lastInsertRowid),
            steps_count: output.steps?.length || 0,
            stopped_reason: output.stoppedReason || '',
            model: payload.llm?.model || payload.meta?.model || '',
            llm_profile_id: payload.llm?.profileIdUsed || payload.llm?.profileId || '',
          });
        } catch (err) {
          ctx.app?.logger?.warn('[testgen-skill] interaction log finalize failed: %s', err.message);
        }
      }

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

      if (action === 'validate_draft') {
        const validation = output.validation || result.meta?.validation || {};
        return {
          reply: validation.valid ? '草案结构校验通过' : `草案校验失败: ${(validation.errors || []).join('; ')}`,
          output: {
            action: 'validate_draft',
            valid: validation.valid,
            errors: validation.errors || [],
            warnings: validation.warnings || [],
            dry_run_result: output.dry_run_result || result.meta?.dry_run_result,
          },
          meta: { ...result.meta, action, persisted: false },
        };
      }

      if ([ 'enrich_samples', 'sync_to_item' ].includes(action)) {
        return {
          reply: result.text || `动作 ${action} 完成`,
          output: { action, ...output, ...result.meta },
          meta: { ...result.meta, action },
        };
      }

      let testCases = normalizeTestCases(output.testCases);
      if (!testCases.length && Array.isArray(output.steps)) {
        const salvaged = [];
        for (const step of output.steps) {
          salvaged.push(...salvageTestCasesArray(step.rawText || step.partialOutput || ''));
        }
        if (salvaged.length) {
          testCases = normalizeTestCases(salvaged);
        }
      }
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

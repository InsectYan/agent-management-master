'use strict';

const { parseDocument, loadDocumentFile } = require('../testgen-skill/lib/docParser');
const {
  parseApiTemplateStepOutput,
  buildStepDirective,
  STEP_PHASES,
} = require('./lib/loopStepParser');
const { normalizeTemplates } = require('./lib/templateValidator');
const bffClient = require('./lib/bffClient');

const SKILL_DIR = __dirname;

module.exports = {
  name: 'api-template-skill',
  version: '1.0.0',
  description: 'Loop 方案 — 根据接口文档多步生成 HTTP 请求模板',
  scheme: 'loop',
  routes: [
    {
      path: '/api/skills/api-template',
      method: 'POST',
      description: '根据文档生成接口模板',
      requiresAuth: false,
    },
  ],
  dbTables: [ 'api_template_runs' ],
  memoryConfig: { enabled: false },
  config: {
    llmDefaultProfile: 'ollama-qwen',
    testgenBff: {
      baseUrl: process.env.TESTGEN_BFF_URL || 'http://127.0.0.1:5202',
      internalToken: process.env.TESTGEN_INTERNAL_TOKEN || '',
    },
    actionDefaults: { POST: 'generate' },
    loop: {
      maxSteps: 3,
      stopWhen: 'llm-done',
      systemPromptFile: 'loop-system.md',
      temperature: 0.3,
      maxTokens: 4096,
      docContentMaxLen: 8000,
      stepPhases: STEP_PHASES,
      enforcePhaseByStep: true,
      blockDoneWithoutCases: true,
      parseStepOutput: parseApiTemplateStepOutput,
      buildStepDirective,
      listRecordsKey: 'api_template_runs',
      listLabelField: 'doc_title',
      listSummaryField: 'summary',
      listEmptyText: '暂无接口模板生成记录',
      initialState: {
        notes: [],
        summary: '',
        apiTemplates: [],
        phase: 'analyze',
      },
      stateMerge: {
        note: 'append',
        summary: 'replace',
        apiTemplates: 'concat',
        phase: 'replace',
      },
      jsonSchemaHint: [
        '{ "continue": boolean, "phase": "analyze|generate|review",',
        '"note": string, "summary": string,',
        '"apiTemplates": [{ "template_code", "name", "description", "http_method", "url_path",',
        '"headers_json", "query_json", "body_template", "inject_schema" }], "done": boolean }',
      ].join(' '),
      stepHint: 'generate/review 步必须输出 apiTemplates 数组；仅 review 最后一步可 done=true。',
      userContextFields: [ 'doc_meta', 'endpoints', 'requirements_hint', 'hint', 'project_code' ],
      casesArrayKey: 'apiTemplates',
    },
  },
  callbacks: {
    async beforeExecute(ctx, params) {
      const action = params.action || 'generate';
      if (action === 'list' || action === 'get') {
        return { ...params, action };
      }

      let docContent = params.doc_content || params.document_content || params.content || '';
      let docTitle = params.doc_title || params.title || params.document_title || '';

      if (!docContent && params.doc_path) {
        const loaded = loadDocumentFile(SKILL_DIR, params.doc_path);
        docContent = loaded.content;
      }

      if (!docContent.trim()) {
        const err = new Error('generate 需提供 doc_content、document_content 或 doc_path');
        err.status = 400;
        throw err;
      }

      const parsed = parseDocument(docContent, { title: docTitle });
      return {
        ...params,
        action: 'generate',
        doc_content: docContent,
        topic: parsed.title,
        doc_title: parsed.title,
        doc_meta: parsed,
      };
    },

    async enrichContext(ctx, params) {
      if (params.action === 'list') {
        const rows = await ctx.service.dbManager.listApiTemplateRuns?.(15)
          || await ctx.service.dbManager.listRecords?.('api_template_runs', 15)
          || [];
        return { action: 'list', api_template_runs: rows };
      }

      if (params.action === 'get') {
        const runId = Number(params.run_id);
        const run = await ctx.service.dbManager.getApiTemplateRun?.(runId);
        if (!run) {
          const err = new Error(`生成记录不存在: run_id=${runId}`);
          err.status = 404;
          throw err;
        }
        return { action: 'get', run };
      }

      const meta = params.doc_meta || {};
      const outputFormat = [
        '## ft_api_template 输出格式',
        '每条 apiTemplates 须含：template_code(kebab-case)、name、http_method、url_path',
        '可选：description、headers_json、query_json、body_template、inject_schema',
        'inject_schema: [{ key, label, location: body|header|query|path, json_path }]',
        'project_code 由平台入库时写入，Agent 可不输出',
      ].join('\n');

      return {
        action: 'generate',
        topic: params.topic || params.doc_title,
        doc_content: params.doc_content,
        project_code: params.project_code || '',
        hint: params.hint || params.options?.hint || '',
        job_id: params.job_id,
        doc_meta: {
          title: meta.title,
          sectionCount: meta.sectionCount,
          endpoints: meta.endpoints,
        },
        endpoints: (meta.endpoints || []).join('\n'),
        requirements_hint: [
          outputFormat,
          meta.endpoints?.length ? `\n## 识别到的端点\n${meta.endpoints.join('\n')}` : '',
          params.hint ? `\n## 用户备注\n${params.hint}` : '',
          params.options?.hint ? `\n## 补充说明\n${params.options.hint}` : '',
        ].filter(Boolean).join('\n'),
        _skipMemory: true,
      };
    },

    async persistResult(ctx, payload) {
      const action = payload.params?.action;
      if (action === 'list' || action === 'get') {
        return { persisted: false, reason: '只读动作' };
      }

      const output = payload.output || {};
      const projectCode = payload.params?.project_code || '';
      const templates = normalizeTemplates(output.apiTemplates || [], projectCode);

      try {
        await ctx.service.dbManager.insertApiTemplateRun?.({
          doc_title: payload.params?.doc_title || '',
          project_code: projectCode,
          summary: output.summary || payload.text || '',
          templates_count: templates.length,
          steps_count: output.steps?.length || 0,
          stopped_reason: output.stoppedReason || '',
          llm_profile_id: payload.llm?.profileIdUsed || payload.llm?.profileId || '',
        });
      } catch {
        // db optional
      }

      return { persisted: true, templates_count: templates.length };
    },

    async formatResponse(ctx, result) {
      const params = ctx.params || ctx.state?.invokeParams || {};
      const projectCode = params.project_code || '';
      const output = result.output || {};
      const templates = normalizeTemplates(output.apiTemplates || [], projectCode);

      if (params.job_id) {
        try {
          await bffClient.pushAgentContext(ctx, params.job_id, {
            current_direction: output.summary || result.text?.slice(0, 200) || 'Agent 执行中…',
            current_phase: output.phase || 'generate',
            generated_templates: templates,
            overall_percent: output.done ? 95 : 50,
            updated_at: new Date().toISOString(),
          });
        } catch (err) {
          ctx.app?.logger?.warn('[api-template-skill] push context failed: %s', err.message);
        }
      }

      return {
        ...result,
        output: {
          ...output,
          apiTemplates: templates,
          templates_count: templates.length,
        },
      };
    },
  },
};

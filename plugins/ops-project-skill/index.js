/**
 * @file ops-project-skill/index.js
 * @description 按 source_path 扫描项目并生成 ops-project/v1 配置。
 *              持续优化请只改本目录，见 SKILL.md。
 */

'use strict';

const { scanProject } = require('./lib/projectScanner');
const {
  assembleDocument,
  mergeHintIntoDocument,
  isValidDocument,
} = require('./lib/configAssembler');
const { assembleAgentDocument } = require('./lib/agentAssembler');
const { bindFlowKeys } = require('./lib/flowBinding');
const { applyFlowRisks } = require('./lib/flowRisks');

function pickDocument(result, draft) {
  const output = result.output || {};
  const fromOutput = output.document || output.config || output.project;
  if (isValidDocument(fromOutput)) return { document: fromOutput, source: 'llm' };
  if (isValidDocument(output) && Array.isArray(output.flows)) {
    return { document: output, source: 'llm' };
  }
  return { document: draft, source: result.meta?.stoppedReason === 'no_llm' ? 'rule_fallback' : 'rule_fallback' };
}

function summarize(document, scan) {
  const flows = document.flows || [];
  const riskCount = Object.keys(document.extra_json?.risks || {}).length;
  return [
    `目录节点 ${scan.node_count || 0}`,
    `路由 ${document.routes?.length || 0}`,
    `流程 ${flows.length}（含总览）`,
    `风险/警告 ${riskCount}`,
  ].join(' · ');
}

module.exports = {
  name: 'ops-project-skill',
  version: '1.5.0',
  description: '运维项目配置生成：Agent 画全 message_type 与红橙风险；总览画全链路；目录路由点对点绑定',
  scheme: 'loop',
  routes: [
    {
      path: '/api/skills/ops-project',
      method: 'POST',
      description: '扫描项目路径并生成 ops-project/v1',
      requiresAuth: false,
    },
  ],
  config: {
    llmDefaultProfile: 'ollama-qwen',
    actionDefaults: { POST: 'generate' },
    loop: {
      maxSteps: 1,
      stopWhen: 'llm-done',
      systemPromptFile: 'loop-system.md',
      temperature: 0.2,
      maxTokens: 16384,
      jsonSchemaHint: '{ "done": true, "summary": string, "document": { schema, name, type, source_path, directory_tree, routes, flows, extra_json } }',
      userContextFields: [ 'scan_summary', 'hint', 'basic', 'draft_preview' ],
    },
  },
  callbacks: {
    async beforeExecute(ctx, params) {
      const action = params.action || 'generate';
      if (![ 'generate', 'regenerate' ].includes(action)) {
        const err = new Error(`不支持的动作: ${action}`);
        err.status = 400;
        throw err;
      }
      const sourcePath = String(params.source_path || params.project_path || '').trim();
      if (!sourcePath) {
        const err = new Error('缺少 source_path（基础信息中的项目路径）');
        err.status = 400;
        throw err;
      }
      return { ...params, action, source_path: sourcePath };
    },

    async enrichContext(ctx, params) {
      const scan = scanProject(params.source_path);
      const basic = {
        name: params.name || '',
        type: params.type || params.project_type || scan.guessed_type,
        description: params.description || '',
        repo_url: params.repo_url || '',
        status: params.status || 'draft',
      };
      const draft = assembleDocument({ scan, basic, hint: params.hint });
      mergeHintIntoDocument(draft, params.hint);
      params._scan = scan;
      params._draft = draft;
      if (ctx.state) {
        ctx.state.opsProjectScan = scan;
        ctx.state.opsProjectDraft = draft;
      }
      return {
        action: params.action,
        source_path: scan.source_path,
        hint: params.hint || '',
        basic,
        scan_summary: JSON.stringify({
          source_path: scan.source_path,
          guessed_type: scan.guessed_type,
          file_count: scan.file_count,
          node_count: scan.node_count,
          route_count: scan.routes.length,
          router_files: scan.router_files,
        }),
        draft_preview: JSON.stringify({
          name: draft.name,
          type: draft.type,
          route_bindings: draft.routes.slice(0, 40).map(item => ({
            path: item.path,
            flow_key: item.flow_key,
          })),
          flow_keys: draft.flows.map(item => item.key),
          binding_rule: '每个路由/页面目录只绑一条 flow_key；风险/警告必须是图上的红橙节点，禁止只写在 description',
        }),
      };
    },

    async formatResponse(ctx, result) {
      const params = result.params || ctx.request?.body || {};
      const draft = params._draft || ctx.state?.opsProjectDraft;
      const scan = params._scan || ctx.state?.opsProjectScan;
      let document = draft;
      let source = 'rule_fallback';
      if (draft) {
        const picked = pickDocument(result, draft);
        document = picked.document;
        source = picked.source;
        if (!document.source_path && scan?.source_path) {
          document.source_path = scan.source_path;
        }
        if (scan?.agent?.is_agent || document.type === 'agent') {
          const detailed = assembleAgentDocument({
            scan,
            basic: {
              name: document.name || params.name,
              type: 'agent',
              description: document.description || params.description,
              repo_url: document.repo_url || params.repo_url,
              status: document.status || params.status,
            },
            hint: params.hint,
          });
          detailed.name = document.name || detailed.name;
          detailed.description = document.description || detailed.description;
          document = detailed;
        } else {
          document = bindFlowKeys(document);
          document = applyFlowRisks(document, scan);
        }
      } else {
        const scanNow = scanProject(params.source_path);
        document = assembleDocument({
          scan: scanNow,
          basic: params,
          hint: params.hint,
        });
      }
      const usedScan = scan || { node_count: 0, file_count: 0 };
      return {
        ...result,
        output: {
          document,
          summary: (result.output && result.output.summary) || summarize(document, usedScan),
          source,
          scan: {
            source_path: document.source_path,
            file_count: usedScan.file_count,
            node_count: usedScan.node_count,
            route_count: document.routes?.length || 0,
            flow_count: document.flows?.length || 0,
          },
        },
      };
    },
  },
};

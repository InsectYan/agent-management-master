/**
 * @file bffClient.js
 * @description 从 testgen-sub 业务 BFF 拉取文档与知识库（供 enrichContext 使用）
 */

'use strict';

function resolveBaseUrl(ctx) {
  const fromEnv = process.env.TESTGEN_BFF_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const skillConfig = ctx.app?.config?.plugins?.['testgen-skill']?.testgenBff;
  if (skillConfig?.baseUrl) return skillConfig.baseUrl.replace(/\/$/, '');
  return 'http://127.0.0.1:5202';
}

function buildHeaders(ctx) {
  const token = process.env.TESTGEN_INTERNAL_TOKEN
    || ctx.app?.config?.plugins?.['testgen-skill']?.testgenBff?.internalToken
    || '';
  const headers = { Accept: 'application/json' };
  if (token) headers['X-Internal-Token'] = token;
  return headers;
}

/**
 * @param {import('egg').Context} ctx
 * @param {number} docId
 */
async function fetchDocument(ctx, docId) {
  const baseUrl = resolveBaseUrl(ctx);
  const res = await ctx.curl(`${baseUrl}/api/documents/${docId}`, {
    method: 'GET',
    dataType: 'json',
    headers: buildHeaders(ctx),
    timeout: 15000,
  });

  if (res.status !== 200 || !res.data?.data) {
    return null;
  }
  const doc = res.data.data;
  return {
    id: doc.id,
    title: doc.title,
    content: doc.content || '',
    doc_type: doc.doc_type,
    parsed_meta: doc.parsed_meta || {},
  };
}

/**
 * @param {import('egg').Context} ctx
 * @param {{ module?: string, tag?: string }} query
 */
async function fetchKnowledge(ctx, query = {}) {
  const baseUrl = resolveBaseUrl(ctx);
  const qs = new URLSearchParams();
  if (query.module) qs.set('module', query.module);
  if (query.tag) qs.set('tag', query.tag);
  const url = `${baseUrl}/api/tools/knowledge${qs.toString() ? `?${qs}` : ''}`;
  const res = await ctx.curl(url, {
    method: 'GET',
    dataType: 'json',
    headers: buildHeaders(ctx),
    timeout: 10000,
  });

  if (res.status !== 200) return [];
  return res.data?.data?.list || res.data?.data || [];
}

/**
 * 推送 Agent 执行上下文到 testgen BFF（供前端进度页展示）
 * @param {import('egg').Context} ctx
 * @param {number} jobId
 * @param {Object} agentContext
 */
async function pushAgentContext(ctx, jobId, agentContext) {
  if (!jobId) return;
  const baseUrl = resolveBaseUrl(ctx);
  await ctx.curl(`${baseUrl}/api/internal/generation-jobs/${jobId}/agent-context`, {
    method: 'POST',
    contentType: 'json',
    data: agentContext,
    dataType: 'json',
    headers: buildHeaders(ctx),
    timeout: 8000,
  });
}

module.exports = {
  fetchDocument,
  fetchKnowledge,
  pushAgentContext,
  resolveBaseUrl,
};

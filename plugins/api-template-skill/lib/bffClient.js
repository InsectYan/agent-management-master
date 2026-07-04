'use strict';

function resolveBaseUrl(ctx) {
  const fromEnv = process.env.TESTGEN_BFF_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const skillConfig = ctx.app?.config?.plugins?.['api-template-skill']?.testgenBff;
  if (skillConfig?.baseUrl) return skillConfig.baseUrl.replace(/\/$/, '');
  return 'http://127.0.0.1:5202';
}

function buildHeaders(ctx) {
  const token = process.env.TESTGEN_INTERNAL_TOKEN
    || ctx.app?.config?.plugins?.['api-template-skill']?.testgenBff?.internalToken
    || '';
  const headers = { Accept: 'application/json' };
  if (token) headers['X-Internal-Token'] = token;
  return headers;
}

async function pushAgentContext(ctx, jobId, agentContext) {
  if (!jobId) return;
  const baseUrl = resolveBaseUrl(ctx);
  await ctx.curl(`${baseUrl}/api/internal/api-template-jobs/${jobId}/agent-context`, {
    method: 'POST',
    contentType: 'json',
    data: agentContext,
    dataType: 'json',
    headers: buildHeaders(ctx),
    timeout: 8000,
  });
}

module.exports = {
  pushAgentContext,
  resolveBaseUrl,
};

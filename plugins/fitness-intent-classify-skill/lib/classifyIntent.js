'use strict';

/**
 * 意图与字段角色分类（规则主路径）
 */
function classifyIntentRule(params = {}) {
  const item = params.item || {};
  const configJson = params.config_json || {};
  const texts = [
    item.expected_observation,
    item.assertion_points,
    item.assertion_text,
    item.detail_summary,
    JSON.stringify(configJson.assertions || []),
  ].filter(Boolean).map(String).join('\n');

  const statusFromConfig = configJson.http_status_expected ?? item.http_status_expected;
  const statusMatch = texts.match(/(?:期望|断言[:：]?|status\s*[=:：]|HTTP\s+)\s*(\d{3})/i)
    || texts.match(/\b(401|400|403|404|429|200|201|202)\b/);
  const expectedStatus = statusFromConfig != null
    ? Number(statusFromConfig)
    : (statusMatch ? Number(statusMatch[1]) : 200);

  let kind = 'positive';
  const omit_fields = [];
  const corrupt_headers = [];

  if (expectedStatus === 401 || /AUTH_UNAUTHORIZED|未授权|unauthorized/i.test(texts)) {
    kind = 'unauth_401';
    corrupt_headers.push('Authorization');
  } else if (
    expectedStatus === 400
    || /PARAMS_REQUIRED|TURN_PARAMS_REQUIRED|缺少\s*\w+|missing\s+(field|param)/i.test(texts)
  ) {
    kind = 'omit_field_400';
    const miss = texts.match(/缺少\s*[`「"]?([a-zA-Z_][\w.]*)[`」"]?/);
    const miss2 = texts.match(/missing\s+(?:field|param)?\s*[`「"]?([a-zA-Z_][\w.]*)/i);
    const field = (miss && miss[1]) || (miss2 && miss2[1]);
    if (field) omit_fields.push(field.includes('.') ? field : `body.${field}`);
    else if (/message/i.test(texts)) omit_fields.push('body.message');
    else if (/session_id/i.test(texts)) omit_fields.push('body.session_id');
    else omit_fields.push('body.message');
  } else if (expectedStatus >= 400 && expectedStatus < 500) {
    kind = 'business_4xx';
  }

  /** @type {object[]} */
  const fields = [];

  const path = configJson.endpoint_path || item.endpoint_path || '';
  if (path) {
    fields.push({ name: 'endpoint_path', location: 'config', role: 'fixed', required: true });
  } else {
    fields.push({ name: 'endpoint_path', location: 'config', role: 'fixed', required: true });
  }
  fields.push({ name: 'http_method', location: 'config', role: 'fixed', required: true });
  fields.push({
    name: 'http_status_expected',
    location: 'config',
    role: 'fixed',
    required: true,
    expect: expectedStatus,
  });

  if (kind === 'unauth_401') {
    fields.push({
      name: 'Authorization',
      location: 'headers',
      role: 'corrupt_on_purpose',
      required: true,
    });
  } else if (needsAuthHeader(path, methodFromItem(item, configJson), texts, kind)) {
    fields.push({
      name: 'Authorization',
      location: 'headers',
      role: 'fixed',
      required: true,
    });
  }

  const bodyKeys = [ 'session_id', 'message', 'client_turn_id', 'openid' ];
  const chatLike = /submit|chat|turn|session/i.test(path) || /submit|chat|turn|session/i.test(texts);
  for (const key of bodyKeys) {
    const full = `body.${key}`;
    if (omit_fields.includes(full) || omit_fields.includes(key)) {
      fields.push({ name: key, location: 'body', role: 'omit_on_purpose', required: false });
      continue;
    }
    if (!chatLike) continue;
    if (key === 'session_id' || key === 'openid') {
      fields.push({ name: key, location: 'body', role: 'variable', required: true });
    } else {
      fields.push({ name: key, location: 'body', role: 'variable', required: key !== 'client_turn_id' });
    }
  }

  if (chatLike && (
    /session_id|turn_id/i.test(path + texts)
    || fields.some(f => f.name === 'session_id' && f.role === 'variable')
  )) {
    fields.push({
      name: 'preflight_api_template_id',
      location: 'config',
      role: 'fixed',
      required: true,
      export_var: /turn_id/.test(path) ? 'turn_id' : 'session_id',
      resource: 'api_template',
    });
  }

  return {
    intent: {
      kind,
      expected_status: expectedStatus,
      omit_fields,
      corrupt_headers,
      needs_auth: kind !== 'unauth_401' && needsAuthHeader(path, methodFromItem(item, configJson), texts, kind),
    },
    fields,
    done: true,
  };
}

function methodFromItem(item, configJson) {
  return String(configJson.http_method || item.http_method || 'GET').toUpperCase();
}

/** 公开探活类接口不强制鉴权；chat/submit 等业务接口才要求 */
function needsAuthHeader(path, method, texts, kind) {
  if (kind === 'unauth_401') return false;
  const p = String(path || '');
  if (/^\/?(ready|health|livez|readyz|metrics)?\/?$/i.test(p)) return false;
  if (/\/(ready|health)$/i.test(p)) return false;
  if (method === 'GET' && /\/(bootstrap|llm\/profiles)$/i.test(p) && !/鉴权|unauthorized|401|internal.?key/i.test(texts)) {
    return false;
  }
  if (/submit|chat|internal|admin|cancel|class-session/i.test(p)) return true;
  if (/Internal Key|鉴权|Authorization|未授权/i.test(texts)) return true;
  // 默认：有业务 path 时要求鉴权（fitness 多数接口带 Internal Key）
  return Boolean(p && p !== '/');
}

module.exports = { classifyIntentRule };

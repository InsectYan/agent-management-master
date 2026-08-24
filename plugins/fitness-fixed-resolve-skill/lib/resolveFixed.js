'use strict';

/**
 * 固定值目录解析（规则主路径，无 LLM）
 * 请求头（含 Authorization）不在执行前闸门校验——由项目「请求头」Tab / 环境 / 用例 Headers 运行时注入。
 * @param {object} params
 */
function resolveFixedRule(params = {}) {
  const intent = params.intent || {};
  const fields = Array.isArray(params.fields) ? params.fields : [];
  const envCatalog = params.env_catalog || {};
  const projectVars = params.project_vars || {};
  const templates = Array.isArray(params.api_templates_catalog)
    ? params.api_templates_catalog
    : [];

  const skipAuth = intent.kind === 'unauth_401'
    || (Array.isArray(intent.corrupt_headers) && intent.corrupt_headers.length > 0);

  const resolved_fixed = [];
  const missing_fixed = [];
  const bindings = {};
  const skip_resolve_fields = [];

  const headerKeys = new Set([
    ...(envCatalog.global_header_keys || []),
    ...Object.keys(envCatalog.global_headers_present || {}),
  ]);
  const fixedParamKeys = new Set([
    ...(envCatalog.fixed_param_keys || []),
    ...Object.keys(projectVars.keys_with_value || projectVars || {}),
  ]);
  if (Array.isArray(projectVars)) {
    for (const k of projectVars) fixedParamKeys.add(k);
  } else if (projectVars && typeof projectVars === 'object' && Array.isArray(projectVars.keys)) {
    for (const k of projectVars.keys) fixedParamKeys.add(k);
  }

  function matchTemplateForVar(varName) {
    const name = String(varName || '').toLowerCase();
    return templates.find(t => {
      const exports = (t.export_keys || t.export_schema_keys || []).map(k => String(k).toLowerCase());
      if (exports.includes(name)) return true;
      const label = `${t.name || ''} ${t.template_code || ''}`.toLowerCase();
      return name === 'session_id' && /bootstrap|chat|session/.test(label);
    }) || null;
  }

  function isHeaderField(name, loc, full) {
    return loc === 'headers'
      || /^headers\./i.test(full || '')
      || /authorization/i.test(name || '')
      || /authorization/i.test(full || '')
      || /internal.?key/i.test(name || '')
      || /x-internal/i.test(name || '');
  }

  for (const field of fields) {
    if (!field || field.role !== 'fixed') continue;
    const name = field.name || field.field || '';
    const loc = field.location || '';
    const full = loc ? `${loc}.${name}` : name;

    // 结构元数据由 N3 从用例补齐，不在本 Skill 目录解析
    if (/^(endpoint_path|http_method|http_status_expected)$/i.test(name)) {
      resolved_fixed.push({
        field: full || name,
        source: 'item_meta',
        present: true,
        defer: 'config-structure',
      });
      continue;
    }

    // 执行前不校验请求头：运行时由项目请求头 / 环境 / 用例 Headers 合并
    if (isHeaderField(name, loc, full) || field.role === 'corrupt_on_purpose') {
      skip_resolve_fields.push(full || name);
      if (skipAuth && /authorization/i.test(full || name || '')) {
        // 与 unauth_401 对齐：明确跳过鉴权解析
      }
      continue;
    }

    if (/preflight_api_template_id|api_template/i.test(name) || field.resource === 'api_template') {
      const needVar = field.export_var || field.for_var || 'session_id';
      const hit = matchTemplateForVar(needVar);
      if (hit && hit.id != null) {
        bindings.preflight_api_template_id = hit.id;
        resolved_fixed.push({
          field: 'preflight_api_template_id',
          source: `ft_api_template#${hit.id}`,
          present: true,
        });
      } else {
        missing_fixed.push({
          field: 'preflight_api_template_id',
          expected_source: 'ft_api_template',
          detail: `当前项目无 export「${needVar}」的匹配接口模板，禁止虚构 template_id`,
        });
      }
      continue;
    }

    if (fixedParamKeys.has(name) || headerKeys.has(name)) {
      resolved_fixed.push({
        field: full || name,
        source: fixedParamKeys.has(name) ? 'project_vars|fixed_params' : 'env.global_headers',
        present: true,
      });
    } else if (field.required !== false) {
      missing_fixed.push({
        field: full || name,
        expected_source: 'env | project_vars | api_template',
        detail: `固定字段「${name}」在本项目目录中不存在`,
      });
    }
  }

  return {
    resolved_fixed,
    bindings,
    missing_fixed,
    skip_resolve_fields,
    ready: missing_fixed.length === 0,
  };
}

module.exports = { resolveFixedRule };

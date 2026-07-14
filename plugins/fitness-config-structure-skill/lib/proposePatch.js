'use strict';

/**
 * 配置结构补丁（不填 secret、不虚构 template_id）
 */
function proposeConfigPatchRule(params = {}) {
  const item = params.item || {};
  const intent = params.intent || {};
  const fields = Array.isArray(params.fields) ? params.fields : [];
  const fixed = params.fixed || {};
  const bindings = fixed.bindings || {};
  const current = params.config_json || {};
  const gaps = Array.isArray(params.gaps) ? params.gaps : [];

  const patch = {
    execution_mode: current.execution_mode || 'http',
    endpoint_path: current.endpoint_path || item.endpoint_path || null,
    http_method: current.http_method || item.http_method || 'POST',
    http_status_expected: intent.expected_status
      ?? current.http_status_expected
      ?? item.http_status_expected
      ?? 200,
    headers: { ...(current.headers || {}) },
    body: { ...(typeof current.body === 'object' && current.body ? current.body : {}) },
    assertions: Array.isArray(current.assertions) ? [ ...current.assertions ] : [],
    preflight_api_template_id: current.preflight_api_template_id || null,
    preflight_include_main_request: current.preflight_include_main_request,
    autofill_meta: {
      intent_kind: intent.kind || null,
      sources: [],
    },
  };

  if (!patch.endpoint_path) {
    for (const g of gaps) {
      if (g.field === 'endpoint_path' && g.suggest) patch.endpoint_path = g.suggest;
    }
  }

  if (bindings.preflight_api_template_id != null) {
    const catalog = params.api_templates_catalog || [];
    const ok = catalog.some(t => Number(t.id) === Number(bindings.preflight_api_template_id));
    if (ok || !catalog.length) {
      // catalog 空时仅当 bindings 来自 N2 白名单才信任；有 catalog 必须命中
      if (!catalog.length || ok) {
        patch.preflight_api_template_id = bindings.preflight_api_template_id;
        patch.autofill_meta.sources.push('fixed.bindings.preflight');
        if (String(patch.endpoint_path || '').includes('{{turn_id}}')) {
          patch.preflight_include_main_request = true;
        }
      }
    }
  }

  if (intent.kind === 'unauth_401') {
    delete patch.headers.Authorization;
    delete patch.headers.authorization;
    patch.headers['X-Autofill-Corrupt-Auth'] = 'invalid';
    patch.autofill_meta.sources.push('intent.unauth_401');
  }

  const omit = new Set([
    ...(intent.omit_fields || []),
    ...fields.filter(f => f.role === 'omit_on_purpose').map(f => (f.location === 'body' ? `body.${f.name}` : f.name)),
  ]);

  for (const f of fields) {
    if (f.location !== 'body' || f.role === 'omit_on_purpose') continue;
    const key = f.name;
    if (omit.has(key) || omit.has(`body.${key}`)) {
      delete patch.body[key];
      continue;
    }
    if (f.role === 'variable') {
      if (patch.body[key] == null || patch.body[key] === '') {
        patch.body[key] = `{{${key}}}`;
        patch.autofill_meta.sources.push(`body.{{${key}}}`);
      }
    }
  }

  for (const o of omit) {
    const key = String(o).replace(/^body\./, '');
    delete patch.body[key];
  }

  if (!patch.assertions.some(a => a.type === 'status')) {
    patch.assertions.unshift({ type: 'status', expect: patch.http_status_expected });
  }

  const sample_needs = [];
  for (const f of fields) {
    if (f.location === 'body' && f.role === 'variable' && f.name === 'message') {
      if (!omit.has('body.message') && !omit.has('message')) {
        sample_needs.push({
          sample_kind: 'turn_submit_body',
          field: 'message',
          schema_hint: { message: 'string' },
        });
      }
    }
  }

  // 禁止臆造 Authorization 实体值
  if (patch.headers.Authorization && intent.kind === 'unauth_401') {
    delete patch.headers.Authorization;
  }

  return {
    config_patch: patch,
    sample_needs,
    done: true,
  };
}

module.exports = { proposeConfigPatchRule };

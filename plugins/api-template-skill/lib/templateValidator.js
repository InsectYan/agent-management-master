'use strict';

const HTTP_METHODS = new Set([ 'GET', 'POST', 'PUT', 'PATCH', 'DELETE' ]);
const INJECT_LOCATIONS = new Set([ 'body', 'header', 'query', 'path' ]);

function slugifyCode(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || `api-${Date.now()}`;
}

function normalizeInjectSchema(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, i) => ({
    key: String(item.key || item.field || `field_${i + 1}`).trim(),
    label: String(item.label || item.key || `字段 ${i + 1}`).trim(),
    location: INJECT_LOCATIONS.has(item.location) ? item.location : 'body',
    json_path: String(item.json_path || item.key || '').trim(),
  })).filter(item => item.key);
}

function normalizeTemplate(raw, index = 0, projectCode = null) {
  const method = String(raw.http_method || 'POST').toUpperCase();
  const templateCode = slugifyCode(raw.template_code || raw.name || `api-${index + 1}`);
  return {
    template_code: templateCode,
    name: String(raw.name || templateCode).trim().slice(0, 255),
    description: raw.description ? String(raw.description).slice(0, 2000) : null,
    project_code: projectCode || raw.project_code || null,
    http_method: HTTP_METHODS.has(method) ? method : 'POST',
    url_path: String(raw.url_path || '/').trim().slice(0, 512),
    headers_json: raw.headers_json && typeof raw.headers_json === 'object' ? raw.headers_json : {},
    query_json: raw.query_json && typeof raw.query_json === 'object' ? raw.query_json : {},
    body_template: raw.body_template && typeof raw.body_template === 'object' ? raw.body_template : {},
    inject_schema: normalizeInjectSchema(raw.inject_schema),
  };
}

function isValidTemplate(raw) {
  const t = normalizeTemplate(raw);
  return Boolean(t.template_code && t.name && t.url_path);
}

function normalizeTemplates(rawList, projectCode = null) {
  if (!Array.isArray(rawList)) return [];
  const seen = new Set();
  const result = [];
  for (let i = 0; i < rawList.length; i++) {
    const t = normalizeTemplate(rawList[i], i, projectCode);
    if (!isValidTemplate(t)) continue;
    let code = t.template_code;
    let suffix = 2;
    while (seen.has(code)) {
      code = `${t.template_code}-${suffix}`;
      suffix += 1;
    }
    seen.add(code);
    result.push({ ...t, template_code: code });
  }
  return result;
}

module.exports = {
  normalizeTemplate,
  normalizeTemplates,
  isValidTemplate,
  slugifyCode,
};

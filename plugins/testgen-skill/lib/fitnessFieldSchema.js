'use strict';

/**
 * test_item_detail 字段合规（与 testgen BFF itemDetailFieldSchema 对齐）
 */
const ITEM_DETAIL_FIELDS = [
  'item_id', 'dimension_id', 'category_major_id', 'category_minor_id', 'sub_class',
  'item_name', 'detail_summary', 'expected_observation', 'test_input_example',
  'preconditions', 'test_steps', 'assertion_points', 'priority_id',
  'endpoint_path', 'http_method', 'http_status_expected',
  'scheme_primary_id', 'validation_primary_id', 'template_code',
  'station_id', 'role_scope_id', 'config_json', 'threshold_json', 'tags', 'notes',
];

const FIELD_ALIASES = {
  id: 'item_id',
  case_id: 'item_id',
  title: 'item_name',
  name: 'item_name',
  summary: 'detail_summary',
  expected: 'expected_observation',
  expected_result: 'expected_observation',
  steps: 'test_steps',
  assertions: 'assertion_points',
  path: 'endpoint_path',
  method: 'http_method',
  expect_status: 'http_status_expected',
  input: 'test_input_example',
  body: 'test_input_example',
};

const REQUIRED = [ 'item_name', 'detail_summary', 'expected_observation', 'test_steps' ];

const AGENT_OPTIONAL = [
  'preconditions', 'assertion_points', 'priority_id',
  'endpoint_path', 'http_method', 'http_status_expected', 'test_input_example',
  'config_json', 'threshold_json', 'tags', 'notes', 'sub_class',
];

const PLATFORM_FILLED_FIELDS = new Set([
  'item_id', 'project_code', 'dimension_id', 'category_major_id', 'category_minor_id',
  'scheme_primary_id', 'scheme_secondary_id', 'validation_primary_id', 'validation_secondary_id',
  'template_code', 'source_doc', 'source_section',
]);

const FIELD_MAX = 300;

function truncate(value, max = FIELD_MAX) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function normalizeSteps(steps) {
  if (!Array.isArray(steps)) {
    const single = truncate(steps);
    return single ? [ single ] : [];
  }
  return steps.map(s => {
    if (typeof s === 'string') return truncate(s);
    if (s && typeof s === 'object') return truncate(s.action || s.step || JSON.stringify(s));
    return truncate(String(s));
  }).filter(Boolean);
}

function toJsonArray(value) {
  if (Array.isArray(value)) {
    return value.map(v => truncate(typeof v === 'string' ? v : JSON.stringify(v))).filter(Boolean);
  }
  if (value == null || value === '') return [];
  return [ truncate(String(value)) ];
}

function normalizeCaseFields(tc) {
  if (!tc || typeof tc !== 'object') return {};
  const out = { ...tc };
  for (const [ alias, field ] of Object.entries(FIELD_ALIASES)) {
    if (out[field] != null && out[field] !== '') continue;
    if (out[alias] != null && out[alias] !== '') out[field] = out[alias];
  }
  if (!out.detail_summary && out.item_name) out.detail_summary = out.item_name;
  return out;
}

/**
 * 保留 Fitness test_item_detail 字段，兼容 title/steps/expected 别名。
 * @param {unknown[]} raw
 */
function normalizeFitnessTestCases(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((tc, i) => {
    const base = normalizeCaseFields(tc || {});
    const itemName = truncate(base.item_name || `用例 ${i + 1}`, 512);
    const detailSummary = truncate(base.detail_summary || itemName, 4096) || itemName;
    const expected = truncate(base.expected_observation || '');
    const steps = normalizeSteps(base.test_steps);
    const preconditions = toJsonArray(base.preconditions || tc?.precondition);
    const assertions = toJsonArray(base.assertion_points);

    const out = {
      item_name: itemName,
      detail_summary: detailSummary,
      expected_observation: expected,
      test_steps: steps.length ? steps : [ '待补充步骤' ],
    };

    if (preconditions.length) out.preconditions = preconditions;
    if (assertions.length) {
      out.assertion_points = assertions;
    } else if (expected) {
      out.assertion_points = [ expected ];
    }

    const optionalScalars = [
      'priority_id', 'endpoint_path', 'http_method', 'http_status_expected',
      'test_input_example', 'sub_class', 'notes',
    ];
    for (const key of optionalScalars) {
      const val = base[key];
      if (val == null || val === '') continue;
      out[key] = typeof val === 'number' ? val : truncate(val, key === 'item_name' ? 512 : FIELD_MAX);
    }

    if (base.priority && !out.priority_id) {
      const p = String(base.priority).toUpperCase();
      if (/^P[0-3]$/.test(p)) out.priority_id = p;
    }

    if (Array.isArray(base.tags) && base.tags.length) {
      out.tags = base.tags.map(t => truncate(t, 64)).filter(Boolean);
    }

    if (base.config_json && typeof base.config_json === 'object' && Object.keys(base.config_json).length) {
      out.config_json = base.config_json;
    }
    if (base.threshold_json && typeof base.threshold_json === 'object' && Object.keys(base.threshold_json).length) {
      out.threshold_json = base.threshold_json;
    }

    return out;
  });
}

function hasValue(v) {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function auditItemDetailFields(tc) {
  const errors = [];
  const warnings = [];
  const normalized = normalizeCaseFields(tc);
  if (!tc || typeof tc !== 'object') {
    return { valid: false, errors: [ '用例必须为对象' ], warnings, normalized: {} };
  }
  for (const field of REQUIRED) {
    if (!hasValue(normalized[field])) {
      errors.push(`缺少必填字段 "${field}"`);
    }
  }
  if (normalized.test_steps && !Array.isArray(normalized.test_steps)) {
    errors.push('test_steps 须为数组');
  }
  for (const key of Object.keys(tc)) {
    if (key === 'compliance' || key === 'status' || key.startsWith('_')) continue;
    const mapped = FIELD_ALIASES[key] || key;
    if (PLATFORM_FILLED_FIELDS.has(mapped) || PLATFORM_FILLED_FIELDS.has(key)) continue;
    if (REQUIRED.includes(mapped) || REQUIRED.includes(key)) continue;
    if (AGENT_OPTIONAL.includes(mapped) || AGENT_OPTIONAL.includes(key)) {
      if (tc[key] != null && tc[key] !== '' && !hasValue(tc[key])) {
        warnings.push(`字段 "${key}" 已出现但无有效值，建议省略该 key 或补全`);
      }
      continue;
    }
    if (!ITEM_DETAIL_FIELDS.includes(mapped) && !ITEM_DETAIL_FIELDS.includes(key)) {
      warnings.push(`字段 "${key}" 不在 test_item_detail 表列中`);
    }
  }
  return { valid: errors.length === 0, errors, warnings, normalized };
}

module.exports = {
  ITEM_DETAIL_FIELDS,
  FIELD_ALIASES,
  REQUIRED,
  AGENT_OPTIONAL,
  PLATFORM_FILLED_FIELDS,
  normalizeCaseFields,
  normalizeFitnessTestCases,
  auditItemDetailFields,
};

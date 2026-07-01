'use strict';

const { auditItemDetailFields } = require('./fitnessFieldSchema');

/**
 * 字段合规校验：仅检查 test_item_detail 表字段是否齐全，不做业务语义审查。
 * @param {object[]} testCases
 */
function validateTestCaseDraft(testCases) {
  const errors = [];
  const warnings = [];

  if (!Array.isArray(testCases)) {
    return { valid: false, errors: [ 'test_cases 必须为数组' ], warnings: [], cases: [] };
  }
  if (!testCases.length) {
    return { valid: false, errors: [ 'test_cases 不能为空' ], warnings: [], cases: [] };
  }

  const cases = [];
  testCases.forEach((tc, i) => {
    const audit = auditItemDetailFields(tc);
    const prefix = `用例 #${i + 1}`;
    audit.errors.forEach(e => errors.push(`${prefix}: ${e}`));
    audit.warnings.forEach(w => warnings.push(`${prefix}: ${w}`));
    if (audit.valid) cases.push(audit.normalized);
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    cases,
    field_schema: {
      table: 'test_item_detail',
      required: [ 'item_name', 'detail_summary', 'expected_observation', 'test_steps' ],
      platform_filled: [
        'dimension_id', 'category_major_id', 'category_minor_id',
        'scheme_primary_id', 'validation_primary_id', 'template_code', 'item_id',
      ],
      optional: [
        'preconditions', 'assertion_points', 'endpoint_path', 'http_method',
        'http_status_expected', 'test_input_example', 'config_json', 'threshold_json',
      ],
    },
  };
}

module.exports = { validateTestCaseDraft };

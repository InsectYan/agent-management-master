'use strict';

const REQUIRED_FIELDS = [ 'id', 'title', 'expected' ];
const OPTIONAL_FIELDS = [ 'type', 'priority', 'preconditions', 'steps', 'tags', 'path', 'method', 'body' ];

/**
 * @param {object[]} testCases
 * @returns {{ valid: boolean, errors: string[], warnings: string[], cases: object[] }}
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

  const seenIds = new Set();

  testCases.forEach((tc, i) => {
    const prefix = `用例 #${i + 1}`;

    if (!tc || typeof tc !== 'object') {
      errors.push(`${prefix}: 必须为对象`);
      return;
    }

    for (const field of REQUIRED_FIELDS) {
      if (!tc[field] || (typeof tc[field] === 'string' && !String(tc[field]).trim())) {
        errors.push(`${prefix}: 缺少必填字段 "${field}"`);
      }
    }

    if (tc.id) {
      if (seenIds.has(tc.id)) {
        errors.push(`${prefix}: 重复 id "${tc.id}"`);
      }
      seenIds.add(tc.id);
    }

    const hasSteps = Array.isArray(tc.steps) && tc.steps.length;
    const hasPath = tc.path || tc.body || tc.input;
    if (!hasSteps && !hasPath) {
      warnings.push(`${prefix}: 无 steps/path，Fitness 执行可能缺少 HTTP 目标`);
    }

    if (tc.method && !/^(GET|POST|PUT|PATCH|DELETE)$/i.test(tc.method)) {
      warnings.push(`${prefix}: method "${tc.method}" 非常规 HTTP 动词`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    cases: testCases,
    field_schema: { required: REQUIRED_FIELDS, optional: OPTIONAL_FIELDS },
  };
}

module.exports = { validateTestCaseDraft, REQUIRED_FIELDS, OPTIONAL_FIELDS };

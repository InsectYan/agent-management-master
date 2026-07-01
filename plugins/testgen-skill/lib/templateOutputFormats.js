'use strict';

const TEMPLATE_OUTPUT_FORMATS = {
  'TPL-DET': {
    label: '确定性单次 TS-01-DET',
    config_json: {
      endpoint_path: 'string HTTP 路径',
      http_method: 'GET|POST|PUT|PATCH|DELETE',
      http_status_expected: 'number 期望状态码',
      test_input_example: 'string POST/PUT/PATCH 时 JSON 请求体文本',
      headers: 'object 可选，如 X-Internal-Service-Key',
      body: 'object 与 test_input_example 等价，解析后的 JSON',
    },
    threshold_json: {},
    note: '可不输出 config_json，平台会从 endpoint_path 等字段自动组装；submit 首次 202',
  },
  'TPL-BND': {
    label: '边界矩阵 TS-02-BND',
    config_json: { matrix: '[{ runner, path, method, expect_status, body?, headers? }]' },
    threshold_json: {},
  },
  'TPL-REP': {
    label: '重复抽样 TS-03-REP',
    config_json: { repeat_count: 'number', path: 'string', method: 'string', expect_status: 'number', body: 'object?' },
    threshold_json: { passk_N: 'number', passk_M: 'number' },
  },
  'TPL-SET': {
    label: '固定样本集 TS-04-SET',
    config_json: { sample_set_id: 'number 样本集 ID' },
    threshold_json: { rate_L: 'number', rate_M: 'number', rate_H: 'number' },
    note: 'config_json 常由平台配置页填写，Agent 可只写用例描述',
  },
  'TPL-CHAIN': {
    label: '多步链路 TS-05-CHAIN',
    config_json: { steps: '[{ runner, path, method, expect_status, body?, extract? }]', vars: 'object?' },
    threshold_json: {},
  },
  'TPL-PAIR': {
    label: '对照对比 TS-06-PAIR',
    config_json: { pairs: '[{ role, path, method, expect_status, forbidden_patterns? }]' },
    threshold_json: {},
  },
  'TPL-NEG': {
    label: '对抗专项 TS-07-NEG',
    config_json: { cases: '[{ path, method, body?, expect_blocked }]', block_rate_min: 'number?' },
    threshold_json: { block_rate_min: 'number' },
  },
  'TPL-OBS': {
    label: '可观测稽核 TS-08-OBS',
    config_json: { checks: '[{ mode, path?, session_id?, client_turn_id?, required_fields? }]' },
    threshold_json: { require_complete: 'boolean' },
  },
  'TPL-LOAD': {
    label: '压测容量 TS-09-LOAD',
    config_json: { vu: 'number', duration_sec: 'number', path: 'string', method: 'string' },
    threshold_json: { p99_max_ms: 'number', error_rate_max: 'number' },
  },
  'TPL-MAN': {
    label: '人工评审 TS-10-MAN',
    config_json: { rubric_id: 'string', reviewer_count: 'number' },
    threshold_json: {},
    note: '人工评审，config_json 可为空，Agent 侧重 item_name/detail_summary/test_steps',
  },
};

/** Agent 勿输出，测试平台入库时按生成任务自动写入 */
const PLATFORM_FILLED_FIELDS = [
  'dimension_id', 'category_major_id', 'category_minor_id',
  'scheme_primary_id', 'scheme_secondary_id',
  'validation_primary_id', 'validation_secondary_id',
  'template_code', 'item_id', 'project_code',
];

const AGENT_REQUIRED = [ 'item_name', 'detail_summary', 'expected_observation', 'test_steps' ];

const AGENT_OPTIONAL = [
  'preconditions', 'assertion_points', 'priority_id',
  'endpoint_path', 'http_method', 'http_status_expected', 'test_input_example',
  'config_json', 'threshold_json', 'tags', 'notes',
];

function getTemplateOutputFormat(templateCode) {
  return TEMPLATE_OUTPUT_FORMATS[templateCode] || TEMPLATE_OUTPUT_FORMATS['TPL-DET'];
}

function formatTemplateOutputForPrompt(templateCode) {
  const spec = getTemplateOutputFormat(templateCode);
  return JSON.stringify({
    platform_filled: PLATFORM_FILLED_FIELDS,
    agent_required: AGENT_REQUIRED,
    agent_optional: AGENT_OPTIONAL,
    template_specific: {
      template_code: templateCode || 'TPL-DET',
      label: spec.label,
      config_json: spec.config_json,
      threshold_json: spec.threshold_json,
      note: spec.note || '若输出 config_json/threshold_json，其 key 须有有效值；可不输出，平台缺省补齐。',
    },
    field_rule: '未出现的 key 不必生成；已出现的 key 须有有效值（禁止 null/空占位）',
  }, null, 2);
}

function buildFitnessPrimaryContext(params = {}) {
  const target = params.options?.scheme_target || params.fitness_context || {};
  if (params.fitness_primary_context) {
    return params.fitness_primary_context;
  }
  return [
    '## 测试平台生成目标（仅供理解，分类字段由平台自动写入，Agent 勿输出）',
    `- 大类：${target.category_major_id || params.category_major_id || '—'} ${target.category_major_name || ''}`.trim(),
    `- 测试方案 TS：${params.scheme_id || target.scheme_id || '—'} ${target.scheme_name || ''}`.trim(),
    `- 主验证 VS：${params.validation_id || target.validation_id || '—'} ${target.validation_name || ''}`.trim(),
    `- 模板：${params.template_code || target.template_code || 'TPL-DET'} ${target.template_name || ''}`.trim(),
    `- 条数目标：${target.count ?? '—'}`,
    `平台自动填入：${PLATFORM_FILLED_FIELDS.join('、')}`,
    'Agent 必填：item_name、detail_summary、expected_observation、test_steps',
  ].join('\n');
}

module.exports = {
  TEMPLATE_OUTPUT_FORMATS,
  PLATFORM_FILLED_FIELDS,
  AGENT_REQUIRED,
  AGENT_OPTIONAL,
  getTemplateOutputFormat,
  formatTemplateOutputForPrompt,
  buildFitnessPrimaryContext,
};

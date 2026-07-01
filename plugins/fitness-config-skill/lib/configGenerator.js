'use strict';

function buildDet(item) {
  return {
    config_json: {
      endpoint_path: item.endpoint_path || '/health',
      http_method: item.http_method || 'GET',
      http_status_expected: item.http_status_expected ?? 200,
      test_input_example: item.test_input_example || '',
    },
    threshold_json: {},
  };
}

function buildBnd(item) {
  const path = item.endpoint_path || '/health';
  return {
    config_json: {
      matrix: [
        { runner: item.automation_command ? 'cli' : 'http', path, method: item.http_method || 'GET', expect_status: item.http_status_expected ?? 200, command: item.automation_command || '' },
      ],
    },
    threshold_json: {},
  };
}

function buildRep(item) {
  return {
    config_json: {
      repeat_count: 3,
      runner: item.automation_command ? 'cli' : 'http',
      path: item.endpoint_path || '/health',
      method: item.http_method || 'GET',
      expect_status: item.http_status_expected ?? 200,
      command: item.automation_command || undefined,
    },
    threshold_json: { passk_N: 3, passk_M: 3 },
  };
}

function buildChain(item) {
  return {
    config_json: {
      steps: [
        {
          runner: 'http',
          path: item.endpoint_path || '/health',
          method: item.http_method || 'GET',
          expect_status: item.http_status_expected ?? 200,
        },
      ],
    },
    threshold_json: {},
  };
}

function buildPair() {
  return {
    config_json: {
      pairs: [
        { role: 'coach', path: '/health', method: 'GET', expect_status: 200, forbidden_patterns: [] },
        { role: 'member', path: '/health', method: 'GET', expect_status: 200, forbidden_patterns: [] },
        { role: 'manager', path: '/health', method: 'GET', expect_status: 200, forbidden_patterns: [] },
      ],
    },
    threshold_json: {},
  };
}

function buildNeg(item) {
  return {
    config_json: {
      cases: [
        {
          path: item.endpoint_path || '/api/__adv__/probe',
          method: item.http_method || 'GET',
          expect_blocked: true,
          block_statuses: [ 400, 403, 404, 405, 422, 429, 500 ],
        },
      ],
    },
    threshold_json: { block_rate_min: 95 },
  };
}

function buildObs(item) {
  return {
    config_json: {
      checks: [
        {
          mode: 'http_fields',
          path: item.endpoint_path || '/health',
          method: 'GET',
          expect_status: 200,
          required_fields: [ 'status', 'runtime' ],
        },
      ],
    },
    threshold_json: {},
  };
}

function buildLoad(item) {
  return {
    config_json: {
      vu: 10,
      duration_sec: 60,
      path: item.endpoint_path || '/health',
      method: item.http_method || 'GET',
    },
    threshold_json: { p99_max_ms: 500, error_rate_max: 1 },
  };
}

const BUILDERS = {
  generate_det: buildDet,
  generate_bnd: buildBnd,
  generate_rep: buildRep,
  generate_chain: buildChain,
  generate_pair: buildPair,
  generate_neg: buildNeg,
  generate_obs: buildObs,
  generate_load: buildLoad,
  generate_config: buildDet,
};

function generateRuleBased(action, params = {}) {
  const item = params.item || {};
  const fn = BUILDERS[action] || BUILDERS.generate_config;
  return fn(item);
}

module.exports = { generateRuleBased };

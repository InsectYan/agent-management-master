'use strict';

const HTTP_METHODS = [ 'GET', 'POST', 'PUT', 'PATCH', 'DELETE' ];

function extractEndpoints(text = '') {
  const endpoints = [];
  const re = /(GET|POST|PUT|PATCH|DELETE)\s+(\/[\w\-/{}\.:]+)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    endpoints.push({ method: m[1].toUpperCase(), path: m[2] });
  }
  return endpoints;
}

function extractPathFromExample(example = '') {
  const urlMatch = example.match(/https?:\/\/[^\s]+(\/[\w\-/.?=&]+)?/i);
  if (urlMatch) {
    try {
      const u = new URL(urlMatch[0]);
      return u.pathname || '/';
    } catch {
      /* ignore */
    }
  }
  const pathMatch = example.match(/(\/api\/[\w\-/.]+)/i);
  return pathMatch ? pathMatch[1] : '/api/chat';
}

function toSample(row, i, meta = {}) {
  return {
    path: row.path || '/',
    method: row.method || 'POST',
    expect_status: row.expect_status ?? 200,
    body: row.body,
    headers: row.headers,
    input_data: row.input_data || {
      runner: row.runner || 'http',
      path: row.path || '/',
      method: row.method || 'POST',
      body: row.body,
      headers: row.headers,
    },
    expected_data: row.expected_data || { expect_status: row.expect_status ?? 200 },
    metadata: { index: i, ...meta },
    sort_order: i,
  };
}

function fromExampleRule(params) {
  const example = String(params.test_input_example || '');
  const endpoints = extractEndpoints(example);
  const basePath = extractPathFromExample(example);

  if (endpoints.length) {
    return endpoints.map((ep, i) => toSample({
      path: ep.path,
      method: ep.method,
      expect_status: ep.method === 'GET' ? 200 : 201,
      body: ep.method !== 'GET' ? { prompt: example.slice(0, 300) } : undefined,
    }, i, { source: 'from_example', scheme_id: params.scheme_id }));
  }

  return [ toSample({
    path: basePath,
    method: 'POST',
    expect_status: 200,
    body: { prompt: example.slice(0, 500) },
  }, 0, { source: 'from_example_fallback', scheme_id: params.scheme_id }) ];
}

function expandMatrixRule(params) {
  const matrix = params.matrix || params.config_json?.matrix;
  if (Array.isArray(matrix) && matrix.length) {
    return matrix.map((row, i) => toSample({
      runner: row.runner || 'http',
      path: row.path || '/health',
      method: row.method || 'GET',
      expect_status: row.expect_status ?? 200,
      body: row.body,
      command: row.command,
    }, i, { source: 'matrix_input', scheme_id: 'TS-02-BND' }));
  }

  const dims = params.matrix_dims || params.dimensions || [ 'valid', 'empty_body', 'invalid_type' ];
  const basePath = params.base_path || extractPathFromExample(params.test_input_example || '') || '/health';

  const variants = {
    valid: { method: 'GET', expect_status: 200 },
    empty_body: { method: 'POST', body: {}, expect_status: 400 },
    invalid_type: { method: 'POST', body: { value: 'not-a-number' }, expect_status: 422 },
    missing_field: { method: 'POST', body: { partial: true }, expect_status: 400 },
    unauthorized: { method: 'GET', headers: { Authorization: 'Bearer invalid' }, expect_status: 401 },
    not_found: { method: 'GET', path: `${basePath}/__not_found__`, expect_status: 404 },
  };

  return dims.map((dim, i) => {
    const v = variants[dim] || { method: 'GET', expect_status: 200 };
    return toSample({
      path: v.path || basePath,
      method: v.method || 'GET',
      expect_status: v.expect_status ?? 200,
      body: v.body,
      headers: v.headers,
    }, i, { source: 'expand_matrix', dimension: dim, scheme_id: 'TS-02-BND' });
  });
}

function genAdversarialRule(params) {
  const cases = params.cases || params.config_json?.cases;
  if (Array.isArray(cases) && cases.length) {
    return cases.map((c, i) => ({
      path: c.path || '/api/__adv__/probe',
      method: c.method || 'GET',
      expect_blocked: c.expect_blocked !== false,
      block_statuses: c.block_statuses || [ 400, 403, 404, 422, 429 ],
      input_data: {
        runner: 'http',
        path: c.path || '/api/__adv__/probe',
        method: c.method || 'GET',
        body: c.body,
      },
      expected_data: { expect_blocked: true },
      metadata: { source: 'adversarial_input', scheme_id: 'TS-07-NEG', index: i },
      sort_order: i,
    }));
  }

  const probes = [
    { path: '/api/__adv__/sql-inject', method: 'POST', body: { q: "' OR 1=1 --" } },
    { path: '/api/__adv__/xss', method: 'POST', body: { q: '<script>alert(1)</script>' } },
    { path: '/api/__adv__/path-traversal', method: 'GET', path: '/api/__adv__/../../../etc/passwd' },
    { path: '/api/__adv__/oversized', method: 'POST', body: { data: 'x'.repeat(500) } },
  ];

  const forbidden_patterns = [
    'DROP TABLE',
    '<script>',
    '../../../',
    'ignore previous instructions',
  ];

  const samples = probes.map((p, i) => ({
    path: p.path,
    method: p.method,
    expect_blocked: true,
    block_statuses: [ 400, 403, 404, 405, 422, 429, 500 ],
    input_data: {
      runner: 'http',
      path: p.path,
      method: p.method,
      body: p.body,
    },
    expected_data: { expect_blocked: true },
    metadata: { source: 'gen_adversarial', scheme_id: 'TS-07-NEG', index: i },
    sort_order: i,
  }));

  return { samples, forbidden_patterns };
}

function generateRuleBased(action, params) {
  if (action === 'expand_matrix') {
    return { samples: expandMatrixRule(params), forbidden_patterns: [] };
  }
  if (action === 'gen_adversarial') {
    return genAdversarialRule(params);
  }
  return { samples: fromExampleRule(params), forbidden_patterns: [] };
}

module.exports = {
  fromExampleRule,
  expandMatrixRule,
  genAdversarialRule,
  generateRuleBased,
  extractEndpoints,
};

'use strict';

function normalizeStep(step, envUrl = '') {
  const path = step.path || step.url || '/health';
  const resolvedPath = path.startsWith('http') ? path : path;
  return {
    path: resolvedPath,
    method: (step.method || 'GET').toUpperCase(),
    extract: step.extract || {},
    body: step.body,
    runner: step.runner || 'http',
    env_url: envUrl || undefined,
  };
}

function planFromCurrentSteps(currentSteps = [], envUrl = '') {
  const existing = currentSteps.map(s => normalizeStep(s, envUrl));

  if (!existing.length) {
    return {
      steps: [
        normalizeStep({ path: '/health', method: 'GET', extract: {} }, envUrl),
        normalizeStep({ path: '/api/status', method: 'GET', extract: { status: 'body.status' } }, envUrl),
      ],
      fallback: true,
      reason: '无 current_steps，生成默认探测步骤',
    };
  }

  const last = existing[existing.length - 1];
  const nextPath = last.path.replace(/\/[^/]+$/, '') + '/next';
  return {
    steps: [
      ...existing,
      normalizeStep({
        path: nextPath.startsWith('http') ? nextPath : (last.path.endsWith('/') ? `${last.path}next` : `${last.path}/next`),
        method: 'GET',
        extract: { next_id: 'body.id' },
      }, envUrl),
    ],
    fallback: true,
    reason: '基于 current_steps 追加下一步 GET 探测',
  };
}

module.exports = { normalizeStep, planFromCurrentSteps };

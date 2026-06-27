/**
 * @file metricsNormalizer.js
 * @description perf_samples → 统计摘要
 */

'use strict';

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function summarize(samples) {
  if (!Array.isArray(samples) || !samples.length) {
    return {
      window_count: 0,
      avg_tps: 0,
      peak_tps: 0,
      avg_p95_ms: 0,
      max_p95_ms: 0,
      avg_error_rate: 0,
      max_error_rate: 0,
    };
  }

  const tpsList = samples.map(s => num(s.tps));
  const p95List = samples.map(s => num(s.p95_response_time_ms));
  const errList = samples.map(s => num(s.error_rate));

  const sum = arr => arr.reduce((a, b) => a + b, 0);
  const avg = arr => (arr.length ? sum(arr) / arr.length : 0);

  return {
    window_count: samples.length,
    avg_tps: Math.round(avg(tpsList) * 10) / 10,
    peak_tps: Math.round(Math.max(...tpsList) * 10) / 10,
    avg_p95_ms: Math.round(avg(p95List)),
    max_p95_ms: Math.round(Math.max(...p95List)),
    avg_error_rate: Math.round(avg(errList) * 10000) / 10000,
    max_error_rate: Math.round(Math.max(...errList) * 10000) / 10000,
  };
}

module.exports = { summarize };

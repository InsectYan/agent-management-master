/**
 * @file parseOutboxJson.js
 * @description 解析 Pi outbox.json（jsonrepair 兜底）。
 */

'use strict';

const { jsonrepair } = require('jsonrepair');

/**
 * @param {string} raw
 * @returns {Record<string, unknown>}
 */
function parseOutboxJson(raw) {
  const text = String(raw || '').trim();
  if (!text) throw new SyntaxError('outbox.json is empty');
  try {
    return JSON.parse(text);
  } catch (strictErr) {
    try {
      return JSON.parse(jsonrepair(text));
    } catch {
      throw strictErr;
    }
  }
}

module.exports = { parseOutboxJson };

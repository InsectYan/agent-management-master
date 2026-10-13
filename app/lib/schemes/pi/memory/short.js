/**
 * @file short.js
 * @description Pi 会话 jsonl 的本仓适配：压缩后按 firstKeptEntryId 截断，连续失败则归档。
 */

'use strict';

const fs = require('fs');
const path = require('path');

function failMarker(jsonlPath) {
  return `${jsonlPath}.compact-fails`;
}

/**
 * 保留 session 头，以及 id 为 firstKeptEntryId 及其后的行。
 * @param {string} jsonlPath
 * @param {string} firstKeptEntryId
 */
function truncateSessionJsonl(jsonlPath, firstKeptEntryId) {
  if (!firstKeptEntryId || !fs.existsSync(jsonlPath)) {
    return { truncated: false, kept: 0 };
  }
  const lines = fs.readFileSync(jsonlPath, 'utf-8').split(/\r?\n/).filter(line => line.length);
  let header = null;
  const entries = [];
  for (const line of lines) {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj.type === 'session' && !header) {
      header = line;
      continue;
    }
    entries.push({ line, id: obj.id });
  }
  const idx = entries.findIndex(entry => entry.id === firstKeptEntryId);
  if (idx < 0) return { truncated: false, kept: 0 };
  const kept = entries.slice(idx).map(entry => entry.line);
  const out = header ? [ header, ...kept ] : kept;
  fs.writeFileSync(jsonlPath, `${out.join('\n')}\n`, 'utf-8');
  return { truncated: true, kept: kept.length };
}

/**
 * 连续两次压缩失败后，把 jsonl 改名为带时间的归档。
 * @param {string} jsonlPath
 */
function noteCompactFailure(jsonlPath) {
  const marker = failMarker(jsonlPath);
  let count = 0;
  if (fs.existsSync(marker)) {
    count = Number(fs.readFileSync(marker, 'utf-8')) || 0;
  }
  count += 1;
  if (count >= 2 && fs.existsSync(jsonlPath)) {
    const archived = jsonlPath.replace(/\.jsonl$/, `.failed-${Date.now()}.jsonl`);
    fs.renameSync(jsonlPath, archived);
    if (fs.existsSync(marker)) fs.unlinkSync(marker);
    return { failures: count, archived };
  }
  fs.mkdirSync(path.dirname(jsonlPath), { recursive: true });
  fs.writeFileSync(marker, String(count), 'utf-8');
  return { failures: count, archived: null };
}

function resetCompactFailures(jsonlPath) {
  const marker = failMarker(jsonlPath);
  if (fs.existsSync(marker)) fs.unlinkSync(marker);
}

module.exports = {
  truncateSessionJsonl,
  noteCompactFailure,
  resetCompactFailures,
};

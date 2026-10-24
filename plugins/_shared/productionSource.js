'use strict';

function readProductionSource(params = {}) {
  const packageId = String(params.package_id || '').trim();
  const rawVersion = params.package_version;
  const hasVersion = rawVersion != null && String(rawVersion).trim() !== '';
  const copyId = params.copy_block_id != null && String(params.copy_block_id).trim() !== ''
    ? String(params.copy_block_id).trim()
    : '';
  const hasPackage = Boolean(packageId || hasVersion);
  if (hasPackage && copyId) {
    const err = new Error('故事包和本地文案不能同时作为输入');
    err.status = 400;
    throw err;
  }
  let packageVersion = null;
  if (hasPackage && hasVersion) {
    packageVersion = Number(rawVersion);
    if (!Number.isInteger(packageVersion) || packageVersion < 1) {
      const err = new Error('故事包版本不正确');
      err.status = 400;
      throw err;
    }
  }
  return {
    package_id: hasPackage ? packageId : '',
    package_version: packageVersion,
    copy_block_id: copyId,
    content_type: String(params.content_type || '').trim(),
  };
}

function readJsonObject(text) {
  const raw = String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const candidate = raw.match(/\{[\s\S]*\}/)?.[0];
    if (!candidate) return {};
    try {
      return JSON.parse(candidate);
    } catch {
      return {};
    }
  }
}

module.exports = { readProductionSource, readJsonObject };

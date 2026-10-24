'use strict';

const { readJsonObject } = require('../../_shared/productionSource');

function parseAssetStep(rawText, context = {}) {
  const parsed = readJsonObject(rawText);
  const input = context.input || {};
  const allowedAssets = new Set((Array.isArray(input.assets) ? input.assets : []).map(item => String(item.id)));
  const allowedShots = new Set((Array.isArray(input.shots) ? input.shots : []).map(item => String(item.id)));
  const suggestions = [];
  const seen = new Set();
  for (const item of Array.isArray(parsed.suggestions) ? parsed.suggestions : []) {
    const shotId = String(item?.shot_id ?? '');
    const assetId = String(item?.asset_id ?? '');
    if (!allowedShots.has(shotId) || !allowedAssets.has(assetId)) continue;
    const key = `${shotId}:${assetId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push({
      shot_id: shotId,
      asset_id: assetId,
      reason: String(item?.reason || '').trim().slice(0, 80),
    });
  }
  const reply = String(parsed.reply || parsed.summary || '').trim();
  return {
    continue: false,
    done: true,
    thinking: String(parsed.thinking || '').trim(),
    reply,
    summary: reply,
    suggestions,
  };
}

module.exports = { parseAssetStep };

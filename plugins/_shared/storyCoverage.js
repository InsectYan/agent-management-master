'use strict';

/** 只按字数给下限，不设上限。 */
function minStoryUnits(charCount) {
  const n = Math.max(0, Number(charCount) || 0);
  if (n < 800) return 1;
  if (n < 2000) return 2;
  if (n < 4000) return 4;
  if (n < 8000) return 6;
  if (n < 12000) return 8;
  return 8 + Math.ceil((n - 12000) / 2000);
}

function normalizeOmissions(value) {
  if (!Array.isArray(value)) return [];
  const list = [];
  for (const item of value) {
    const target = String(item?.target || item?.title || '').trim();
    const reason = String(item?.reason || '').trim();
    if (!reason) continue;
    list.push({ target, reason });
  }
  return list;
}

module.exports = { minStoryUnits, normalizeOmissions };

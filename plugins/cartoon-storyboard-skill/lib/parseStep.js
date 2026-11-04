'use strict';

const SHOT_SIZES = [ '极远景', '远景', '全景', '中景', '近景', '特写', '大特写' ];
const CAMERA_MOVES = [ '固定', '推', '急推', '拉', '急拉', '摇', '移', '跟', '升', '降', '甩', '震颤', '旋转' ];
const MAX_SHOTS = 12;
const DEFAULT_DURATION_SEC = 10;

function clampDurationSec(value, fallback = DEFAULT_DURATION_SEC) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(15, Math.max(8, Math.round(n)));
}

function stripThink(text) {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
}

function tryParseJsonObject(text) {
  const sources = [ stripThink(text), String(text || '') ];
  for (const raw of sources) {
    if (!raw) continue;
    try {
      return JSON.parse(raw);
    } catch {
      const candidate = raw.match(/\{[\s\S]*\}/)?.[0];
      if (!candidate) continue;
      try {
        return JSON.parse(candidate);
      } catch {
        /* try next source */
      }
    }
  }
  return null;
}

function normalizeShotSize(value) {
  const text = String(value || '').trim();
  if (SHOT_SIZES.includes(text)) return text;
  if (/大特写|极特写/.test(text)) return '大特写';
  if (/特写|微距/.test(text)) return '特写';
  if (/近景/.test(text)) return '近景';
  if (/中景|半身/.test(text)) return '中景';
  if (/全景|全身/.test(text)) return '全景';
  if (/极远|大远/.test(text)) return '极远景';
  if (/远景/.test(text)) return '远景';
  return '中景';
}

function normalizeCameraMove(value) {
  const text = String(value || '').trim();
  if (CAMERA_MOVES.includes(text)) return text;
  if (/急推|快速推/.test(text)) return '急推';
  if (/急拉|快速拉/.test(text)) return '急拉';
  if (/推/.test(text)) return '推';
  if (/拉/.test(text)) return '拉';
  if (/摇/.test(text)) return '摇';
  if (/移|横移/.test(text)) return '移';
  if (/跟/.test(text)) return '跟';
  if (/升/.test(text)) return '升';
  if (/降/.test(text)) return '降';
  if (/甩/.test(text)) return '甩';
  if (/震|抖/.test(text)) return '震颤';
  if (/旋|环绕/.test(text)) return '旋转';
  return '固定';
}

function parseStoryboardStep(rawText, meta = {}) {
  const parsed = tryParseJsonObject(rawText) || {};
  const expandOne = meta?.input?.expand_one === true
    || meta?.input?.expand_one === 'true'
    || meta?.input?.expand_one === 1
    || meta?.input?.expand_one === '1';
  const seedDuration = clampDurationSec(meta?.input?.seed_shot?.duration_sec, DEFAULT_DURATION_SEC);
  const limit = expandOne ? 1 : MAX_SHOTS;
  const shots = Array.isArray(parsed.shots) ? parsed.shots.slice(0, limit).map(item => ({
    description: String(item?.description || '').trim(),
    duration_sec: clampDurationSec(item?.duration_sec, expandOne ? seedDuration : DEFAULT_DURATION_SEC),
    shot_size: normalizeShotSize(item?.shot_size),
    camera_move: normalizeCameraMove(item?.camera_move),
    dialogue: String(item?.dialogue || '').trim(),
  })).filter(item => item.description) : [];
  const reply = String(parsed.reply || parsed.summary || '').trim() || `拆出 ${shots.length} 段剧情`;
  return {
    continue: false,
    done: true,
    thinking: String(parsed.thinking || '').trim(),
    reply,
    summary: reply,
    shots,
  };
}

module.exports = { parseStoryboardStep, clampDurationSec };

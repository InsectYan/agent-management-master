'use strict';

const SHOT_SIZES = [ '远景', '全景', '中景', '近景', '特写' ];
const CAMERA_MOVES = [ '固定', '推', '拉', '摇', '跟', '升', '降' ];

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

function parseStoryboardStep(rawText) {
  const parsed = tryParseJsonObject(rawText) || {};
  const shots = Array.isArray(parsed.shots) ? parsed.shots.slice(0, 6).map(item => ({
    description: String(item?.description || '').trim(),
    shot_size: SHOT_SIZES.includes(item?.shot_size) ? item.shot_size : '中景',
    camera_move: CAMERA_MOVES.includes(item?.camera_move) ? item.camera_move : '固定',
  })).filter(item => item.description) : [];
  const reply = String(parsed.reply || parsed.summary || '').trim() || `拆出 ${shots.length} 镜`;
  return {
    continue: false,
    done: true,
    thinking: String(parsed.thinking || '').trim(),
    reply,
    summary: reply,
    shots,
  };
}

module.exports = { parseStoryboardStep };

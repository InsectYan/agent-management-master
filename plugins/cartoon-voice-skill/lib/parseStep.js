'use strict';

const { readJsonObject } = require('../../_shared/productionSource');

function parseVoiceStep(rawText, context = {}) {
  const parsed = readJsonObject(rawText);
  const input = context.input || {};
  const voiceKey = String(input.voice_key || '');
  const shots = new Map((Array.isArray(input.shots) ? input.shots : []).map(item => [ String(item.id), item ]));
  const cues = [];
  const used = [];
  for (const item of Array.isArray(parsed.cues) ? parsed.cues : []) {
    const shot = shots.get(String(item?.shot_id ?? ''));
    if (!shot) continue;
    const duration = Number(shot.duration_ms) > 0 ? Number(shot.duration_ms) : 3000;
    let start = Number(item?.start_ms);
    let end = Number(item?.end_ms);
    if (!Number.isFinite(start) || start < 0) start = 0;
    if (!Number.isFinite(end) || end > duration) end = duration;
    if (end <= start) {
      start = 0;
      end = duration;
    }
    const overlaps = used.some(row => row.shot_id === String(shot.id) && start < row.end_ms && end > row.start_ms);
    if (overlaps) continue;
    const dialogue = String(shot.dialogue || '').trim();
    used.push({ shot_id: String(shot.id), start_ms: start, end_ms: end });
    cues.push({
      shot_id: String(shot.id),
      text: dialogue || String(item?.text || '').trim().slice(0, 200),
      start_ms: start,
      end_ms: end,
      voice_key: voiceKey,
    });
  }
  const reply = String(parsed.reply || parsed.summary || '').trim();
  return {
    continue: false,
    done: true,
    thinking: String(parsed.thinking || '').trim(),
    reply,
    summary: reply,
    cues,
  };
}

module.exports = { parseVoiceStep };

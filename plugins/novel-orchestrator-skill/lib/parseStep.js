'use strict';

function stripThink(text) {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
}

function tryParseJsonObject(text) {
  const sources = [stripThink(text), String(text || '')];
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
        /* try next */
      }
    }
  }
  return null;
}

const DROP_BODY_KEYS = [
  'title', 'creative_intent', 'summary',
  'era', 'geography', 'social_rules', 'power_system', 'technology', 'history_notes', 'timeline',
  'characters', 'character_edges',
  'volumes', 'word_targets', 'outline',
  'chapters',
];

function liftPatch(parsed = {}) {
  const patch = parsed.patch && typeof parsed.patch === 'object' && !Array.isArray(parsed.patch)
    ? { ...parsed.patch }
    : {};
  if (!patch.tasks && Array.isArray(parsed.tasks)) patch.tasks = parsed.tasks;
  for (const key of DROP_BODY_KEYS) {
    delete patch[key];
  }
  return patch;
}

function parsePlanStep(rawText) {
  const parsed = tryParseJsonObject(rawText) || {};
  const patch = liftPatch(parsed);
  const n = Array.isArray(patch.tasks) ? patch.tasks.length : 0;
  const reply = String(parsed.reply || parsed.summary || '').trim()
    || (n ? `已拆成 ${n} 步，可执行下一步。` : '')
    || stripThink(rawText).slice(0, 800);
  return {
    continue: false,
    done: true,
    thinking: String(parsed.thinking || '').trim(),
    reply,
    summary: reply,
    target_fields: Array.isArray(parsed.target_fields) ? parsed.target_fields : ['tasks'],
    patch,
  };
}

module.exports = {
  tryParseJsonObject,
  parsePlanStep,
  stripThink,
};

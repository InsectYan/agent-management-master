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
        /* try next source */
      }
    }
  }
  return null;
}

const BASIC_KEYS = [
  'title',
  'creative_intent',
  'summary',
  'genre_path',
  'genre_category_id',
  'genre_subcategory_id',
  'theme_ids',
  'length_id',
  'audience_id',
  'update_pace_id',
];

const WORLD_KEYS = [
  'era',
  'geography',
  'social_rules',
  'power_system',
  'technology',
  'history_notes',
  'timeline',
];

const CHAR_KEYS = ['characters', 'character_edges'];

function liftPatch(parsed = {}) {
  const patch = parsed.patch && typeof parsed.patch === 'object' && !Array.isArray(parsed.patch)
    ? { ...parsed.patch }
    : {};
  for (const key of [...BASIC_KEYS, ...WORLD_KEYS, ...CHAR_KEYS]) {
    if (parsed[key] !== undefined && patch[key] === undefined) {
      patch[key] = parsed[key];
    }
  }
  return patch;
}

function fallbackReply(patch) {
  if (patch.title) return `建议书名：${patch.title}`;
  if (Array.isArray(patch.characters) && patch.characters.length) {
    return `已整理 ${patch.characters.length} 个角色，可应用到表单。`;
  }
  if (Array.isArray(patch.character_edges) && patch.character_edges.length) {
    return `已补 ${patch.character_edges.length} 条人物关系，可应用到表单。`;
  }
  if (Array.isArray(patch.timeline) && patch.timeline.length) {
    return `已补 ${patch.timeline.length} 条时间轴节点，可应用到表单。`;
  }
  const worldHit = WORLD_KEYS.find((key) => key !== 'timeline' && patch[key]);
  if (worldHit) return '已写好世界观相关段落，可应用到表单。';
  return '';
}

function parseWriterStep(rawText) {
  const parsed = tryParseJsonObject(rawText) || {};
  const patch = liftPatch(parsed);
  const reply = String(parsed.reply || parsed.summary || '').trim()
    || fallbackReply(patch)
    || stripThink(rawText).slice(0, 800);
  const thinking = String(parsed.thinking || '').trim();
  const target_fields = Array.isArray(parsed.target_fields) ? parsed.target_fields : Object.keys(patch);
  return {
    continue: false,
    done: true,
    thinking,
    reply,
    summary: reply,
    target_fields,
    patch,
  };
}

module.exports = {
  tryParseJsonObject,
  parseWriterStep,
  BASIC_KEYS,
  WORLD_KEYS,
  CHAR_KEYS,
  stripThink,
};

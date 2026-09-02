'use strict';

let jsonrepairFn = null;
try {
  jsonrepairFn = require('jsonrepair').jsonrepair;
} catch {
  jsonrepairFn = null;
}

function stripThink(text) {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
}

function extractBalancedObjects(text) {
  const src = String(text || '');
  const out = [];
  for (let i = 0; i < src.length; i += 1) {
    if (src[i] !== '{') continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let j = i; j < src.length; j += 1) {
      const ch = src[j];
      if (inStr) {
        if (esc) {
          esc = false;
          continue;
        }
        if (ch === '\\') {
          esc = true;
          continue;
        }
        if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') {
        inStr = true;
        continue;
      }
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          const slice = src.slice(i, j + 1);
          try {
            const parsed = JSON.parse(slice);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              out.push(parsed);
            }
          } catch {
            /* skip broken slice */
          }
          i = j;
          break;
        }
      }
    }
  }
  return out;
}

function scoreSkillObject(obj) {
  let score = 0;
  if (obj.patch && typeof obj.patch === 'object' && Object.keys(obj.patch).length) score += 10;
  if (obj.reply) score += 3;
  if (obj.done != null) score += 2;
  if (obj.thinking) score += 1;
  if (obj.target_fields) score += 1;
  return score;
}

function tryParseJsonObject(text) {
  const sources = [stripThink(text), String(text || '')];
  for (const raw of sources) {
    if (!raw) continue;
    const objects = extractBalancedObjects(raw);
    if (objects.length) {
      objects.sort((a, b) => scoreSkillObject(b) - scoreSkillObject(a));
      return objects[0];
    }
    try {
      return JSON.parse(raw);
    } catch {
      try {
        if (typeof jsonrepairFn === 'function') {
          const repaired = JSON.parse(jsonrepairFn(raw));
          if (repaired && typeof repaired === 'object' && !Array.isArray(repaired)) return repaired;
        }
      } catch {
        /* next source */
      }
    }
  }
  return null;
}

function unescapeJsonString(raw) {
  return String(raw || '')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

/**
 * 从截断 JSON 里抢救 "body" 字符串（含 patch.body）。
 * @param {string} text
 * @returns {string}
 */
function salvageBodyFromTruncated(text) {
  const src = stripThink(text);
  let from = 0;
  const patchIdx = src.indexOf('"patch"');
  if (patchIdx >= 0) from = patchIdx;
  const bodyKey = '"body"';
  const idx = src.indexOf(bodyKey, from);
  if (idx < 0) return '';
  const colon = src.indexOf(':', idx + bodyKey.length);
  if (colon < 0) return '';
  let i = colon + 1;
  while (i < src.length && /\s/.test(src[i])) i += 1;
  if (src[i] !== '"') return '';
  i += 1;
  let out = '';
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\' && i + 1 < src.length) {
      out += ch + src[i + 1];
      i += 2;
      continue;
    }
    if (ch === '"') break;
    out += ch;
    i += 1;
  }
  const body = unescapeJsonString(out).trim();
  return body.length >= 40 ? body : '';
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
const OUTLINE_KEYS = ['volumes'];
const CHAPTER_KEYS = ['chapters'];
const FACTION_KEYS = ['factions'];
const CHAPTER_BODY_KEYS = ['body'];

function liftPatch(parsed = {}) {
  const patch = parsed.patch && typeof parsed.patch === 'object' && !Array.isArray(parsed.patch)
    ? { ...parsed.patch }
    : {};
  for (const key of [...BASIC_KEYS, ...WORLD_KEYS, ...CHAR_KEYS, ...OUTLINE_KEYS, ...CHAPTER_KEYS, ...FACTION_KEYS, ...CHAPTER_BODY_KEYS]) {
    if (parsed[key] !== undefined && patch[key] === undefined) {
      patch[key] = parsed[key];
    }
  }
  if (!patch.volumes && parsed.outline && Array.isArray(parsed.outline.volumes)) {
    patch.volumes = parsed.outline.volumes;
  }
  if (!patch.chapters && parsed.content && Array.isArray(parsed.content.chapters)) {
    patch.chapters = parsed.content.chapters;
  }
  return patch;
}

function fallbackReply(patch) {
  if (patch.title) return `建议书名：${patch.title}`;
  if (Array.isArray(patch.volumes) && patch.volumes.length) {
    return `已整理 ${patch.volumes.length} 卷大纲，可应用到表单。`;
  }
  if (Array.isArray(patch.factions) && patch.factions.length) {
    return `已整理 ${patch.factions.length} 个门派组织，可应用到表单。`;
  }
  if (typeof patch.body === 'string' && patch.body.trim()) {
    return '已写好本章正文，可应用到编辑区。';
  }
  if (Array.isArray(patch.chapters) && patch.chapters.length) {
    return `已整理 ${patch.chapters.length} 个章节标签，可应用到表单。`;
  }
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
  if (typeof patch.body !== 'string' || !patch.body.trim()) {
    const salvaged = salvageBodyFromTruncated(rawText);
    if (salvaged) patch.body = salvaged;
  }
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
  salvageBodyFromTruncated,
  BASIC_KEYS,
  WORLD_KEYS,
  CHAR_KEYS,
  OUTLINE_KEYS,
  CHAPTER_KEYS,
  stripThink,
};

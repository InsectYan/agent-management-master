'use strict';

const { normalizeOmissions } = require('../../_shared/storyCoverage');

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
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      const candidate = raw.match(/\{[\s\S]*\}/)?.[0];
      if (!candidate) continue;
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch {
        /* try next source */
      }
    }
  }
  return null;
}

function unescapeJsonString(body) {
  return body.replace(/\\(u[0-9a-fA-F]{4}|["\\/bfnrt])/g, (all, token) => {
    if (token[0] === 'u') return String.fromCharCode(parseInt(token.slice(1), 16));
    return ({ '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' })[token] || token;
  });
}

function readOneJsonString(text, at, key) {
  let i = text.indexOf(':', at + key.length);
  if (i < 0) return '';
  i += 1;
  while (i < text.length && /\s/.test(text[i])) i += 1;
  if (text[i] !== '"') return '';
  i += 1;
  let raw = '';
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      raw += ch + (text[i + 1] || '');
      i += text[i + 1] ? 2 : 1;
      continue;
    }
    if (ch === '"') break;
    raw += ch;
    i += 1;
  }
  return unescapeJsonString(raw).trim();
}

function sceneFrom(item) {
  const title = String(item?.title || item?.place || item?.location || '').trim();
  const summary = String(item?.summary || item?.content || item?.body || item?.text || '').trim();
  if (!title && !summary) return null;
  return { title, summary };
}

function scenesFromList(list) {
  if (!Array.isArray(list)) return [];
  return list.map(sceneFrom).filter(Boolean);
}

/** JSON 被对白引号截断时，按 title / summary 把已经写出的场次拣回来。 */
function salvageScenes(text) {
  const source = String(text || '');
  const scenes = [];
  let from = 0;
  while (from < source.length) {
    const at = source.indexOf('"title"', from);
    if (at < 0) break;
    const title = readOneJsonString(source, at, '"title"');
    const nextTitle = source.indexOf('"title"', at + 7);
    const summaryAt = source.indexOf('"summary"', at + 7);
    const summary = summaryAt >= 0 && (nextTitle < 0 || summaryAt < nextTitle)
      ? readOneJsonString(source, summaryAt, '"summary"')
      : '';
    if (title || summary) scenes.push({ title, summary });
    from = at + 7;
  }
  return scenes;
}

function scriptDataOf(parsed) {
  const raw = parsed?.script_data;
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      const again = JSON.parse(raw);
      if (again && typeof again === 'object') return again;
    } catch {
      /* ignore */
    }
  }
  return {};
}

function parseScriptStep(rawText) {
  const parsed = tryParseJsonObject(rawText) || {};
  const data = scriptDataOf(parsed);
  const characters = Array.isArray(data.characters) ? data.characters.map(item => ({
    name: String(item?.name || '').trim(),
    look: String(item?.look || item?.appearance || '').trim(),
  })).filter(item => item.name) : [];
  let scenes = scenesFromList(data.scenes);
  if (!scenes.length) scenes = scenesFromList(parsed.scenes);
  if (!scenes.length) scenes = salvageScenes(rawText);
  const reply = String(parsed.reply || parsed.summary || data.summary || '').trim();
  return {
    continue: false,
    done: true,
    thinking: String(parsed.thinking || '').trim(),
    reply,
    summary: reply,
    script_data: {
      summary: String(data.summary || reply).trim(),
      characters,
      scenes,
      omissions: normalizeOmissions(data.omissions != null ? data.omissions : parsed.omissions),
    },
  };
}

module.exports = { parseScriptStep };

'use strict';

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

function parseScriptStep(rawText) {
  const parsed = tryParseJsonObject(rawText) || {};
  const data = parsed.script_data && typeof parsed.script_data === 'object' ? parsed.script_data : {};
  const characters = Array.isArray(data.characters) ? data.characters.slice(0, 4).map(item => ({
    name: String(item?.name || '').trim(),
    look: String(item?.look || '').trim(),
  })).filter(item => item.name) : [];
  const scenes = Array.isArray(data.scenes) ? data.scenes.slice(0, 4).map(item => ({
    title: String(item?.title || '').trim(),
    summary: String(item?.summary || '').trim(),
  })).filter(item => item.title || item.summary) : [];
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
    },
  };
}

module.exports = { parseScriptStep };

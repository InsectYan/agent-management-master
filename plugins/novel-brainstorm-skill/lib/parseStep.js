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

function parseBrainstormStep(rawText) {
  const parsed = tryParseJsonObject(rawText) || {};
  const sparks = Array.isArray(parsed.sparks)
    ? parsed.sparks.map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
    : [];
  const reply = String(parsed.reply || parsed.summary || '').trim()
    || (sparks.length ? sparks.map((s, i) => `${i + 1}. ${s}`).join('\n') : '')
    || stripThink(rawText).slice(0, 800);
  return {
    continue: false,
    done: true,
    thinking: String(parsed.thinking || '').trim(),
    reply,
    summary: reply,
    sparks,
    suggested_fields: Array.isArray(parsed.suggested_fields) ? parsed.suggested_fields : [],
  };
}

module.exports = { parseBrainstormStep };

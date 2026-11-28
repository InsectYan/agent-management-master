'use strict';

function stripThink(text) {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
}

function tryParseJsonObject(text) {
  const raw = stripThink(text);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    const candidate = raw.match(/\{[\s\S]*\}/)?.[0];
    if (!candidate) return null;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

function scriptTextOf(rawText) {
  const parsed = tryParseJsonObject(rawText);
  const fromField = String(parsed?.script_text || '').trim();
  if (fromField) return fromField;
  const stripped = stripThink(rawText);
  if (!stripped || stripped.startsWith('{')) return '';
  return stripped;
}

function parseNovelScriptStep(rawText) {
  const scriptText = scriptTextOf(rawText);
  const ok = scriptText.length >= 20;
  const reply = ok ? '已把小说转成剧本' : '没有得到剧本正文';
  return {
    continue: !ok,
    done: ok,
    thinking: '',
    reply,
    summary: reply,
    script_text: scriptText,
  };
}

module.exports = { parseNovelScriptStep };

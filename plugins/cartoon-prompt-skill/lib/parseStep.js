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

function parsePromptStep(rawText) {
  const parsed = tryParseJsonObject(rawText) || {};
  const prompts = Array.isArray(parsed.prompts) ? parsed.prompts.slice(0, 6).map((item, index) => ({
    index: Number.isInteger(item?.index) ? item.index : index,
    positive_zh: String(item?.positive_zh || '').trim(),
    negative_zh: String(item?.negative_zh || '').trim(),
  })).filter(item => item.positive_zh) : [];
  const reply = String(parsed.reply || parsed.summary || '').trim() || `写了 ${prompts.length} 条提示词`;
  return {
    continue: false,
    done: true,
    thinking: String(parsed.thinking || '').trim(),
    reply,
    summary: reply,
    prompts,
  };
}

module.exports = { parsePromptStep };

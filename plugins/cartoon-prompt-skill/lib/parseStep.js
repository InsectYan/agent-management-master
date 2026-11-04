'use strict';

const MAX_PROMPTS = 24;

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

function mergeProductionNote(positive, note) {
  const body = String(positive || '').trim();
  const extra = String(note || '').trim();
  if (!extra) return body;
  if (!body) return `【后期与对白备注】\n${extra}`;
  if (body.includes('【后期与对白备注】') || body.includes(extra)) return body;
  return `${body}\n\n【后期与对白备注】\n${extra}`;
}

function parsePromptStep(rawText) {
  const parsed = tryParseJsonObject(rawText) || {};
  const prompts = Array.isArray(parsed.prompts) ? parsed.prompts.slice(0, MAX_PROMPTS).map((item, index) => {
    const positive = mergeProductionNote(item?.positive_zh, item?.production_note);
    return {
      index: Number.isInteger(item?.index) ? item.index : index,
      positive_zh: positive,
      negative_zh: String(item?.negative_zh || '').trim(),
      production_note: String(item?.production_note || '').trim(),
    };
  }).filter(item => item.positive_zh) : [];
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

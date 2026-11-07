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
  return unescapeJsonString(raw).replace(/\n*【后期与对白备注】[\s\S]*$/u, '').trim();
}

/** JSON 被截断或夹了空模板时，取该字段里最长的一段。 */
function readJsonStringField(text, field) {
  const source = String(text || '');
  const key = `"${field}"`;
  let from = 0;
  let best = '';
  while (from < source.length) {
    const at = source.indexOf(key, from);
    if (at < 0) break;
    const value = readOneJsonString(source, at, key);
    if (value.length > best.length) best = value;
    from = at + key.length;
  }
  return best;
}

function parsePromptStep(rawText) {
  const parsed = tryParseJsonObject(rawText) || {};
  let prompts = Array.isArray(parsed.prompts) ? parsed.prompts.map((item, index) => {
    const positive = String(item?.positive_zh || '').replace(/\n*【后期与对白备注】[\s\S]*$/u, '').trim();
    return {
      index: Number.isInteger(item?.index) ? item.index : index,
      positive_zh: positive,
      negative_zh: String(item?.negative_zh || '').trim(),
      production_note: String(item?.production_note || '').trim(),
    };
  }).filter(item => item.positive_zh || item.negative_zh) : [];
  if (!prompts.some(item => item.positive_zh)) {
    const positive = readJsonStringField(rawText, 'positive_zh');
    if (positive) {
      prompts = [{
        index: 0,
        positive_zh: positive,
        negative_zh: readJsonStringField(rawText, 'negative_zh'),
        production_note: readJsonStringField(rawText, 'production_note'),
      }];
    }
  }
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

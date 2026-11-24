'use strict';

const { readJsonObject } = require('../../_shared/productionSource');

function readField(rawText, key) {
  const source = String(rawText || '');
  const matched = source.match(new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`));
  if (!matched) return '';
  return matched[1]
    .replace(/\\n/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDescStep(rawText) {
  const parsed = readJsonObject(rawText);
  const description = String(
    parsed.description || parsed.prompt || readField(rawText, 'description') || readField(rawText, 'prompt') || '',
  ).replace(/\s+/g, ' ').trim();
  const reply = String(parsed.reply || parsed.summary || description).trim();
  return {
    continue: false,
    done: true,
    thinking: String(parsed.thinking || '').trim(),
    reply,
    summary: reply,
    description,
    prompt: description,
  };
}

module.exports = { parseDescStep };

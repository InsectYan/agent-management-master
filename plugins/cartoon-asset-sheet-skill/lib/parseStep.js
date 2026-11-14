'use strict';

const { readJsonObject } = require('../../_shared/productionSource');

function readPromptField(rawText) {
  const source = String(rawText || '');
  const matched = source.match(/"prompt"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (!matched) return '';
  return matched[1]
    .replace(/\\n/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSheetStep(rawText) {
  const parsed = readJsonObject(rawText);
  const prompt = String(parsed.prompt || readPromptField(rawText) || '').replace(/\s+/g, ' ').trim();
  const reply = String(parsed.reply || parsed.summary || prompt).trim();
  return {
    continue: false,
    done: true,
    thinking: String(parsed.thinking || '').trim(),
    reply,
    summary: reply,
    prompt,
  };
}

module.exports = { parseSheetStep };

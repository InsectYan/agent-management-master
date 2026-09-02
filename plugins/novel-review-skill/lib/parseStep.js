'use strict';

function tryParseJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function parseReviewStep(text) {
  const parsed = tryParseJson(text) || {};
  const findings = Array.isArray(parsed.findings)
    ? parsed.findings
    : (Array.isArray(parsed.patch?.findings) ? parsed.patch.findings : []);
  return {
    done: true,
    continue: false,
    thinking: parsed.thinking || '',
    reply: parsed.reply || parsed.summary || '',
    summary: parsed.summary || parsed.reply || '',
    findings,
  };
}

module.exports = { parseReviewStep };

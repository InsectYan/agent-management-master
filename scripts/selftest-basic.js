/**
 * @file selftest-basic.js
 * @description 无 UI 冒烟测试：health、schemes、plugins、四方案 Skill invoke。
 *              用法：先 npm run dev，再 npm run selftest
 */

'use strict';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3001';

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 200);
  }
  return { status: res.status, body };
}

async function postJson(path, data) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 200);
  }
  return { status: res.status, body };
}

/** 占位回复前缀（LLM 不可用时） */
const PLACEHOLDER_MARKERS = [ '【开发模式】', '【LLM 错误】', '[Loop 占位]', '[ReAct 占位]', '[Pi 方案占位]', '[LangChain 方案占位]' ];

function isRealReply(text) {
  if (!text || typeof text !== 'string') return false;
  return !PLACEHOLDER_MARKERS.some(m => text.includes(m));
}

async function main() {
  console.log('=== agent-management selftest (Phase 2-4) ===\n');

  const health = await getJson('/health');
  console.log('[health]', health.status, health.body);

  const ready = await getJson('/ready');
  console.log('[ready]', ready.status, ready.body);

  const schemes = await getJson('/api/schemes');
  const schemeList = schemes.body.schemes || [];
  console.log('[schemes]', schemes.status, schemeList.length, '个方案');
  const allSchemesReady = schemeList.every(s => s.ready === true);
  console.log('[schemes ready]', allSchemesReady, schemeList.map(s => `${s.id}:${s.ready}`).join(', '));

  const plugins = await getJson('/api/plugins');
  console.log('[plugins]', plugins.status, plugins.body.count, '个 Skill');

  const names = [ 'weather-skill', 'note-skill', 'research-skill', 'qa-skill' ];
  for (const name of names) {
    const p = plugins.body.plugins?.find(x => x.name === name);
    console.log(`[${name}]`, p ? { scheme: p.scheme, hasSkillDoc: p.hasSkillDoc, dbTables: p.dbTables } : 'MISSING');
  }

  const weather = await getJson('/api/skills/weather?city=Shanghai');
  console.log('[weather query]', weather.status, {
    reply: weather.body?.reply?.slice(0, 80),
    persisted: weather.body?.meta?.persisted,
    tools: weather.body?.meta?.tools_used,
  });

  const note = await postJson('/api/skills/note-skill/invoke', {
    message: '你好，selftest Phase2',
    session_id: 'selftest',
  });
  console.log('[note-skill invoke]', note.status, {
    reply: note.body?.reply?.slice(0, 80),
    persisted: note.body?.meta?.persisted,
    scheme: note.body?.scheme,
  });

  const research = await postJson('/api/skills/research-skill/invoke', {
    topic: 'Egg.js 插件生命周期',
    action: 'research',
  });
  console.log('[research-skill]', research.status, {
    reply: research.body?.reply?.slice(0, 80),
    steps: research.body?.output?.steps?.length,
    persisted: research.body?.meta?.persisted,
  });

  const qa = await postJson('/api/skills/qa-skill/invoke', {
    message: '计算 (10+5)*2',
    action: 'ask',
  });
  console.log('[qa-skill]', qa.status, {
    reply: qa.body?.reply?.slice(0, 80),
    iterations: qa.body?.meta?.iterations,
    persisted: qa.body?.meta?.persisted,
  });

  const ok =
    health.status === 200 &&
    ready.status === 200 &&
    allSchemesReady &&
    plugins.body.count >= 4 &&
    weather.status === 200 &&
    weather.body?.meta?.persisted === true &&
    note.status === 200 &&
    note.body?.meta?.persisted === true &&
    note.body?.scheme === 'pi' &&
    research.status === 200 &&
    research.body?.meta?.persisted === true &&
    research.body?.scheme === 'loop' &&
    qa.status === 200 &&
    qa.body?.meta?.persisted === true &&
    qa.body?.scheme === 'react';

  const llmHint = isRealReply(note.body?.reply)
    ? 'LLM 已连通（真实回复）'
    : 'LLM 未连通（占位/兜底回复，配置 Ollama 后可获真实回复）';
  console.log('\n[LLM]', llmHint);
  console.log('\n=== 结果:', ok ? 'PASS' : 'FAIL', '===');
  process.exit(ok ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

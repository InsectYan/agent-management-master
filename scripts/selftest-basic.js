/**
 * @file selftest-basic.js
 * @description 无 UI 冒烟测试：health、schemes、plugins、SKILL.md、建表落库、Skill invoke。
 *              用法：先 npm run dev，再 node scripts/selftest-basic.js
 */

'use strict';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3001';

/**
 * 发起 GET 请求并解析 JSON
 * @param {string} path
 * @returns {Promise<{ status: number, body: unknown }>}
 */
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

/**
 * 发起 POST JSON 请求
 * @param {string} path
 * @param {Object} data
 */
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

async function main() {
  console.log('=== agent-management selftest ===\n');

  const health = await getJson('/health');
  console.log('[health]', health.status, health.body);

  const ready = await getJson('/ready');
  console.log('[ready]', ready.status, ready.body);

  const schemes = await getJson('/api/schemes');
  console.log('[schemes]', schemes.status, schemes.body.schemes?.length, '个方案');

  const plugins = await getJson('/api/plugins');
  console.log('[plugins]', plugins.status, plugins.body.count, '个 Skill');

  const weatherPlugin = plugins.body.plugins?.find(p => p.name === 'weather-skill');
  const notePlugin = plugins.body.plugins?.find(p => p.name === 'note-skill');
  console.log('[weather-skill meta]', {
    dbTables: weatherPlugin?.dbTables,
    hasSkillDoc: weatherPlugin?.hasSkillDoc,
    actions: weatherPlugin?.skillActions?.map(a => a.id),
  });
  console.log('[note-skill meta]', {
    dbTables: notePlugin?.dbTables,
    hasSkillDoc: notePlugin?.hasSkillDoc,
    actions: notePlugin?.skillActions?.map(a => a.id),
  });

  const weatherDoc = await getJson('/api/plugins/weather-skill/skill-doc');
  console.log('[weather SKILL.md]', weatherDoc.status, weatherDoc.body?.actions?.length, '个动作');

  const weather = await getJson('/api/skills/weather?city=Shanghai');
  console.log('[weather query]', weather.status, {
    reply: weather.body?.reply?.slice(0, 80),
    persisted: weather.body?.meta?.persisted,
    history_id: weather.body?.meta?.history_id,
  });

  const weatherHistory = await getJson('/api/skills/weather?city=Shanghai&action=history');
  console.log('[weather history]', weatherHistory.status, weatherHistory.body?.reply?.slice(0, 80));

  const note = await postJson('/api/skills/note-skill/invoke', {
    message: '你好，selftest',
    session_id: 'selftest',
  });
  console.log('[note-skill invoke]', note.status, {
    reply: note.body?.reply?.slice(0, 80),
    persisted: note.body?.meta?.persisted,
    entry_id: note.body?.meta?.entry_id,
  });

  const noteList = await postJson('/api/skills/note-skill/invoke', {
    action: 'list',
    session_id: 'selftest',
  });
  console.log('[note-skill list]', noteList.status, noteList.body?.reply?.slice(0, 80));

  const ok =
    health.status === 200 &&
    ready.status === 200 &&
    weatherPlugin?.hasSkillDoc === true &&
    notePlugin?.hasSkillDoc === true &&
    weatherPlugin?.dbTables?.includes('weather_history') &&
    notePlugin?.dbTables?.includes('note_entries') &&
    weatherDoc.status === 200 &&
    weather.status === 200 &&
    weather.body?.meta?.persisted === true &&
    note.status === 200 &&
    note.body?.meta?.persisted === true &&
    noteList.status === 200;

  console.log('\n=== 结果:', ok ? 'PASS' : 'FAIL', '===');
  process.exit(ok ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

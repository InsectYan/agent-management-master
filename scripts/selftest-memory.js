/**
 * @file selftest-memory.js
 * @description Phase 5 记忆引擎冒烟：file + vector 读写。
 */

'use strict';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4001';

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, body: await res.json() };
}

async function postJson(path, data) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return { status: res.status, body: await res.json() };
}

async function main() {
  console.log('=== selftest-memory ===\n');

  const list = await getJson('/api/memory');
  console.log('[memory list]', list.status, list.body.skills);

  const noteAppend = await postJson('/api/memory/note-skill/append', {
    text: 'selftest 偏好：回复尽量简短',
    section: '偏好',
  });
  console.log('[note append]', noteAppend.status, noteAppend.body.type);

  const noteRead = await getJson('/api/memory/note-skill');
  const hasNote = String(noteRead.body.content || '').includes('selftest');
  console.log('[note read]', noteRead.status, hasNote);

  const noteSearch = await postJson('/api/memory/note-skill/search', {
    query: '简短',
    limit: 3,
  });
  console.log('[note search]', noteSearch.status, noteSearch.body.results?.length);

  const researchAppend = await postJson('/api/memory/research-skill/append', {
    text: 'Egg.js 插件生命周期：beforeStart 加载',
  });
  console.log('[research append]', researchAppend.status, researchAppend.body.type);

  const researchSearch = await postJson('/api/memory/research-skill/search', {
    query: 'Egg.js',
    limit: 3,
  });
  console.log('[research search]', researchSearch.status, researchSearch.body.results?.length);

  const ok =
    list.status === 200 &&
    list.body.skills?.length >= 2 &&
    noteAppend.status === 200 &&
    hasNote &&
    noteSearch.status === 200 &&
    researchAppend.status === 200 &&
    researchSearch.status === 200 &&
    (researchSearch.body.results?.length || 0) >= 1;

  console.log('\n=== 结果:', ok ? 'PASS' : 'FAIL', '===');
  process.exit(ok ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

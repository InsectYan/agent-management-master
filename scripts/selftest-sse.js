/**
 * @file selftest-sse.js
 * @description Phase 5 SSE 流式冒烟：note-skill /stream 路由。
 */

'use strict';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3001';

async function main() {
  console.log('=== selftest-sse ===\n');

  const res = await fetch(`${BASE}/api/skills/note/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'SSE selftest 你好',
      session_id: 'sse-test',
    }),
  });

  if (!res.ok) {
    console.error('[sse] HTTP', res.status);
    process.exit(1);
  }

  const text = await res.text();
  const hasStatus = text.includes('event: status');
  const hasDone = text.includes('event: done');
  const hasError = text.includes('event: error');

  console.log('[sse events]', {
    status: hasStatus,
    done: hasDone,
    error: hasError,
    bytes: text.length,
  });
  console.log('[sse snippet]', text.slice(0, 300));

  const ok = hasStatus && hasDone && !hasError;
  console.log('\n=== 结果:', ok ? 'PASS' : 'FAIL', '===');
  process.exit(ok ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

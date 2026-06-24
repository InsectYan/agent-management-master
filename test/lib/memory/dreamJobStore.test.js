'use strict';

const { strict: assert } = require('node:assert');
const { upsertDreamJob, claimNextDreamJob } = require('../../../app/lib/memory/dreamJobStore');

describe('test/lib/memory/dreamJobStore.test.js', () => {
  it('非 PostgreSQL 时 upsert 跳过', async () => {
    const r = await upsertDreamJob({
      skillName: 'note-skill',
      sessionId: 's1',
    });
    assert.equal(r.skipped, true);
    assert.equal(r.job_id, null);
  });

  it('非 PostgreSQL 时 claim 返回 null', async () => {
    const job = await claimNextDreamJob('worker-1');
    assert.equal(job, null);
  });
});

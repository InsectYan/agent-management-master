'use strict';

const { strict: assert } = require('node:assert');
const { app } = require('egg-mock/bootstrap');

describe('test/app/controller/health.test.js', () => {
  it('GET /health 200', async () => {
    const res = await app.httpRequest().get('/health').expect(200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.service, 'agent-management-master');
    assert.ok(Array.isArray(res.body.schemes));
    assert.ok(res.body.skill_count >= 4);
  });

  it('GET /ready 200 平台就绪', async () => {
    const res = await app.httpRequest().get('/ready').expect(200);
    assert.equal(res.body.status, 'ready');
    assert.ok(res.body.schemes.length >= 4);
    assert.ok(res.body.skills.some(s => s.name === 'note-skill'));
    assert.ok(Array.isArray(res.body.memory));
  });

  it('GET /api/schemes 列出方案', async () => {
    const res = await app.httpRequest().get('/api/schemes').expect(200);
    assert.ok(res.body.schemes.length >= 4);
  });

  it('GET /api/plugins 列出 Skill', async () => {
    const res = await app.httpRequest().get('/api/plugins').expect(200);
    assert.ok(res.body.plugins.length >= 4);
  });
});

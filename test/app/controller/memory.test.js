'use strict';

const { strict: assert } = require('node:assert');
const { app } = require('egg-mock/bootstrap');

describe('test/app/controller/memory.test.js', () => {
  it('GET /api/memory 列出记忆 Skill', async () => {
    const res = await app.httpRequest().get('/api/memory').expect(200);
    assert.ok(res.body.skills.length >= 2);
  });

  it('POST append + GET read + POST search', async () => {
    const text = `controller-ut-${Date.now()}`;
    await app.httpRequest()
      .post('/api/memory/note-skill/append')
      .send({ text, section: '偏好' })
      .expect(200);

    const read = await app.httpRequest()
      .get('/api/memory/note-skill')
      .expect(200);
    assert.ok(String(read.body.content).includes(text));

    const search = await app.httpRequest()
      .post('/api/memory/note-skill/search')
      .send({ query: text.slice(0, 8), limit: 3 })
      .expect(200);
    assert.ok(search.body.results.length >= 1);
  });

  it('append 缺少 text 返回 400', async () => {
    await app.httpRequest()
      .post('/api/memory/note-skill/append')
      .send({})
      .expect(400);
  });
});

'use strict';

const { strict: assert } = require('node:assert');
const { app } = require('egg-mock/bootstrap');

describe('test/app/service/dbManager.test.js', () => {
  let ctx;

  before(() => {
    ctx = app.mockContext();
  });

  it('insertNoteEntry / listNoteEntries', async () => {
    const sid = `ut-${Date.now()}`;
    const info = await ctx.service.dbManager.insertNoteEntry({
      session_id: sid,
      user_message: 'hello unit test',
      assistant_reply: 'ok',
      llm_profile_id: 'ollama-qwen',
    });
    assert.ok(info.lastInsertRowid > 0);

    const rows = await ctx.service.dbManager.listNoteEntries(sid, 5);
    assert.ok(rows.some(r => r.user_message === 'hello unit test'));
  });

  it('insertWeatherHistory / listWeatherHistory', async () => {
    const city = `TestCity${Date.now()}`;
    await ctx.service.dbManager.insertWeatherHistory({
      city,
      query_text: '{}',
      reply_text: '晴',
      llm_profile_id: 'ollama-qwen',
      temperature: 22,
      condition_text: '晴',
    });
    const rows = await ctx.service.dbManager.listWeatherHistory(city, 3);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].condition_text, '晴');
  });

  it('insertResearchLog / listResearchLog', async () => {
    const topic = `topic-${Date.now()}`;
    await ctx.service.dbManager.insertResearchLog({
      topic,
      summary: 'summary',
      steps_count: 2,
      stopped_reason: 'done',
      llm_profile_id: 'ollama-qwen',
    });
    const rows = await ctx.service.dbManager.listResearchLog(20);
    assert.ok(rows.some(r => r.topic === topic));
  });

  it('insertQaLog / listQaLog', async () => {
    const q = `q-${Date.now()}`;
    await ctx.service.dbManager.insertQaLog({
      question: q,
      answer: 'a',
      iterations: 1,
      llm_profile_id: 'ollama-qwen',
    });
    const rows = await ctx.service.dbManager.listQaLog(20);
    assert.ok(rows.some(r => r.question === q));
  });
});

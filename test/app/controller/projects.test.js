'use strict';

const fs = require('fs');
const path = require('path');
const { strict: assert } = require('node:assert');
const { app } = require('egg-mock/bootstrap');

describe('test/app/controller/projects.test.js', () => {
  it('GET /health 与 /api/plugins 保留原字段并带 project', async () => {
    const health = await app.httpRequest().get('/health').expect(200);
    assert.equal(health.body.status, 'ok');

    const plugins = await app.httpRequest().get('/api/plugins').expect(200);
    const note = plugins.body.plugins.find(item => item.name === 'note-skill');
    assert.ok(note);
    assert.equal(note.scheme, 'pi');
    assert.equal(note.project, 'platform');

    const research = plugins.body.plugins.find(item => item.name === 'research-skill');
    assert.equal(research.scheme, 'loop');
    assert.equal(research.project, 'platform');

    const writer = plugins.body.plugins.find(item => item.name === 'novel-writer-skill');
    assert.equal(writer.scheme, 'loop');
    assert.equal(writer.project, 'novel');

    const deploy = plugins.body.plugins.find(item => item.name === 'ops-deploy-skill');
    assert.equal(deploy.scheme, 'action');
    assert.equal(deploy.project, 'ops');

    const weather = plugins.body.plugins.find(item => item.name === 'weather-skill');
    assert.equal(weather.scheme, 'langchain');

    const testgen = plugins.body.plugins.find(item => item.name === 'testgen-skill');
    assert.equal(testgen.project, 'testgen');
    assert.equal(testgen.scheme, 'loop');
  });

  it('GET /api/projects 返回 5 个项目', async () => {
    const res = await app.httpRequest().get('/api/projects').expect(200);
    assert.equal(res.body.count, 5);
    const ids = res.body.projects.map(item => item.id);
    assert.deepEqual(ids, [ 'platform', 'novel', 'fitness', 'ops', 'testgen' ]);
    const platform = res.body.projects.find(item => item.id === 'platform');
    assert.ok(platform.skills.some(item => item.name === 'note-skill' && item.scheme === 'pi' && item.memory === 'file'));
  });

  it('note-skill list 响应不含密钥字段名的值泄漏标记', async () => {
    const res = await app.httpRequest()
      .post('/api/skills/note/chat')
      .send({ action: 'list', session_id: 'default' })
      .expect(200);
    const body = JSON.stringify(res.body);
    assert.equal(body.includes('apiKey'), false);
    assert.equal(body.includes('DATABASE_URL'), false);
    assert.equal(res.body.skill, 'note-skill');
    assert.equal(res.body.scheme, 'pi');
    assert.ok('reply' in res.body);
  });

  it('文件记忆实现不再按技能名直挂根目录', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../../app/lib/memory/fileMemory.js'), 'utf-8');
    assert.equal(/path\.join\(root,\s*skill,/.test(src), false);
    assert.ok(src.includes('project'));
  });
});

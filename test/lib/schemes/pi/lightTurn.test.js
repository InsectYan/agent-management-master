'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { strict: assert } = require('node:assert');
const { runPiTurn } = require('../../../../app/lib/schemes/pi/runTurn');
const { PiExecutor } = require('../../../../app/lib/schemes/pi');

describe('test/lib/schemes/pi/lightTurn.test.js', () => {
  let root;
  const prev = process.env.PI_ENGINE;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-light-'));
    process.env.PI_ENGINE = 'light';
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.PI_ENGINE;
    else process.env.PI_ENGINE = prev;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('轻量引擎返回 outbox 四字段，且不写文案副本', async () => {
    const skill = {
      name: 'note-skill',
      project: 'platform',
      description: '记事',
      dirPath: path.join(__dirname, '../../../../plugins/note-skill'),
      skillDoc: { purpose: '记事' },
    };
    const turn = await runPiTurn({
      skill,
      message: '你好',
      sessionId: 's1',
      llm: { apiKey: '', model: 'none', label: 'none' },
      workspacesRoot: root,
      context: { action: 'chat' },
      memoryContext: '',
    });
    assert.equal(turn.outbox.message_type, 'text');
    assert.ok(turn.outbox.reply);
    assert.ok(turn.outbox.intent);
    assert.ok(turn.outbox.agent_name);
    const cwd = turn.workspace;
    assert.ok(cwd.includes(path.join('platform', 'skill_note-skill')));
    assert.equal(fs.existsSync(path.join(cwd, 'SKILL.md')), false);
    assert.equal(fs.existsSync(path.join(cwd, 'AGENTS.md')), false);
    assert.equal(fs.existsSync(path.join(cwd, 'MEMORY.md')), false);
  });

  it('list 不进入会话', async () => {
    const executor = new PiExecutor(PiExecutor, { name: 'note-skill', project: 'platform' });
    const result = await executor.executeTask({
      app: { config: { appSettings: { workspacesRoot: root } } },
      skill: { name: 'note-skill', project: 'platform', dirPath: root },
      llm: { model: 'none' },
      ctx: {},
    }, {
      input: { action: 'list', session_id: 'default', entries: [] },
      raw: {},
    });
    assert.equal(result.output.action, 'list');
    assert.equal(result.output.scheme, 'pi');
    assert.equal(fs.existsSync(path.join(root, 'platform')), false);
  });
});

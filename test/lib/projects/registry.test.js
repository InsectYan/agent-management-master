'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { strict: assert } = require('node:assert');
const { loadProjectRegistry, resolveSkillAdmission } = require('../../../app/lib/projects/registry');

describe('test/lib/projects/registry.test.js', () => {
  it('仓库登记表有 5 个项目', () => {
    const file = path.join(__dirname, '../../../config/projects.json');
    const registry = loadProjectRegistry(file);
    assert.equal(registry.projects.length, 5);
    assert.deepEqual(
      registry.projects.map(item => item.id),
      [ 'platform', 'novel', 'fitness', 'ops', 'testgen' ]
    );
    assert.equal(registry.skillToProject.get('note-skill'), 'platform');
    assert.equal(registry.skillToProject.size, 17);
  });

  it('同一技能出现在两个项目时拒绝', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-reg-'));
    const file = path.join(dir, 'projects.json');
    fs.writeFileSync(file, JSON.stringify({
      projects: [
        { id: 'platform', skills: [ 'note-skill' ] },
        { id: 'novel', skills: [ 'note-skill' ] },
      ],
    }), 'utf-8');
    assert.throws(() => loadProjectRegistry(file), /项目登记冲突/);
  });

  it('未登记的 project 不能加载', () => {
    const registry = loadProjectRegistry(path.join(__dirname, '../../../config/projects.json'));
    const admission = resolveSkillAdmission({ name: 'note-skill', project: 'unknown' }, registry);
    assert.equal(admission.ok, false);
  });

  it('登记表与 index.js 不一致时拒绝', () => {
    const registry = loadProjectRegistry(path.join(__dirname, '../../../config/projects.json'));
    const admission = resolveSkillAdmission({ name: 'note-skill', project: 'novel' }, registry);
    assert.equal(admission.ok, false);
    assert.match(admission.reason, /登记表为 platform/);
  });
});

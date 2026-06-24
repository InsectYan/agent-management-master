'use strict';

const path = require('path');
const { strict: assert } = require('node:assert');
const {
  loadSkillDoc,
  extractSection,
  parseActions,
  resolveAction,
} = require('../../../app/lib/skill/skillDoc');

const FIXTURE_DIR = path.join(__dirname, '../../fixtures/sample-skill');

describe('test/lib/skill/skillDoc.test.js', () => {
  it('loadSkillDoc 解析 fixture', () => {
    const doc = loadSkillDoc(FIXTURE_DIR);
    assert.ok(doc);
    assert.ok(doc.content.includes('sample-skill'));
    assert.equal(doc.purpose, '测试用 Skill 文档。');
    assert.equal(doc.actions.length, 2);
    assert.equal(doc.actions[0].id, 'query');
    assert.deepEqual(doc.actions[0].requiredParams, [ 'city' ]);
  });

  it('extractSection 提取段落', () => {
    const md = '## 用途\n\nhello\n\n## 其他\n\nworld';
    assert.equal(extractSection(md, '用途'), 'hello');
    assert.equal(extractSection(md, '缺失'), null);
  });

  it('resolveAction 默认动作与必填校验', () => {
    const doc = loadSkillDoc(FIXTURE_DIR);
    const ok = resolveAction(doc, { action: 'query', city: '北京' });
    assert.deepEqual(ok.errors, []);
    assert.equal(ok.action, 'query');

    const missing = resolveAction(doc, { action: 'query' });
    assert.ok(missing.errors.some(e => e.includes('city')));

    const defaulted = resolveAction(doc, { _httpMethod: 'GET' }, { GET: 'list' });
    assert.equal(defaulted.action, 'list');
    assert.deepEqual(defaulted.errors, []);
  });

  it('parseActions 空段落返回 []', () => {
    assert.deepEqual(parseActions('## 无动作\n\n'), []);
  });
});

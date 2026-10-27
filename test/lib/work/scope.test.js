'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { strict: assert } = require('node:assert');
const { resolveWorkScope } = require('../../../app/lib/work/scope');
const { turnNote, writeWorkTrace, searchWorkKnowledge } = require('../../../app/lib/work/trace');

describe('test/lib/work/scope.test.js', () => {
  it('小说和视频按作品分开，同号不串', () => {
    const novel = resolveWorkScope({ novel_id: 4 }, { project: 'novel' });
    const video = resolveWorkScope({ project_id: 4 }, { project: 'cartoon' });
    assert.equal(novel.knowledgeId, 'novel_work_4');
    assert.equal(video.knowledgeId, 'cartoon_work_4');
    assert.equal(resolveWorkScope({ topic: '开书' }, { project: 'novel' }), null);
    assert.equal(resolveWorkScope({ novel_id: 1 }, { project: 'testgen' }), null);
  });

  it('一轮交互写入工作区和知识页，不带整段正文', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'work-trace-'));
    const work = resolveWorkScope({ work_id: '15', novel_id: 15 }, { project: 'novel' });
    const fullReply = `建议悬疑。${'这是不应该整段入库的章节正文。'.repeat(40)}`;
    const note = turnNote({
      action: 'fill_style',
      scene: 'style',
      message: '按立意选语气',
      reply: fullReply,
    });
    assert.ok(note.length < fullReply.length);
    const trace = writeWorkTrace({
      workspacesRoot: path.join(root, 'workspaces'),
      work,
      skillName: 'novel-writer-skill',
      traceId: 't1',
      note,
      action: 'fill_style',
      scene: 'style',
    });
    assert.ok(trace.workspace.includes(path.join('workspaces', 'novel', 'works', 'work_15', 'skill_novel-writer-skill', 'turns')));
    assert.ok(trace.knowledge.includes(path.join('workspaces', 'novel', 'works', 'work_15', 'knowledge', 'turns.md')));
    const page = fs.readFileSync(trace.knowledge, 'utf8');
    assert.ok(page.includes('悬疑'));
    assert.ok(!page.includes(fullReply));
    const hits = searchWorkKnowledge(path.join(root, 'workspaces'), work, '悬疑', 3);
    assert.equal(hits.length, 1);
    assert.ok(!hits[0].snippet.includes(fullReply));
    fs.rmSync(root, { recursive: true, force: true });
  });
});

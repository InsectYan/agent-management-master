/**
 * @file trace.js
 * @description 把一轮交互落到作品自己的工作区和知识页。不保存整段正文。
 */

'use strict';

const fs = require('fs');
const path = require('path');

function sanitize(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

function clip(value, max) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function turnNote(input = {}) {
  const action = clip(input.action, 40) || 'chat';
  const scene = clip(input.scene, 40);
  const ask = clip(input.message || input.topic || input.user_message, 160);
  const answer = clip(input.reply, 220);
  const head = scene ? `${action}/${scene}` : action;
  return `${head}：${ask || '（无提问）'} → ${answer || '（无回复）'}`;
}

function workspaceTurnPath(workspacesRoot, work, skillName, traceId) {
  const dir = path.join(
    workspacesRoot,
    sanitize(work.platform),
    'works',
    `work_${sanitize(work.workId)}`,
    `skill_${sanitize(skillName)}`,
    'turns',
  );
  const name = `${Date.now()}-${sanitize(traceId || 'turn')}.json`;
  return path.join(dir, name);
}

function knowledgePagePath(workspacesRoot, work) {
  return path.join(
    workspacesRoot,
    sanitize(work.platform),
    'works',
    `work_${sanitize(work.workId)}`,
    'knowledge',
    'turns.md',
  );
}

function workKnowledgeDir(workspacesRoot, work) {
  return path.dirname(knowledgePagePath(workspacesRoot, work));
}

function searchWorkKnowledge(workspacesRoot, work, query, limit = 3) {
  const file = knowledgePagePath(workspacesRoot, work);
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  const q = String(query || '').trim().toLowerCase();
  if (q && !text.toLowerCase().includes(q)) return [];
  const idx = q ? text.toLowerCase().indexOf(q) : 0;
  const start = Math.max(0, idx);
  return [{ page: 'turns.md', snippet: text.slice(start, start + 240) }].slice(0, limit);
}

/**
 * @param {Object} options
 * @returns {{ workspace: string, knowledge: string, note: string }}
 */
function writeWorkTrace(options) {
  const { workspacesRoot, work, skillName, traceId, note, action, scene } = options;
  const workspace = workspaceTurnPath(workspacesRoot, work, skillName, traceId);
  fs.mkdirSync(path.dirname(workspace), { recursive: true });
  fs.writeFileSync(workspace, JSON.stringify({
    platform: work.platform,
    work_id: work.workId,
    skill: skillName,
    action: clip(action, 40),
    scene: clip(scene, 40),
    note,
    at: new Date().toISOString(),
  }, null, 2), 'utf-8');

  const knowledge = knowledgePagePath(workspacesRoot, work);
  fs.mkdirSync(path.dirname(knowledge), { recursive: true });
  if (!fs.existsSync(knowledge)) {
    fs.writeFileSync(knowledge, `# 作品 ${work.platform} ${work.workId}\n\n`, 'utf-8');
  }
  fs.appendFileSync(knowledge, `- ${new Date().toISOString().slice(0, 16)} ${note}\n`, 'utf-8');
  return { workspace, knowledge, note };
}

module.exports = {
  clip,
  turnNote,
  writeWorkTrace,
  workspaceTurnPath,
  knowledgePagePath,
  workKnowledgeDir,
  searchWorkKnowledge,
};

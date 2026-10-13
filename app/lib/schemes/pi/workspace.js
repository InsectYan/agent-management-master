/**
 * @file workspace.js
 * @description Pi 工作区路径与 inbox/outbox 物化（轻量版，不依赖 pi-coding-agent）。
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 清理路径片段
 * @param {string} value
 * @returns {string}
 */
function sanitize(value) {
  return String(value || 'default').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

/**
 * Skill 工作区根路径
 * @param {string} workspacesRoot
 * @param {string} skillName
 * @returns {string}
 */
function skillWorkspacePath(workspacesRoot, skillName, projectId) {
  const project = String(projectId || '').trim();
  if (!project) throw new Error('工作区需要 projectId');
  return path.join(workspacesRoot, sanitize(project), `skill_${sanitize(skillName)}`);
}

/**
 * 会话 jsonl
 * @param {string} workspacesRoot
 * @param {string} projectId
 * @param {string} skillName
 * @param {string} sessionId
 */
function sessionJsonlPath(workspacesRoot, projectId, skillName, sessionId) {
  return path.join(skillWorkspacePath(workspacesRoot, skillName, projectId), `${sanitize(sessionId)}.jsonl`);
}

/**
 * 会话目录
 * @param {string} workspacesRoot
 * @param {string} projectId
 * @param {string} skillName
 * @param {string} sessionId
 * @returns {string}
 */
function sessionDir(workspacesRoot, projectId, skillName, sessionId) {
  return path.join(skillWorkspacePath(workspacesRoot, skillName, projectId), 'sessions', sanitize(sessionId));
}

/**
 * 初始化 Skill 工作区。文案留在插件目录，这里只建目录。
 * @param {Object} options
 * @param {string} options.workspacesRoot
 * @param {Object} options.skill
 */
function initSkillWorkspace(options) {
  const { workspacesRoot, skill } = options;
  const cwd = skillWorkspacePath(workspacesRoot, skill.name, skill.project);
  fs.mkdirSync(cwd, { recursive: true });
  return cwd;
}

/**
 * 物化本轮 inbox / context，清理旧 outbox
 * @param {Object} options
 * @param {string} options.workspacesRoot
 * @param {string} options.projectId
 * @param {string} options.skillName
 * @param {string} options.sessionId
 * @param {string} options.message - 富化后的 inbox 正文
 * @param {Record<string, unknown>} [options.context]
 * @returns {{ cwd: string, session_dir: string, outbox_path: string }}
 */
function materializeTurn(options) {
  const { workspacesRoot, projectId, skillName, sessionId, message, context } = options;
  const cwd = skillWorkspacePath(workspacesRoot, skillName, projectId);
  const dir = sessionDir(workspacesRoot, projectId, skillName, sessionId);
  fs.mkdirSync(dir, { recursive: true });

  const outboxPath = path.join(dir, 'outbox.json');
  if (fs.existsSync(outboxPath)) fs.unlinkSync(outboxPath);

  fs.writeFileSync(path.join(dir, 'inbox.md'), message, 'utf-8');
  fs.writeFileSync(path.join(dir, 'context.json'), JSON.stringify({
    skill: skillName,
    session_id: sessionId,
    ...(context || {}),
  }, null, 2), 'utf-8');

  return { cwd, session_dir: dir, outbox_path: outboxPath };
}

/**
 * 读取 outbox.json
 * @param {string} outboxPath
 * @returns {Record<string, unknown>}
 */
function readOutbox(outboxPath) {
  if (!fs.existsSync(outboxPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(outboxPath, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * 写入 outbox.json
 * @param {string} outboxPath
 * @param {Record<string, unknown>} outbox
 */
function writeOutbox(outboxPath, outbox) {
  fs.writeFileSync(outboxPath, JSON.stringify(outbox, null, 2), 'utf-8');
}

module.exports = {
  sanitize,
  skillWorkspacePath,
  sessionJsonlPath,
  sessionDir,
  initSkillWorkspace,
  materializeTurn,
  readOutbox,
  writeOutbox,
};

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
function skillWorkspacePath(workspacesRoot, skillName) {
  return path.join(workspacesRoot, `skill_${sanitize(skillName)}`);
}

/**
 * 会话目录
 * @param {string} workspacesRoot
 * @param {string} skillName
 * @param {string} sessionId
 * @returns {string}
 */
function sessionDir(workspacesRoot, skillName, sessionId) {
  return path.join(skillWorkspacePath(workspacesRoot, skillName), 'sessions', sanitize(sessionId));
}

/**
 * 初始化 Skill 工作区（AGENTS.md + 可选 SKILL.md 副本）
 * @param {Object} options
 * @param {string} options.workspacesRoot
 * @param {Object} options.skill
 */
function initSkillWorkspace(options) {
  const { workspacesRoot, skill } = options;
  const cwd = skillWorkspacePath(workspacesRoot, skill.name);
  fs.mkdirSync(cwd, { recursive: true });

  const agentsPath = path.join(cwd, 'AGENTS.md');
  if (!fs.existsSync(agentsPath)) {
    const purpose = skill.skillDoc?.purpose || skill.description || skill.name;
    fs.writeFileSync(agentsPath, `# ${skill.name}\n\n${purpose}\n\n本轮须 write sessions/<id>/outbox.json（合法 JSON，含 reply 字段）。\n`, 'utf-8');
  }

  const skillMdSrc = path.join(skill.dirPath, 'SKILL.md');
  const skillMdDst = path.join(cwd, 'SKILL.md');
  if (fs.existsSync(skillMdSrc) && !fs.existsSync(skillMdDst)) {
    fs.copyFileSync(skillMdSrc, skillMdDst);
  }

  return cwd;
}

/**
 * 物化本轮 inbox / context，清理旧 outbox
 * @param {Object} options
 * @param {string} options.workspacesRoot
 * @param {string} options.skillName
 * @param {string} options.sessionId
 * @param {string} options.message - 富化后的 inbox 正文
 * @param {Record<string, unknown>} [options.context]
 * @returns {{ cwd: string, session_dir: string, outbox_path: string }}
 */
function materializeTurn(options) {
  const { workspacesRoot, skillName, sessionId, message, context } = options;
  const cwd = skillWorkspacePath(workspacesRoot, skillName);
  const dir = sessionDir(workspacesRoot, skillName, sessionId);
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
  sessionDir,
  initSkillWorkspace,
  materializeTurn,
  readOutbox,
  writeOutbox,
};

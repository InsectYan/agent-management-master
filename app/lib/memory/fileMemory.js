/**
 * @file fileMemory.js
 * @description 文件记忆实现：Skill 工作区 MEMORY.md + 索引块。
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * @param {string} root - memoryFiles 根目录
 * @param {string} skillName
 * @returns {string}
 */
function memoryFilePath(root, skillName) {
  const safe = String(skillName).replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(root, safe, 'MEMORY.md');
}

/**
 * 确保 MEMORY.md 存在
 * @param {string} filePath
 * @param {string} skillName
 */
function ensureFile(filePath, skillName) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `# ${skillName} 记忆\n\n### 偏好\n\n### 事实\n\n`, 'utf-8');
  }
}

class FileMemory {
  /**
   * @param {Object} options
   * @param {string} options.skillName
   * @param {string} options.root - memoryFiles 根目录
   */
  constructor(options) {
    this.skillName = options.skillName;
    this.filePath = memoryFilePath(options.root, options.skillName);
    ensureFile(this.filePath, this.skillName);
  }

  /** @returns {string} */
  read() {
    ensureFile(this.filePath, this.skillName);
    return fs.readFileSync(this.filePath, 'utf-8');
  }

  /**
   * @param {string} text
   * @param {string} [section='偏好']
   */
  append(text, section = '偏好') {
    const content = this.read();
    const marker = `### ${section}`;
    const idx = content.indexOf(marker);
    const line = `- ${new Date().toISOString().slice(0, 10)} ${text}\n`;
    if (idx >= 0) {
      const after = content.indexOf('\n### ', idx + marker.length);
      const insertAt = after >= 0 ? after : content.length;
      const next = content.slice(0, insertAt) + line + content.slice(insertAt);
      fs.writeFileSync(this.filePath, next, 'utf-8');
      return next;
    }
    const next = `${content.trim()}\n\n${marker}\n${line}`;
    fs.writeFileSync(this.filePath, next, 'utf-8');
    return next;
  }

  /**
   * 关键词检索（简单行匹配）
   * @param {string} query
   * @param {number} [limit=5]
   */
  search(query, limit = 5) {
    const q = (query || '').trim().toLowerCase();
    const lines = this.read().split('\n').filter(l => l.startsWith('- '));
    if (!q) return lines.slice(0, limit);
    return lines
      .filter(l => l.toLowerCase().includes(q))
      .slice(0, limit);
  }

  destroy() {
    if (fs.existsSync(this.filePath)) {
      fs.unlinkSync(this.filePath);
    }
  }
}

module.exports = {
  FileMemory,
  memoryFilePath,
};

/**
 * @file registry.js
 * @description 项目登记表。清单只来自 config/projects.json。
 */

'use strict';

const fs = require('fs');

/**
 * @param {string} filePath
 * @returns {{ projects: Object[], projectIds: Set<string>, skillToProject: Map<string, string> }}
 */
function loadProjectRegistry(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const projects = Array.isArray(raw.projects) ? raw.projects : [];
  const projectIds = new Set();
  const skillToProject = new Map();
  const duplicates = [];

  for (const project of projects) {
    const id = String(project.id || '').trim();
    if (!id) {
      throw new Error('项目登记缺少 id');
    }
    if (projectIds.has(id)) {
      throw new Error(`项目 id 重复: ${id}`);
    }
    projectIds.add(id);
    for (const name of project.skills || []) {
      const skillName = String(name || '').trim();
      if (!skillName) continue;
      if (skillToProject.has(skillName)) {
        duplicates.push(skillName);
        continue;
      }
      skillToProject.set(skillName, id);
    }
  }

  if (duplicates.length) {
    const err = new Error(`项目登记冲突: ${duplicates.join(', ')} 出现在多个项目`);
    err.code = 'PROJECT_SKILL_CONFLICT';
    throw err;
  }

  return { projects, projectIds, skillToProject };
}

/**
 * @param {{ name: string, project?: string }} skill
 * @param {{ projectIds: Set<string>, skillToProject: Map<string, string> }} registry
 * @returns {{ ok: true, project: string } | { ok: false, reason: string }}
 */
function resolveSkillAdmission(skill, registry) {
  const declared = String(skill.project || '').trim();
  const listed = registry.skillToProject.get(skill.name);
  if (!declared || !registry.projectIds.has(declared)) {
    return {
      ok: false,
      reason: declared ? `project「${declared}」不在登记表` : '缺少 project',
    };
  }
  if (!listed || listed !== declared) {
    return {
      ok: false,
      reason: listed
        ? `登记表为 ${listed}，index.js 为 ${declared}`
        : `技能未列入项目 ${declared}`,
    };
  }
  return { ok: true, project: declared };
}

module.exports = {
  loadProjectRegistry,
  resolveSkillAdmission,
};

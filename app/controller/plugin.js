/**
 * @file plugin.js
 * @description Skill 插件查询 API（含 SKILL.md 文档端点）。
 */

'use strict';

const Controller = require('egg').Controller;

/**
 * 将 Skill 元数据序列化为 API 安全结构（不含 callbacks 函数体）
 * @param {Object} skill
 * @returns {Object}
 */
function serializeSkill(skill) {
  return {
    name: skill.name,
    scheme: skill.scheme,
    version: skill.version,
    description: skill.description,
    status: skill.status,
    routes: skill.routes,
    dbTables: skill.dbTables,
    dirPath: skill.dirPath,
    config: {
      llmDefaultProfile: skill.config?.llmDefaultProfile,
      actionDefaults: skill.config?.actionDefaults,
    },
    hasSkillDoc: Boolean(skill.skillDoc),
    skillActions: skill.skillDoc?.actions || [],
    skillDocPurpose: skill.skillDoc?.purpose || null,
  };
}

class PluginController extends Controller {
  /**
   * GET /api/plugins — 列出已加载 Skill
   */
  async list() {
    const skills = this.service.pluginManager.list();
    this.ctx.body = {
      plugins: skills.map(serializeSkill),
      count: skills.length,
    };
  }

  /**
   * GET /api/plugins/:name — 单个 Skill 详情
   */
  async show() {
    const skill = this.service.pluginManager.get(this.ctx.params.name);
    if (!skill) {
      this.ctx.status = 404;
      this.ctx.body = { error: 'Skill 不存在' };
      return;
    }
    this.ctx.body = { plugin: serializeSkill(skill) };
  }

  /**
   * GET /api/plugins/:name/skill-doc — 返回 SKILL.md 全文与解析摘要
   */
  async skillDoc() {
    const skill = this.service.pluginManager.get(this.ctx.params.name);
    if (!skill) {
      this.ctx.status = 404;
      this.ctx.body = { error: 'Skill 不存在' };
      return;
    }
    if (!skill.skillDoc) {
      this.ctx.status = 404;
      this.ctx.body = { error: '该 Skill 未提供 SKILL.md' };
      return;
    }

    this.ctx.body = {
      name: skill.name,
      path: skill.skillDoc.path,
      purpose: skill.skillDoc.purpose,
      actions: skill.skillDoc.actions,
      content: skill.skillDoc.content,
    };
  }
}

module.exports = PluginController;

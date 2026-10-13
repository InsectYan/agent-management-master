/**
 * @file project.js
 * @description 已关联项目与技能。只读。
 */

'use strict';

const Controller = require('egg').Controller;

class ProjectController extends Controller {
  /**
   * GET /api/projects
   */
  async list() {
    this.ctx.body = this.service.pluginManager.listProjects();
  }
}

module.exports = ProjectController;

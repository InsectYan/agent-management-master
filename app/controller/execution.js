/**
 * @file execution.js
 * @description 执行轨迹写入与查询。
 */

'use strict';

const Controller = require('egg').Controller;

class ExecutionController extends Controller {
  fail(err, status) {
    const code = status || err.status || 500;
    this.ctx.status = code;
    this.ctx.body = { error: err.message || '执行轨迹失败' };
  }

  async index() {
    try {
      this.ctx.body = await this.service.execution.list(this.ctx.query);
    } catch (err) {
      this.fail(err);
    }
  }

  async skills() {
    try {
      this.ctx.body = { list: await this.service.execution.skills() };
    } catch (err) {
      this.fail(err);
    }
  }

  async show() {
    try {
      const data = await this.service.execution.show(this.ctx.params.id);
      if (!data) {
        this.ctx.status = 404;
        this.ctx.body = { error: '没有这条执行记录' };
        return;
      }
      this.ctx.body = data;
    } catch (err) {
      this.fail(err);
    }
  }

  async open() {
    try {
      const id = await this.service.execution.open(this.ctx.request.body || {});
      this.ctx.body = { id };
    } catch (err) {
      this.fail(err);
    }
  }

  async step() {
    try {
      const id = await this.service.execution.step(this.ctx.params.id, this.ctx.request.body || {});
      this.ctx.body = { id };
    } catch (err) {
      this.fail(err);
    }
  }

  async finishStep() {
    try {
      await this.service.execution.finishStep(this.ctx.params.stepId, this.ctx.request.body || {});
      this.ctx.body = { ok: true };
    } catch (err) {
      this.fail(err);
    }
  }

  async finish() {
    try {
      await this.service.execution.finish(this.ctx.params.id, this.ctx.request.body || {});
      this.ctx.body = { ok: true };
    } catch (err) {
      this.fail(err);
    }
  }
}

module.exports = ExecutionController;

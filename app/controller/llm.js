/**
 * @file llm.js
 * @description LLM 配置 catalog API（不含 apiKey）。
 */

'use strict';

const Controller = require('egg').Controller;
const { listLlmProfiles, getPlatformDefaultProfileId } = require('../lib/llm/catalog');

class LlmController extends Controller {
  /**
   * GET /api/llm/profiles — 全部模型配置 + 平台默认项
   */
  async profiles() {
    const profiles = listLlmProfiles();
    const defaultId = getPlatformDefaultProfileId(this.config.appSettings);
    this.ctx.body = {
      profiles,
      default_profile_id: defaultId,
      default_available: profiles.find(p => p.id === defaultId)?.available ?? false,
    };
  }
}

module.exports = LlmController;

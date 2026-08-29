/**
 * @file media.js
 * @description 多模态模型 catalog 与生成（不含 apiKey）。
 */

'use strict';

const Controller = require('egg').Controller;
const { listMediaProfiles, getPlatformDefaultMediaProfileId } = require('../lib/media/catalog');
const { generateMedia } = require('../lib/media/generate');

class MediaController extends Controller {
  /** GET /api/media/profiles */
  async profiles() {
    const profiles = listMediaProfiles();
    const defaultId = getPlatformDefaultMediaProfileId(this.config.appSettings);
    this.ctx.body = {
      profiles,
      default_profile_id: defaultId,
      default_available: profiles.find(p => p.id === defaultId)?.available ?? false,
    };
  }

  /** POST /api/media/generate  { kind, prompt, media_profile, size? } */
  async generate() {
    const body = this.ctx.request.body || {};
    try {
      const result = await generateMedia({
        kind: body.kind || 'image',
        prompt: body.prompt,
        requestProfileId: body.media_profile,
        size: body.size,
        appSettings: this.config.appSettings,
      });
      this.ctx.body = result;
    } catch (err) {
      this.ctx.status = err.status || 500;
      this.ctx.body = {
        error: err.message || '生成失败',
        code: err.code || 'MEDIA_GENERATE_FAILED',
      };
    }
  }
}

module.exports = MediaController;

/**
 * @file plugin.js
 * @description Egg 内置插件开关配置。
 */

'use strict';

/** @type {import('egg').EggPlugin} */
module.exports = {
  /** 启用跨域插件，便于独立前端联调 */
  cors: {
    enable: true,
    package: 'egg-cors',
  },
};

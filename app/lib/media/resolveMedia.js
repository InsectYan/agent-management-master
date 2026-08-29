/**
 * @file resolveMedia.js
 * @description 多模态模型：P1 请求 media_profile（即使暂不可用也命中，便于返回明确错误）> P2 平台默认
 */

'use strict';

const {
  getPlatformDefaultMediaProfileId,
  resolveMediaProfile,
  profileAvailable,
  getMediaDef,
  MEDIA_CATALOG,
} = require('./catalog');

function resolveMedia(input) {
  const appSettings = input.appSettings || {};
  const requestId = (input.requestProfileId || '').trim();

  if (requestId && getMediaDef(requestId)) {
    const runtime = resolveMediaProfile(requestId, appSettings);
    return {
      ...runtime,
      source: 'request',
      profileIdUsed: runtime.profileId,
    };
  }

  const platformId = getPlatformDefaultMediaProfileId(appSettings);
  const platformDef = getMediaDef(platformId) || MEDIA_CATALOG[0];
  if (platformDef && profileAvailable(platformDef)) {
    const runtime = resolveMediaProfile(platformId, appSettings);
    return {
      ...runtime,
      source: 'platform',
      profileIdUsed: runtime.profileId,
    };
  }

  const runtime = resolveMediaProfile(platformId, appSettings);
  return {
    ...runtime,
    source: 'platform',
    profileIdUsed: runtime.profileId,
  };
}

module.exports = { resolveMedia };

/**
 * @file resolveLlm.js
 * @description LLM 三级优先级解析：
 *              P1 请求入参 llm_profile > P2 Skill config.llmDefaultProfile > P3 平台默认 Ollama
 */

'use strict';

const {
  getPlatformDefaultProfileId,
  resolveLlmProfile,
  profileAvailable,
  CATALOG,
} = require('./catalog');

/**
 * @typedef {import('./types').ResolvedLlm} ResolvedLlm
 */

/**
 * 解析本次请求应使用的 LLM 配置
 * @param {Object} input
 * @param {string|null|undefined} input.requestProfileId - P1：API 入参 llm_profile
 * @param {string|null|undefined} input.skillDefaultProfile - P2：Skill config.llmDefaultProfile
 * @param {Object} [input.appSettings] - config.appSettings
 * @returns {ResolvedLlm}
 */
function resolveLlm(input) {
  const appSettings = input.appSettings || {};
  const requestId = (input.requestProfileId || '').trim();
  const skillId = (input.skillDefaultProfile || '').trim();
  const platformId = getPlatformDefaultProfileId(appSettings);

  /** 按优先级构造候选链（去空） */
  const candidates = [
    { id: requestId, source: /** @type {const} */ ('request') },
    { id: skillId, source: /** @type {const} */ ('skill') },
    { id: platformId, source: /** @type {const} */ ('platform') },
  ].filter(c => c.id);

  for (const candidate of candidates) {
    const def = CATALOG.find(d => d.id === candidate.id);
    if (def && profileAvailable(def)) {
      const runtime = resolveLlmProfile(candidate.id, appSettings);
      return {
        ...runtime,
        source: candidate.source,
        profileIdUsed: runtime.profileId,
      };
    }
  }

  /** 全部不可用时的兜底 */
  const runtime = resolveLlmProfile(null, appSettings);
  return {
    ...runtime,
    source: 'platform',
    profileIdUsed: runtime.profileId,
  };
}

module.exports = {
  resolveLlm,
};

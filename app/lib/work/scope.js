/**
 * @file scope.js
 * @description 从一次 Agent 调用里认出作品。小说和视频分开记，避免同号作品串记忆。
 */

'use strict';

function text(value) {
  if (value == null) return '';
  const raw = String(value).trim();
  if (!raw || raw === 'null' || raw === 'undefined') return '';
  return raw;
}

function first(...values) {
  for (const value of values) {
    const hit = text(value);
    if (hit) return hit;
  }
  return '';
}

/**
 * @param {Object} input
 * @param {{ project?: string }} skill
 * @returns {{ platform: string, workId: string, knowledgeId: string } | null}
 */
function resolveWorkScope(input, skill) {
  const source = input && typeof input === 'object' ? input : {};
  const bound = source.bound_context && typeof source.bound_context === 'object'
    ? source.bound_context
    : {};
  const platform = text(source.platform) || text(skill?.project);
  if (platform !== 'novel' && platform !== 'cartoon') return null;
  const workId = first(
    source.work_id,
    platform === 'novel' ? source.novel_id : '',
    platform === 'cartoon' ? source.project_id : '',
    platform === 'cartoon' ? source.video_project_id : '',
    bound.work_id,
    bound.novel_id,
    bound.novel?.id,
    bound.project_id,
  );
  if (!workId) return null;
  return {
    platform,
    workId,
    knowledgeId: `${platform}_work_${workId}`,
  };
}

module.exports = {
  resolveWorkScope,
};

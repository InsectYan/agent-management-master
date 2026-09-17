/**
 * @file ops-deploy-skill/index.js
 * @description 部署执行合同。实际 git/构建在 ops-sub BFF DeployRunnerService。
 */

'use strict';

module.exports = {
  name: 'ops-deploy-skill',
  version: '0.1.0',
  description: '运维部署执行合同（拉 tag / 构建）；BFF 内 runner 为第一期实现',
  scheme: 'action',
  routes: [
    {
      path: '/api/skills/ops-deploy',
      method: 'POST',
      description: '按 tag 拉取并构建（由 ops-sub 调度）',
      requiresAuth: false,
    },
  ],
  config: {
    actionDefaults: { POST: 'run' },
  },
  callbacks: {
    async beforeExecute(ctx, params) {
      const action = params.action || 'run';
      if (action !== 'run') {
        const err = new Error(`不支持的动作: ${action}`);
        err.status = 400;
        throw err;
      }
      if (!params.job_id || !params.git_tag) {
        const err = new Error('缺少 job_id 或 git_tag');
        err.status = 400;
        throw err;
      }
      return params;
    },
    async afterExecute() {
      return {
        ok: false,
        error_summary: '部署执行由 ops-sub BFF runner 完成，请勿单独调本 Skill 跑构建',
      };
    },
  },
};

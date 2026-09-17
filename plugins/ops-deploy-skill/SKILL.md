# ops-deploy-skill

部署执行 Skill，与 `ops-project-skill`（配置生成）分开。

第一期真正跑 git / 构建的是 **ops-sub BFF `DeployRunnerService`**（白名单、可中止、工作区 `/tmp/ops-deploy/{jobId}`）。本目录只定义合同，避免以后把部署写进配置生成 Skill。

## 入参

```json
{
  "job_id": 12,
  "repo_url": "https://github.com/org/repo",
  "git_tag": "v1.2.0",
  "project_type": "frontend",
  "params": { "build_cmd": "node -e \"console.log(1)\"", "env": "staging" },
  "work_dir": "/tmp/ops-deploy/12"
}
```

## 出参

`{ ok, git_sha, error_summary }`

日志由 BFF 落库并 SSE，不走最终 JSON。

## 命令白名单

仅 `git` / `npm` / `pnpm` / `yarn` / `node`。禁止 `rm -rf`、管道、命令替换。

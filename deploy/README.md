# agent-management-master — 部署

Agent + BFF 运行时（无前端）。结构参考 `cartoon-agent/deploy`。

## 日常入口

| 你想做什么 | 命令 |
|------------|------|
| 本地 npm 开发 | `npm run dev` |
| **Docker 默认栈** | `cd deploy && npm link` → **`agentm local`** |
| 含 Postgres | **`agentm local:full`** |
| 宿主机 Ollama | **`agentm local:host-ollama`** |
| Skill 热更新开发 | **`agentm local:dev`** |
| 查看状态 | **`agentm local:status`** |
| 清卷 + 冒烟 | **`agentm local:reset`** |
| 拉模型 | **`agentm local:pull-model`** |
| 停止 | **`agentm local:down`** |
| 运维说明 | [OPERATIONS.md](./OPERATIONS.md) |
| CLI 详情 | [scripts/README.md](./scripts/README.md) |
| 环境变量 | [config/README.md](./config/README.md) |

未 link：`npm run docker:local` 等（见根 `package.json`）。

## Compose Profiles

| Profile | 服务 | 说明 |
|---------|------|------|
| `local` | agent-server | 必选 |
| `ollama` | agent-ollama | 默认 `agentm local` 启用 |
| `postgres` | agent-postgres | 仅 `agentm local:full` |

Postgres 为预留（应用当前仍用 SQLite）；默认栈更轻、启动更快。

## 目录结构

```
deploy/
├── docker-compose.yml
├── docker-compose.dev.yml    # plugins rw
├── config/                   # .env.local + Dockerfile
├── scripts/                  # compose、start、smoke、wait
├── shared/scripts/           # smoke-agent.sh
└── package.json + bin/       # agentm CLI
```

## 数据持久化

| 宿主机 | 容器 | 说明 |
|--------|------|------|
| `./data` | `/app/data` | SQLite |
| `./workspaces` | `/workspaces` | Pi |
| `./memory_files` | `/memory_files` | 记忆 |
| `./plugins` | `/app/plugins` | ro（`local:dev` 为 rw） |

## 验证

```bash
agentm local:smoke
# 或
bash deploy/shared/scripts/smoke-agent.sh
```

## Windows

- 启动 **Docker Desktop** 后再 `agentm local`
- `compose.ps1` 检测 daemon；`smoke-docker.ps1` 原生 PowerShell 冒烟
- `.editorconfig` 规定 `*.ps1` 使用 UTF-8 BOM

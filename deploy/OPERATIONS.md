# 运维说明

> 范围：`deploy/` 本地 Docker + CLI。不含前端。

## 运维对象

```
调用方 ──HTTP:3001──► agent-server (Egg.js)
                        ├─ SQLite ./data/agent.sqlite
                        ├─ /workspaces (Pi)
                        ├─ /memory_files (MEMORY.md)
                        └─ plugins/ (Skill)
                        │
            可选 ──► agent-ollama :11434
            可选 ──► agent-postgres :5433 (预留)
```

## 日常命令

| 操作 | 命令 |
|------|------|
| 启动（默认） | `agentm local` |
| 含 Postgres | `agentm local:full` |
| 开发挂载 | `agentm local:dev` |
| 状态 | `agentm local:status` |
| 冒烟 | `agentm local:smoke` |
| 清卷重建 | `agentm local:reset` |
| 停止 | `agentm local:down` |

## 持久化（必备份）

| 路径 | 内容 |
|------|------|
| `data/` | SQLite + 业务表 |
| `workspaces/` | Pi session / outbox |
| `memory_files/` | 文件记忆 |

Docker 卷 `agent_ollama` 存模型权重（可选备份）。

## 发版（本地镜像）

```bash
agentm local:reset
# 或
docker compose -f deploy/docker-compose.yml --profile local --profile ollama build --no-cache agent-server
```

改 `plugins/` 后：生产镜像需 rebuild；开发用 `agentm local:dev` 可热更新 Skill。

## 探活

- `GET /health` — 进程存活
- `GET /ready` — Skill + 记忆加载完成

## Windows

- Docker Desktop 须 Running
- 冒烟优先走 `smoke-docker.ps1`（无需 Git Bash）
- `*.ps1` 须 UTF-8 BOM（见根目录 `.editorconfig`）

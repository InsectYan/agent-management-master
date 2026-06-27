# 本地 Docker 脚本

## `agentm` CLI

```bash
cd deploy && npm link
agentm help
```

| 命令 | 作用 |
|------|------|
| `agentm local` | 仅 server + 本机 Ollama，启动后 wait health |
| `agentm local:docker-ollama` | server + ollama 容器（无本机 Ollama 时） |
| `agentm local:full` | + postgres |
| `agentm local:dev` | + `docker-compose.dev.yml`（plugins 可写） |
| `agentm local:host-ollama` | 与 `local` 相同（兼容旧命令） |
| `agentm local:status` | compose ps + /health |
| `agentm local:wait` | 等待 /health |
| `agentm local:smoke` | 冒烟（PS/bash） |
| `agentm local:reset` | down -v + 重建 + smoke |
| `agentm local:pull-model` | 本机或容器内 `ollama pull` |

等价 npm（仓库根）：`npm run docker:local` 等。

## 脚本

| 文件 | 说明 |
|------|------|
| `run.mjs` | 调度入口 |
| `compose.ps1` / `.sh` | compose + .env  bootstrap + AGENTM_DEV |
| `start-local.*` | 按 mode 选 profile |
| `wait-health.*` | 等待就绪 |
| `smoke-docker.ps1` | Windows 原生冒烟 |
| `smoke-docker.sh` | Bash 冒烟 |
| `status-local.ps1` | 状态一览 |

环境变量：`AGENTM_DEV=1` 启用 dev override；`SKIP_SMOKE=1` 跳过 reset 冒烟。

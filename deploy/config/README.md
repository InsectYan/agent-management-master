# 部署配置（local）

团队共享的环境变量与 Dockerfile，**可提交 git**（密钥写在项目根 `.env`）。

## 文件

| 文件 | 场景 | 提交 git |
|------|------|----------|
| `.env.local` | 本地 Docker 默认 | 是 |
| `.env.local.example` | 模板 | 是 |
| `Dockerfile` | agent-server 镜像 | 是 |

个人密钥与覆盖写在 **项目根 `.env`**，优先级高于本目录。

## 加载顺序（Docker）

1. `deploy/config/.env.local`
2. 项目根 `.env`（**优先**）

`deploy/docker-compose.yml` 的 `env_file` 按此顺序合并。

## 快速开始

```bash
cp .env.example .env          # 可选：LLM 密钥
cd deploy && npm link
agentm local                  # server + postgres + ollama
agentm local:pull-model       # 拉取 OLLAMA_MODEL
agentm local:reset            # 清卷重建 + 冒烟
```

本机已有 Ollama 时：

```bash
agentm local:host-ollama
```

未 `npm link` 时（仓库根目录）：

```bash
npm run docker:local
```

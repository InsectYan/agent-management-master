# agent-management-master

基于 Egg.js 的 **主 Agent 多方案平台**：支持 Pi、LangChain、Loop、ReAct 等执行方案可扩展注册；业务通过 **轻量 Skill 插件**（配置 + callbacks）接入。

- 设计：[`docs-design/主应用开发设计.md`](docs-design/主应用开发设计.md)
- 开发方案：[`docs-design/主应用完整开发方案.md`](docs-design/主应用完整开发方案.md)
- Agent 方案文档：[`docs/schemes/README.md`](docs/schemes/README.md)
- 对外 API：[`docs/api/README.md`](docs/api/README.md)
- 本地部署：[`deploy/README.md`](deploy/README.md)

**范围**：仅 Agent + BFF 服务层。不含前端；`fitness-agent` / `cartoon-agent` 仅作技术参考。

## 快速开始

### 本地开发（npm）

```bash
cp .env.example .env
npm install
npm run dev          # http://127.0.0.1:3001
npm run selftest:all
```

### 本地 Docker（推荐联调 / 接近生产）

```bash
cp .env.example .env
cd deploy && npm link
agentm local                  # server + ollama（默认，较轻量）
agentm local:full             # 含 postgres
agentm local:dev              # plugins 可写，改 Skill 无需 rebuild
agentm local:pull-model
agentm local:smoke
```

宿主机 Ollama：`agentm local:host-ollama`

未 link：`npm run docker:local`

详见 [`deploy/README.md`](deploy/README.md)、[`deploy/OPERATIONS.md`](deploy/OPERATIONS.md)。

## 主要 API

完整契约见 [`docs/api/README.md`](docs/api/README.md)。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 存活探针 |
| GET | `/ready` | 就绪探针 |
| GET | `/api/schemes` | 已注册 Agent 方案 |
| GET | `/api/plugins` | 已加载 Skill（含 dbTables、hasSkillDoc） |
| GET | `/api/plugins/:name/skill-doc` | Skill 的 SKILL.md 全文 |
| GET | `/api/llm/profiles` | LLM 配置 catalog |
| GET | `/api/memory` | 已启用记忆的 Skill |
| GET | `/api/memory/:skillName` | 读取记忆 |
| POST | `/api/memory/:skillName/append` | 追加记忆 |
| GET | `/api/skills/weather?city=上海` | LangChain 天气 Skill |
| POST | `/api/skills/note/chat` | Pi 记事对话 |
| POST | `/api/skills/note/chat/stream` | Pi 对话 SSE 流式 |
| POST | `/api/skills/research` | Loop 多步调研 |
| POST | `/api/skills/qa` | ReAct 工具问答 |
| POST | `/api/skills/:name/invoke` | 显式调用 Skill |

## 目录

```
app/lib/schemes/   # Agent 方案实现（pi / langchain / loop / react）
app/lib/llm/       # LLM catalog + 三级优先级解析
app/service/       # PluginManager、SkillInvoke、RouteManager
plugins/           # Skill 插件（note / weather / research / qa 示例）
docs/schemes/      # 各方案说明文档
```

## 新增 Skill

1. 在 `plugins/{name}-skill/` 创建：
   - `index.js` — 声明 `scheme`、`routes`、`dbTables`、`callbacks`
   - `SKILL.md` — 用途、执行动作、入参/出参、落库规则（平台启动时会解析）
   - `db/init.sql` — 与 `dbTables` 对应的建表脚本（启动时自动执行）
2. 重启 `npm run dev`（自动扫描加载并建表）

本地数据库默认 SQLite：`data/agent.sqlite`（见 `.env.example` 的 `SQLITE_PATH`）。

## 新增 Agent 方案

1. 实现 `app/lib/schemes/{name}/`
2. 在 `app/lib/schemes/registry.js` 注册
3. 编写 `docs/schemes/{name}/README.md`

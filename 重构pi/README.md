# 重构 Pi

> **地位**：`agent-management-master` 里 Pi 方案的施工依据。  
> **对照来源**：`fitness-agent/Can Delete/重构梳理/设计方案` 里的 Pi 2.0 升级和业务开发方式。健身仓的目录树不搬进本仓库。  
> **基线**：本仓现状是 `@earendil-works/pi-*` `^0.77.0`、Node 声明 `>=18`。目标与健身仓对齐到三个 Pi 包 `^1.1.0`、Node `>=22.19`。Docker 镜像已经是 `node:22`。

本仓库是一个进程托管多门业务。健身仓是「一个进程一门业务，换业务就复制 `harness/`」。两边的对应关系如下，施工按这张表，不按健身仓的目录原样搬家。

| 健身仓 | 本仓库 |
|--------|--------|
| `harness/pi` | `app/lib/schemes/pi/`，就地升级 |
| `src/` | `plugins/<skill>/`，继续是业务单元 |
| `src/http` 四个回合接口 | 现有 Skill 路由和 `POST /api/skills/:name/invoke` |
| 场景 skill（`SKILL.md`） | 插件目录里的 `SKILL.md`，由 Pi 加载 |
| 给运行时调用的 skill | `plugins/<skill>/modules/` 里的确定性函数 |
| 一进程一份 env | 一进程多项目，用 `project` 切开记忆、知识库、工作区 |

---

## 1. 目标

1. 把 Pi 执行器升到 Pi 2.0 已有能力：`createAgentSession`、`DefaultResourceLoader`、`defineTool`、`SessionManager`。不自研第二套会话或 skill 运行时，也不把 `AgentHarness` 耐久运行时当成 HTTP 入口。
2. Pi 技能的写法收干净：人设和 `SKILL.md` 只留在插件目录；工作区只放会话。`note-skill` 的路由、回调、落库、outbox 字段保持现在的行为。
3. 其它 scheme（`loop` / `react` / `langchain` / `action`）不改成 Pi。它们只补项目归属，好让记忆和知识库按项目分开。
4. 记忆和知识库按项目隔离。启动时能回答：当前关联了哪些项目、每个项目有哪些 skill。
5. 已有对外路径、方法、状态码和已有响应字段保持不变。

---

## 2. 冻结（本轮不改）

这些是调用方已经在用的契约，见 `docs/api/README.md`。

| 方法 | 路径 | 保持什么 |
|------|------|----------|
| GET | `/health` `/ready` | 探针 |
| GET | `/api/schemes` | 方案列表里仍有 `pi` |
| GET | `/api/plugins` `/api/plugins/:name` `/api/plugins/:name/skill-doc` | 已有字段不删、不改名 |
| GET | `/api/llm/profiles` `/api/media/profiles` | |
| POST | `/api/media/generate` | |
| GET | `/api/memory` | 已启用记忆的 skill 列表 |
| GET | `/api/memory/:skillName` | 按 **skill 名** 读取，不改成按项目读取 |
| POST | `/api/memory/:skillName/append` | |
| POST | `/api/memory/:skillName/search` | |
| POST | `/api/skills/:name/invoke` | 请求体、响应体字段 |
| POST | `/api/skills/note/chat` | `note-skill` |
| POST | `/api/skills/note/chat/stream` | SSE：`status` / `delta` / `done` / `error` |

响应里这些字段继续出现：`reply`、`output`、`meta`、`skill`、`scheme`、`llm_profile_id`、`llm_label`、`llm_source`。

Pi outbox 继续要求：`reply`、`message_type`、`intent`、`agent_name`。有记忆时仍可用 `memory_ops`，由现有 `MemoryEngine.applyOps` 合并。

`/api/plugins` 每条可以多一个 `project` 字段。这是增补，不是替换。`GET /api/projects` 是新增只读查询，不替代上面任何路径。

密钥仍由主应用 `resolveLlm()` 注入。Skill 不读 env 里的 apiKey。

---

## 3. 本轮不做

- 不把 Egg 应用拆成健身仓那种 `src/` + `harness/` 两棵树，也不把 `harness` 发布成包。
- 不把 `loop` / `react` / `langchain` / `action` 技能改写成 Pi。
- 不删除现有 file 记忆、vector 记忆、睡梦入队。它们是当前业务。Pi 的长期记忆仍以 `MEMORY.md` 为文件真相，不用向量再存一份同样的事实。
- 不改 `LLM_*`、`WORKSPACES_ROOT`、`MEMORY_FILES_DIR` 这些环境变量名。
- 不把健身套壳的 JWT、队列、业务账本迁进本仓库。
- 不做评测飞轮、黄金集、自动改 skill。验证只做契约、隔离和 outbox 形状。

---

## 4. 文档地图

| 文档 | 内容 |
|------|------|
| [01-现状与目标对照.md](./01-现状与目标对照.md) | 现在的 Pi 实现，以及和目标的差距 |
| [02-Pi技术升级.md](./02-Pi技术升级.md) | 包版本、会话入口、加载器、短期记忆 |
| [03-业务开发模式.md](./03-业务开发模式.md) | Pi 技能怎么写，对外行为怎么保持 |
| [04-项目隔离-记忆与知识库.md](./04-项目隔离-记忆与知识库.md) | 项目登记、记忆路径、知识库只读 |
| [05-分批节奏.md](./05-分批节奏.md) | 六批顺序和每批完成标准 |
| [06-验证方案.md](./06-验证方案.md) | 契约、隔离、升级冒烟 |
| [示例/](./示例/) | 新增 Pi skill、登记项目的模版 |

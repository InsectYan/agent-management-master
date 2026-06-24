# 对外 API 契约（Phase 5）

> 供独立前端 / curl / selftest 联调。OpenAPI 见 [`openapi.yaml`](openapi.yaml)。

## 基址

```
http://localhost:3001
```

## 通用约定

| 项 | 说明 |
|----|------|
| 请求 | `Content-Type: application/json`（GET 除外） |
| 响应 | JSON；SSE 路由返回 `text/event-stream` |
| 鉴权 | 本地模式无鉴权 |
| LLM 选择 | body/query 传 `llm_profile`（P1 优先级） |

## 平台 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 存活探针 |
| GET | `/ready` | 就绪探针 |
| GET | `/api/schemes` | Agent 方案列表 |
| GET | `/api/plugins` | Skill 列表 |
| GET | `/api/plugins/:name` | Skill 详情 |
| GET | `/api/plugins/:name/skill-doc` | SKILL.md 解析结果 |
| GET | `/api/llm/profiles` | LLM catalog |
| GET | `/api/memory` | 已启用记忆的 Skill |
| GET | `/api/memory/:skillName` | 读取记忆 |
| POST | `/api/memory/:skillName/append` | 追加记忆 `{ text, section? }` |
| POST | `/api/memory/:skillName/search` | 搜索 `{ query, limit? }` |
| POST | `/api/skills/:name/invoke` | 通用 Skill 调用 |

## Skill 路由（动态注册）

| 方法 | 路径 | Skill | scheme |
|------|------|-------|--------|
| POST | `/api/skills/note/chat` | note-skill | pi |
| POST | `/api/skills/note/chat/stream` | note-skill | pi (SSE) |
| GET | `/api/skills/weather?city=` | weather-skill | langchain |
| POST | `/api/skills/research` | research-skill | loop |
| POST | `/api/skills/qa` | qa-skill | react |

## 通用请求体

```json
{
  "session_id": "default",
  "message": "用户输入",
  "action": "chat",
  "llm_profile": "ollama-qwen"
}
```

## 通用响应体

```json
{
  "reply": "助手回复",
  "output": {},
  "meta": { "persisted": true },
  "skill": "note-skill",
  "scheme": "pi",
  "llm_profile_id": "ollama-qwen",
  "llm_label": "本地 Ollama · qwen",
  "llm_source": "skill"
}
```

## SSE 事件

| event | 数据 | 说明 |
|-------|------|------|
| `status` | `{ phase, label }` | 阶段进度 |
| `delta` | `{ delta, text }` | 流式文本 |
| `done` | 完整 JSON 响应 | 结束 |
| `error` | `{ message, status }` | 错误 |

## 记忆

- **file**：`note-skill` → `memory_files/note-skill/MEMORY.md`
- **vector**：`research-skill` → SQLite `memory_vectors` 表
- Pi outbox 含 `memory_ops` 时 BFF 自动 merge

## 相关文档

- Agent 方案：[`docs/schemes/README.md`](../schemes/README.md)
- 部署：[`deploy/README.md`](../../deploy/README.md)

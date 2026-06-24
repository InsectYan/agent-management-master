# note-skill — 记事对话 Skill

## 用途

Pi 方案示例：接收用户消息并返回助手回复。每轮对话写入 `note_entries` 表，可按 `session_id` 区分会话。

## 执行动作

| action | 说明 | 必填参数 |
| chat | 单轮对话 | message |
| list | 列出会话最近记事 | |

## 入参说明

- `message`：用户输入文本（`chat` 动作必填）
- `session_id`：会话标识，默认 `default`
- `action`：POST `/api/skills/note/chat` 未传时默认为 `chat`
- `llm_profile`：可选 LLM 配置覆盖

## 出参说明

- `reply`：助手回复文本
- `output`：结构化输出（含 intent、scheme 等）
- `meta.persisted`：是否已写入 `note_entries`
- `meta.entry_id`：本次写入的记录 ID

## 数据库表

| 表名 | 说明 |
| note_entries | 会话记事条目，字段见 `db/init.sql` |

## 调用示例

```bash
# 对话
POST /api/skills/note/chat
Content-Type: application/json
{"message": "帮我记一下：明天开会", "session_id": "work"}

# 列出会话记事
POST /api/skills/note-skill/invoke
{"action": "list", "session_id": "work"}
```

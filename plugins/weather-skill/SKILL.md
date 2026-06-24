# weather-skill — 天气查询 Skill

## 用途

根据城市名称查询天气信息（当前为 LangChain 方案占位实现）。每次成功查询应写入 `weather_history` 表，便于追溯历史记录。

## 执行动作

| action | 说明 | 必填参数 |
| query | 查询指定城市天气 | city |
| history | 查询某城市最近查询记录 | city |

## 入参说明

- `city`：城市名，中文或英文均可，默认「北京」
- `action`：执行动作；GET `/api/skills/weather` 未传时默认为 `query`
- `llm_profile`：可选，覆盖 Skill 默认 LLM 配置

## 出参说明

- `reply`：面向用户的文本回复
- `data`：结构化天气数据（占位阶段含 city、temperature、condition）
- `meta.persisted`：是否已写入 `weather_history`
- `meta.history_id`：本次写入的记录 ID

## 数据库表

| 表名 | 说明 |
| weather_history | 天气查询历史，字段见 `db/init.sql` |

## 调用示例

```bash
# 查询天气（默认 action=query）
GET /api/skills/weather?city=上海

# 查询历史
GET /api/skills/weather?city=上海&action=history
```

# research-skill — 循环调研 Skill

## 用途

Loop 方案示例：对指定主题进行多步迭代调研，每步 LLM 补充 note 并更新 summary，直至 done 或达到 maxSteps。

## 执行动作

| action | 说明 | 必填参数 |
| research | 多步调研 | topic |
| list | 列出最近调研记录 | |

## 入参说明

- `topic`：调研主题（`research` 必填）
- `action`：POST 未传时默认为 `research`
- `llm_profile`：可选 LLM 覆盖

## 出参说明

- `reply`：最终 summary
- `output.steps`：各步 partialOutput
- `output.stoppedReason`：终止原因
- `meta.persisted`：是否写入 `research_log`

## 调用示例

```bash
POST /api/skills/research-skill/invoke
{"topic": "Egg.js 插件机制", "action": "research"}
```

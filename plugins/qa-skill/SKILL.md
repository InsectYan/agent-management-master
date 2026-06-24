# qa-skill — ReAct 问答 Skill

## 用途

ReAct 方案示例：对问题进行 Thought / Action / Observation 推理，可调用 calculator、echoSearch 工具。

## 执行动作

| action | 说明 | 必填参数 |
| ask | ReAct 问答 | message |
| list | 最近问答记录 | |

## 入参说明

- `message`：用户问题（`ask` 必填）
- `action`：POST 未传时默认为 `ask`
- `llm_profile`：可选

## 调用示例

```bash
POST /api/skills/qa-skill/invoke
{"message": "计算 (12+8)*3 等于多少", "action": "ask"}
```

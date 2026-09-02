# novel-review-skill

小说平台核检 Skill：对照设定库与章节正文，输出结构化 `findings[]`，**不写库**。

## Actions

| action | 说明 |
|--------|------|
| `check_consistency` | 全书设定 + 已写正文抽样（全模块） |
| `validate_module` | 单模块（`module`=basic/world/factions/characters/outline/content/continuity） |
| `validate_chapter` | 单章正文对照全模块（需 `chapter_id`） |

## 入参（BFF 组装）

- `bound_context`：basic / world / factions / characters / edges / outline / chapters
- `deterministic_findings`：BFF 预检结果，勿重复
- `module` / `chapter_id`：按 action 可选

## 出参

```json
{
  "reply": "摘要",
  "findings": [
    {
      "module": "characters",
      "code": "unknown_character",
      "severity": "error|warning|info",
      "entity": "名称",
      "message": "问题说明",
      "evidence": "摘录",
      "suggestion": "建议"
    }
  ]
}
```

落点约定见 AMS `agent-skill-development.mdc`；业务入口为 novel-sub `POST /api/ai/review`。

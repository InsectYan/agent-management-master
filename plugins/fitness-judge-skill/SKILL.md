# fitness-judge-skill — Fitness 语义判定

## Action

| action | 说明 | 必填 |
|--------|------|------|
| judge | rubric 语义判定 | rubric_id, observations[], threshold_json? |
| explain | 运行失败解读（全模板 TPL-DET～TPL-MAN） | run_id, observations[], run_context? |
| pre_review | 人工评审 AI 预审 | materials (含 observations) |
| summary | 测试计划 AI 摘要 | plan_id, plan_name, observations[] |
| list-rubrics | 列出内置 rubric | — |

执行方案：**Loop**（非 ReAct）；`enrichContext` 注入 `topic` + `observations_text`，无需 `message`/`question`。

## judge 出参

```json
{ "pass": true, "score": 0.85, "reasons": ["…"] }
```

## pre_review 出参

```json
{ "score": 0.75, "checklist": [{ "item": "准确性", "ok": true, "note": "…" }] }
```

## 降级

LLM 不可用时按 observations 通过率规则降级（`lib/ruleFallback.js`）。

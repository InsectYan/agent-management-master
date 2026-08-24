# fitness-judge-skill — Fitness 语义判定

## Action

| action | 说明 | 必填 |
|--------|------|------|
| judge | rubric 语义判定 | rubric_id, observations[], threshold_json? |
| explain | 失败差异分析（配置 vs 目标 vs 实际） | run_id, observations[], config_text, expected_text, actual_text, assertion_diff_text?, run_context? |
| pre_review | 人工评审 AI 预审 | materials (含 observations) |
| summary | 测试计划 AI 摘要 | plan_id, plan_name, observations[] |
| list-rubrics | 列出内置 rubric | — |

执行方案：**Loop**；`explain` 使用 `templates/explain-system.md`。

## explain 输入约定

BFF 应传入三角材料：

- `config_text`：可执行配置（path/method/assertions.expect/…）
- `expected_text`：用例文案期望
- `actual_text`：HTTP/响应/断言 actual
- `assertion_diff_text`：失败断言 expect vs actual

LLM 不可用时 **不** 用规则汇总冒充成功（`meta.fallback=true`，markdown 为空）。

## 流式

`POST /api/skills/fitness-judge-skill/invoke-stream` 推送 `status`/`delta`，结束推送 `done`。

## judge 出参

```json
{ "pass": true, "score": 0.85, "reasons": ["…"] }
```

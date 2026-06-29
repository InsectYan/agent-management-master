# fitness-judge-skill — Fitness 语义判定

## Action

| action | 说明 | 必填 |
|--------|------|------|
| judge | rubric 语义判定 | rubric_id, observations[] |
| explain | 运行失败解读 | run_id, observations[] |
| pre_review | 人工评审 AI 预审 | rubric_id, observations[] |
| list-rubrics | 列出内置 rubric | — |

## judge 出参

```json
{ "pass": true, "score": 0.85, "reasons": ["…"] }
```

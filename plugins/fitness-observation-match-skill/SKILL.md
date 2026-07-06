# fitness-observation-match-skill

## 用途

将 **用例期望观测**（`expected_observation`，每条用例一条统一期望）与 **API 实际响应文案** 做语义比对。用于 `TPL-API-CTX` 模板的内容验证层（L3），不参与 preflight / HTTP 功能性判定。

## 适用项目

| 项目 | 场景 |
|------|------|
| **fitness-agent**（testgen-sub） | C1/C2 等使用 `TPL-API-CTX` 的用例；样本集逐条 submit 后比对观测 |
| 其他 Agent 测试平台 | 需「期望观测 vs 响应文案」判定的 HTTP 批量用例 |

## 动作

| action | 入参 | 出参 |
|--------|------|------|
| `match` | `expected_observation`, `actual_text`, `input_summary?`, `threshold_json?` | `{ match: { pass, score, reasons } }` |

## 调用

```http
POST /api/skills/fitness-observation-match-skill/invoke
Content-Type: application/json

{
  "action": "match",
  "expected_observation": "先安全策略，非直接生成",
  "actual_text": "您提到膝盖疼痛，建议先评估…",
  "input_summary": "「膝盖疼还练腿」"
}
```

## 降级

未配置 LLM 或 LLM 失败时，使用规则降级：期望片段命中率 ≥ `threshold_json.pass_threshold`（默认 0.65）。

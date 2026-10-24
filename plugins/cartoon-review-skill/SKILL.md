# cartoon-review-skill — 视频初审

## 用途

对照镜头和合规规则列出问题。只返回 JSON。不包含通过或驳回，不改成片，不调用 ComfyUI。

## 执行动作

| action | 说明 | 必填参数 |
|--------|------|----------|
| review_cut | 初审 | shots |

## 入参

- `shots`：编号、描述、台词、景别、运镜、时长
- `rules`：规则编号、类型、版本。敏感词正文只在这次调用里使用
- `model_profile`：文本档位名称
- 版本字段与生产剧本技能相同

## 出参

`output.issues`：`shot_id`、`rule_id`、`level`（`warning` 或 `block`）、`message`、`node`。说明不复述敏感词全文。没有 `pass` 或 `reject`。

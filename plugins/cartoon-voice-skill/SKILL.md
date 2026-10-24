# cartoon-voice-skill — 配音时间轴

## 用途

把镜头台词切成时间轴。只返回 JSON，不返回音频，不创建音色资产。

## 执行动作

| action | 说明 | 必填参数 |
|--------|------|----------|
| draft_timeline | 时间轴建议 | shots、voice_key |

## 入参

- `shots`：编号、台词、时长、情绪
- `voice_key`：已登记音色。为空时拒绝
- `model_profile`：档位名称
- 版本字段与 `cartoon-script-skill` 相同，故事包和本地文案不能同时出现

## 出参

`output.cues`：`shot_id`、`text`、`start_ms`、`end_ms`、`voice_key`。时间落在镜头时长内，同一镜头不重叠。有台词时 `text` 用镜头台词。

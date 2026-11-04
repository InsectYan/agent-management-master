# cartoon-prompt-skill — 漫剧提示词

## 用途

按分镜写中文正向、负向提示词与对白/音效备注。不改 ComfyUI 节点图，不提交出图。

要求描写丰富、动人、场景齐全：`positive_zh` 含风格、场记、时间轴、光影、表演、动态、承接；`production_note` 写对白与音效。附录精简条款对本平台不适用。

## 执行动作

| action | 说明 | 必填参数 |
| draft | 写提示词 | shots |

## 入参说明

- `shots`：分镜数组
- `visual_style` / `visual_style_label` / `visual_style_prompt`
- `genre` / `genre_subcategory` / `is_xianxia`
- `package_id`、`package_version` 或 `copy_block_id`：两者不能同时出现
- `content_type`：内容类型

## 出参说明

- `output.prompts`：positive_zh、negative_zh、production_note（落库时 production_note 并入 positive_zh）

重启 Agent 服务后新合同才会生效。

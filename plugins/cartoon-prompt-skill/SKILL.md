# cartoon-prompt-skill — 漫剧提示词

## 用途

按分镜写中文正向和负向提示词。不改 ComfyUI 节点图，不提交出图。

## 执行动作

| action | 说明 | 必填参数 |
| draft | 写提示词 | shots |

## 入参说明

- `shots`：分镜数组
- `visual_style`：画面风格，可空
- `package_id`、`package_version` 或 `copy_block_id`：两者不能同时出现
- `content_type`：内容类型

## 出参说明

- `output.prompts`：与分镜下标对齐的 positive_zh、negative_zh

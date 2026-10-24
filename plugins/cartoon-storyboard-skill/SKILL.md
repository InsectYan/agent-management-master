# cartoon-storyboard-skill — 漫剧分镜

## 用途

把短剧本拆成景别和运镜。只返回分镜行，不改小说正文，不调用 ComfyUI。

## 执行动作

| action | 说明 | 必填参数 |
| draft | 拆分镜 | script_data |

## 入参说明

- `script_data`：剧本概要、人物和场次
- `body`：章节正文，用于对齐情节
- `package_id`、`package_version` 或 `copy_block_id`：两者不能同时出现
- `content_type`：内容类型

## 出参说明

- `output.shots`：分镜数组，含 description、shot_size、camera_move

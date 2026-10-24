# cartoon-script-skill — 漫剧剧本

## 用途

把一章快照整理成短剧本：概要、人物外观、场次。只返回 JSON，不调用 ComfyUI，不改工作流节点。

## 执行动作

| action | 说明 | 必填参数 |
| draft | 整理剧本 | body |

## 入参说明

- `body`：章节正文
- `chapter_title`：章节标题
- `visual_style`：画面风格，可空
- `package_id`、`package_version`：钉扎的故事包。与 `copy_block_id` 不能同时出现
- `copy_block_id`：本地文案编号
- `content_type`：内容类型

## 出参说明

- `output.script_data.summary`：本章概要
- `output.script_data.characters`：人物名和外观
- `output.script_data.scenes`：场次标题和概要

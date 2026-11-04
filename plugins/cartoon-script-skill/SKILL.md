# cartoon-script-skill — 漫剧剧本

## 用途

把章节正文整理成可分镜的完整剧本。不改小说正文，不调用 ComfyUI。要求描写丰富、场景齐全，不以精简为由删减。

## 执行动作

| action | 说明 | 必填参数 |
| draft | 整理剧本 | body |

## 入参说明

- `body`：章节正文
- `chapter_title`：章节标题
- `visual_style` / `genre` / `is_xianxia`：风格与题材上下文
- `package_id`、`package_version` 或 `copy_block_id`：两者不能同时出现
- `content_type`：内容类型

## 出参说明

- `output.script_data`：summary、characters（含完整 look）、scenes（含完整 summary）

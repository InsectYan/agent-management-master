# cartoon-script-skill — 漫剧剧本

## 用途

把章节正文按情节节点归纳成可拍场次。可以改写叙述，对白留原句，不照抄章节，也不收成短摘要。场次下限按字数计算，节点更多就继续加，不锁定在下限。删减必须写入 omissions 并说明理由。

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

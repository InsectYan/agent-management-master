# cartoon-storyboard-skill — 漫剧分镜

## 用途

把剧本拆成剧情段（每段 8—15 秒可生成视频，段内可多次切镜）。镜头条数只有下限、没有上限。一条镜头的描述和提示词不设字数上限，对白多时可以写到数千字。跳过或删减必须写入 omissions 并说明理由。不改小说正文，不调用 ComfyUI。

系统提示会原样追加：

- `分镜10-15s.md`
- `Seedance2.5漫剧分镜构建师.md`
- 当 `is_xianxia=true` 时再追加 `修仙15漫剧提示词.md`

这些文档只允许补充落实，不允许优化删减简化。

## 执行动作

| action | 说明 | 必填参数 |
| draft | 拆剧情段 / 大纲 / 单段扩写 | script_data |

## 入参说明

- `script_data`：剧本概要、人物和场次
- `body`：章节正文，用于对齐情节
- `outline_only`：只出剧情覆盖与 `duration_sec`，不写完整时间轴
- `expand_one` + `seed_shot`：单段扩写（含 duration_sec）
- `package_id`、`package_version` 或 `copy_block_id`：两者不能同时出现
- `content_type`：内容类型
- `visual_style` / `visual_style_label` / `visual_style_prompt`：画面风格
- `genre` / `genre_subcategory`：题材，用于修仙路由
- `is_xianxia`：可显式指定是否修仙；缺省时按题材与风格自动判断

## 出参说明

- `output.shots`：分镜数组，含 description、duration_sec（8—15）、shot_sizes（主景别多选）、camera_moves（运镜多选）、dialogue

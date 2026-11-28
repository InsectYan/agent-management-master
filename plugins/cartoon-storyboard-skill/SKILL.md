# cartoon-storyboard-skill — 漫剧分镜

## 用途

把已定稿剧本拆成剧情段（动作 5—15 秒；对白说不完时总时长可以到 20 秒，多出来的时间只给对白）。同一条视频的时间轴可以从 3 段写到更多段，最短 0.5 秒；动作密或多次切镜时写细，一镜到底则保持连贯并把动作写清。镜头条数只有下限、没有上限。一条镜头的描述和提示词不设字数上限，对白多时可以写到数千字。跳过或删减必须写入 omissions 并说明理由。只读剧本，不回读章节原文，不调用 ComfyUI。

系统提示会原样追加：

- `剧本转分镜.md`（收进 `templates/shot-from-script.md`，景别、运镜、站位、动作术语、语气、光影和音效全文照用）
- `分镜10-15s.md`
- `Seedance2.5漫剧分镜构建师.md`
- 当 `is_xianxia=true` 时再追加 `修仙15漫剧提示词.md`

这些文档只允许补充落实，不允许优化删减简化。一条镜头的总时长仍是动作 5—15 秒、对白需要时最多 20 秒。原文对白不删字。画风不写进分镜正文。

## 执行动作

| action | 说明 | 必填参数 |
| draft | 拆剧情段 / 大纲 / 单段扩写 | script_data |

## 入参说明

- `script_data`：已定稿剧本。分镜只读这份剧本
- `body`：即使传入也会清空，不再用来补情节或对白
- `outline_only`：只出剧情覆盖与 `duration_sec`，不写完整时间轴。带 `scene_index` 时一次只拆这一场
- `expand_one` + `seed_shot`：单段扩写（含 duration_sec）
- `prev_shot`：提示词扩写时附上排序中的上一镜。含剧情、对白，以及已经写好的视频提示词和尾帧。只用来核对衔接，避免镜头剧情错位
- `package_id`、`package_version` 或 `copy_block_id`：两者不能同时出现
- `content_type`：内容类型
- `visual_style` / `visual_style_label` / `visual_style_prompt`：画面风格
- `genre` / `genre_subcategory`：题材，用于修仙路由
- `is_xianxia`：可显式指定是否修仙；缺省时按题材与风格自动判断

## 出参说明

- `output.shots`：分镜数组，含 description、duration_sec（动作 5—15，对白需要时总时长可到 30）、shot_sizes（主景别多选）、camera_moves（运镜多选）、dialogue

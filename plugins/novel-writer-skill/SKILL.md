# novel-writer-skill

小说平台结构化生成：把对话与头脑风暴火花写成可应用到表单的 `patch`。

## 用途

把用户意图写成可 apply 的 JSON patch。禁止直连 `novel_db`。

**禁止**直连 `novel_db`。会话与小说 CRUD 在小说 BFF。

## 执行动作

| action | 说明 |
|--------|------|
| fill_basic | 按 scene / target_fields 填基础信息（可多字段：title / creative_intent / summary / story_overview） |
| fill_world | 填世界观文本字段与 timeline[]（year + event） |
| fill_factions | 门派/家族/国家等组织数组 |
| fill_characters | 角色数组 + character_edges（role/relation 白名单） |
| fill_outline | volumes[].groups[].sections[] + word_target |
| fill_style | 从 serious / power / sweet / suspense / comedy 里选一个 style_preset |
| fill_plotlines | 剧情线数组：name / kind / status / summary |
| fill_chapters | chapters[]（title / faction / outline_ref，不要 order） |
| fill_chapter_body | 只写当前章 `body`，不带全书。本地模型收窄字数并关 think；云端模型按 word_target 放宽 |
| fill_script | 有正文时按章节整理；还没有正文时按大纲、人物、剧情线和风格写场次。只含场次、内外景、地点、人物、对白、动作 |
| fill_intent_shots | 按已有剧本场次给出叙事分镜建议。只含顺序、意图、台词、情绪、人物、地点、来源场次 |
| rewrite_field | 只改 target_fields 里的字段 |

## 入参（BFF 注入）

- `user_message` / `topic`
- `scene`：如 `basic.title`
- `target_fields`：如 `["title"]`
- `bound_context`：当前表单快照。作品选了风格预设时含 `style.name` 与 `style.note`，没有选择时不含这项
- `catalog`：枚举 id + name
- `history`：最近对话
- `sparks` / `brainstorm_reply`：上一棒头脑风暴

## 出参

```json
{
  "thinking": "简短推理",
  "reply": "给作者看的自然语言",
  "target_fields": ["title"],
  "patch": { "title": "……" }
}
```

`patch` 只含 target_fields 点名的键。世界观 `timeline` 为 `{year,event}[]`，不要编 id。类型/题材等枚举不要输出。

`fill_style` 的 `patch.style_preset` 只能是 `serious`、`power`、`sweet`、`suspense`、`comedy`。这个动作不落库。

`fill_plotlines` 的 `patch.plotlines` 为数组。每项含 `name`、`kind`（main/side/foreshadow/emotion）、`status`（open/active/resolved/dropped）、`summary`。同名表示调整，不要清空已有线。这个动作不落库。

`fill_script` 的 `patch.script` 为 `{ title, variant, scenes[] }`。`variant` 只能是 `comic` 或 `short_drama`。场次只含 `interior`（`in`/`out`）、`location`、`characters`、`dialogue`、`action`。不要输出景别、秒数、运镜或画面提示词。有章节正文时对白对齐正文；没有正文时按大纲、剧情线和人物写。这个动作不落库。

`bound_context` 有值才出现这些字段：`terms`（名称、别名、定义、分类）、人物的年龄、身份、外貌、语言风格、弧光、`style_preset`。没选风格时不要自行加语气。`fill_chapter_body` 只带当前章和相邻章。

`fill_intent_shots` 的 `patch.intent_shots` 为数组。每项含 `sort_order`、`scene_order`、`intent`、`dialogue`、`emotion`、`location`、`characters`（人物姓名）。不要输出运镜或画面提示词。人物必须来自人物卡。这个动作不落库。

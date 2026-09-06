# novel-brainstorm-skill

小说开书头脑风暴：书名候选、立意火花、短简介卖点、全书概要提纲。不产出枚举 id，不写 patch。

## 用途

围绕开书意图发散火花，供 `novel-writer-skill` 落成表单字段。

下一棒由 `novel-writer-skill` 把火花落成表单字段。`overview` 火花应能扩成 `story_overview` 长文；后续世界观/人物/大纲优先从概要提取。

## 执行动作

| action | 说明 |
|--------|------|
| ideate | 按 focus 发散（title / intent / summary / overview / genre / themes / auto） |

## 出参

```json
{
  "thinking": "",
  "reply": "给作者看的火花说明",
  "sparks": ["候选1", "候选2"],
  "suggested_fields": ["title"]
}
```

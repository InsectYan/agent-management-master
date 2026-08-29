# novel-writer-skill

小说平台结构化生成：把对话与头脑风暴火花写成可应用到表单的 `patch`。

## 用途

把用户意图写成可 apply 的 JSON patch。禁止直连 `novel_db`。

**禁止**直连 `novel_db`。会话与小说 CRUD 在小说 BFF。

## 执行动作

| action | 说明 |
|--------|------|
| fill_basic | 按 scene / target_fields 填基础信息（可多字段） |
| fill_world | 填世界观文本字段与 timeline[]（year + event） |
| fill_characters | 角色数组 + character_edges（role/relation 白名单） |
| rewrite_field | 只改 target_fields 里的字段 |

## 入参（BFF 注入）

- `user_message` / `topic`
- `scene`：如 `basic.title`
- `target_fields`：如 `["title"]`
- `bound_context`：当前表单快照
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

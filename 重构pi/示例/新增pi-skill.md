# 新增 Pi skill

只用于 `scheme: 'pi'` 的新技能。`loop` / `react` / `langchain` / `action` 不要套这个目录。

先在 [登记项目](./登记项目.md) 里把名字写进所属项目，再复制下面的骨架。

---

## 目录

```text
plugins/<skill-name>/
├── index.js
├── SKILL.md
└── prompts/
    └── AGENTS.md
```

需要确定性检查或业务工具时再加 `modules/`、`tools/`。单场景不要建 `scenes/`。

## index.js

`routes`、`callbacks` 按现有技能的写法。下面只标本轮新增、且和 Pi 有关的字段。

```javascript
module.exports = {
  name: '<skill-name>',
  project: '<project-id>',
  scheme: 'pi',
  routes: [],
  memoryConfig: { enabled: false },
  config: {
    llmDefaultProfile: 'ollama-qwen',
    actionDefaults: { POST: 'chat' },
    pi: { scenes: [], tools: [] },
  },
  callbacks: {
    async beforeExecute(ctx, params) { return params; },
    async enrichContext(ctx, params) { return params; },
    async persistResult(ctx, payload) { return { persisted: false }; },
    async formatResponse(ctx, result) {
      return { reply: result.text, output: result.output, meta: result.meta };
    },
  },
};
```

`formatResponse` 必须带上 `reply`、`output`、`meta`。主应用还会补 `skill`、`scheme` 和 llm 字段，技能里不要重写这些名字。

不要在技能里读模型密钥。

## SKILL.md

```markdown
---
name: <skill-name>
description: 一句话说明何时使用。
---

# <标题>

## 何时启用

-
## 步骤

1.

## 出参

| 字段 | 说明 |
|------|------|
| reply | |
| message_type | |
| intent | |
| agent_name | |
```

出参至少这四项，与 Pi outbox 一致。

## 给运行时调用的函数（可选）

路径：`modules/verification/<kebab-name>/index.js`

```javascript
async function run(input) {
  return { ok: true };
}

module.exports = { run };
```

在插件内登记这个 `module` + `name`，并在本文件的说明里写上调用时机。函数里不调用模型。

未登记时运行时得到 `skill_not_registered` 并跳过。

# Pi 方案（scheme: `pi`）

> **实现路径**：`app/lib/schemes/pi/`  
> **参考**：`fitness-agent/server/src/agent/runTurn.ts`、`cartoon-agent/server/src/agent/`

---

## 1. 方案定位

基于 **@earendil-works/pi-agent-core** 的单轮 Agent 执行：工作区文件、可选 tools、写 `outbox.json`。适合需要 **契约化输出**、**文件态上下文** 的子 Agent Skill。

主 Agent BFF 负责：拼 inbox、解析 outbox、调用 Skill 回调落库；Pi Executor 只负责 **一轮 LLM + tool + outbox**。

---

## 2. 适用 Skill 类型

- 需要 `SKILL.md` / 模板文件驱动话术
- 需要 bash `tools/*.mjs` 只读查库（经 internal API）
- 输出结构化 JSON（outbox 契约）

**不适用**：纯 LangChain Chain、无工作区的简单 completion（请用 `langchain` 方案）。

---

## 3. Executor 接口

```typescript
interface PiExecuteParams {
  workspaceKey: string;       // 如 skill_{id} 或 user_{id}
  sessionId: string;
  message: string;
  llm: LlmRuntimeConfig;
  templateDir?: string;       // skill 内 templates/，可选
  hooks?: PiTurnHooks;        // SSE status/delta
}

interface PiExecuteResult {
  reply: string;
  outbox?: Record<string, unknown>;
  raw?: unknown;
}
```

---

## 4. Skill 配置示例

```javascript
module.exports = {
  name: 'note-skill',
  scheme: 'pi',
  config: {
    llmDefaultProfile: 'ollama-qwen',
    workspacePrefix: 'skill_note',
  },
  callbacks: {
    async enrichContext(ctx, { message, sessionId }) {
      return { enrichedMessage: `## 当前消息\n${message}` };
    },
    async persistResult(ctx, { outbox, sessionId }) {
      // BFF 侧写 DB / 文件
    },
  },
};
```

---

## 5. 目录约定（Skill 侧，非方案代码）

```
plugins/{skill-name}/
├── index.js
├── SKILL.md              # 可选：Pi 可读契约
├── templates/            # 可选
└── tools/*.mjs           # 可选：只读 internal API
```

---

## 6. 限制

- 单 HTTP 请求默认映射 **一轮** Pi（与 fitness/cartoon 一致）
- 工作区路径由主 Agent 统一分配，Skill 不硬编码绝对路径
- apiKey 由主 Agent `resolveLlm()` 注入，Skill 不读 env 密钥

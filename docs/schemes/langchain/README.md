# LangChain 方案（scheme: `langchain`）

> **实现路径**：`app/lib/schemes/langchain/`  
> **参考**：`cartoon-agent` 早期设计、`主应用开发设计.md` §4.1 LangChainExecutor

---

## 1. 方案定位

通过 **LangChain.js**（或 OpenAI 兼容链式调用）执行子 Agent Skill：适合 **Chain、Tool、Retriever** 编排，无需 Pi 工作区文件。

Skill 通过 `callbacks` 注入 prompt 片段、解析链输出；主 Agent 提供 LLM 连接与路由。

---

## 2. 适用 Skill 类型

- 单次或短链 LLM 调用（分类、抽取、生成）
- 需挂载 LangChain Tool（查天气、查 DB 只读）
- 不需要 outbox / workspace 文件契约

---

## 3. Executor 接口

```typescript
interface LangChainExecuteParams {
  chainConfig: {
    type: 'llm' | 'tool-agent' | 'rag';  // skill config 声明
    systemPrompt?: string;
    tools?: string[];                     // 注册 tool 名
  };
  input: Record<string, unknown>;
  llm: LlmRuntimeConfig;
}

interface LangChainExecuteResult {
  output: unknown;
  text?: string;
  meta?: { tokens?: number; model?: string };
}
```

---

## 4. Skill 配置示例

```javascript
module.exports = {
  name: 'weather-skill',
  scheme: 'langchain',
  routes: [{
    path: '/api/skills/weather',
    method: 'GET',
    parameters: { city: { type: 'string', required: true } },
  }],
  config: {
    llmDefaultProfile: 'ollama-qwen',
    chain: {
      type: 'tool-agent',
      systemPrompt: '你是天气助手，仅回答天气相关问题。',
      tools: ['getWeather'],
    },
  },
  callbacks: {
    buildInput(ctx, req) {
      return { city: req.query.city };
    },
    formatResponse(ctx, result) {
      return { reply: result.text, data: result.output };
    },
  },
};
```

---

## 5. 扩展 Tool

Tool 实现放在 `app/lib/schemes/langchain/tools/`，Skill 通过 `config.chain.tools` 引用名称；**不在 Skill 目录内嵌复杂 Agent 工程**。

---

## 6. 实现阶段

| 阶段 | 内容 |
|------|------|
| Phase 3 | `LlmChain` + 单 tool 示例 + weather-skill |
| 后续 | RAG retriever、多 tool agent |

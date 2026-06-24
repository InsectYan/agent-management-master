# ReAct 方案（scheme: `react`）

> **实现路径**：`app/lib/schemes/react/`  
> **状态**：Phase 4 骨架 + 文档先行

---

## 1. 方案定位

**Reasoning + Acting** 模板：LLM 输出 Thought → Action → Observation 循环，直到 Final Answer。适合需要 **显式推理链**、**工具调用** 且步数可控的 Skill。

与 `langchain` tool-agent 可共享 Tool 注册表；ReAct 方案固定 **prompt 模板与解析器**。

---

## 2. 适用 Skill 类型

- 问答 + 工具调用（计算器、查 API、查 DB 只读）
- 需要可观测的推理步骤（写入 audit / SSE status）
- 单 Skill 内逻辑轻量，复杂度在 Executor 而非 Skill 目录

---

## 3. Executor 接口（规划）

```typescript
interface ReactExecuteParams {
  question: string;
  tools: string[];
  maxIterations: number;
  llm: LlmRuntimeConfig;
}

interface ReactExecuteResult {
  answer: string;
  trace: Array<{ thought?: string; action?: string; observation?: string }>;
}
```

---

## 4. Skill 配置示例

```javascript
module.exports = {
  name: 'qa-skill',
  scheme: 'react',
  config: {
    llmDefaultProfile: 'ollama-qwen',
    react: { maxIterations: 8, tools: ['search', 'calculator'] },
  },
  callbacks: {
    formatQuestion(ctx, params) {
      return params.message;
    },
    formatAnswer(ctx, result) {
      return { reply: result.answer, trace: result.trace };
    },
  },
};
```

---

## 5. 与 LangChain 方案协作

| 项 | langchain | react |
|----|-----------|-------|
| Prompt 结构 | Chain 配置灵活 | 固定 ReAct 模板 |
| 解析 | Chain 输出 | Thought/Action/Observation 正则或 JSON |
| Tool | 共用 `langchain/tools` | 共用 |

---

## 6. 实现里程碑

- [ ] `ReactExecutor` + 解析器
- [ ] SSE 推送 trace 步骤（可选）
- [ ] 示例 Skill `qa-skill` + selftest

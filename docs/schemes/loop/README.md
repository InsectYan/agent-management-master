# Loop 方案（scheme: `loop`）

> **实现路径**：`app/lib/schemes/loop/`  
> **状态**：Phase 4 骨架 + 文档先行

---

## 1. 方案定位

**循环迭代**执行：在 maxSteps 内重复「观察 → 决策 → 行动」，直到满足终止条件或步数上限。适合多步调研、批量处理、自我修正类 Skill。

与 `react` 的区别：Loop 强调 **固定循环结构** 与 **显式 break 条件**；ReAct 强调 **Thought / Action / Observation** 交替模板。

---

## 2. 适用 Skill 类型

- 需要多轮调用同一 LLM，带步数上限
- 每步结果写回上下文，下一步依赖上一步
- 不需要 Pi 文件工作区

---

## 3. Executor 接口（规划）

```typescript
interface LoopExecuteParams {
  maxSteps: number;
  stopWhen: 'tool-success' | 'llm-done' | 'custom';
  stepHandler: (ctx, stepIndex, state) => Promise<StepResult>;
  llm: LlmRuntimeConfig;
  initialState: Record<string, unknown>;
}

interface LoopExecuteResult {
  finalState: Record<string, unknown>;
  steps: StepResult[];
  stoppedReason: string;
}
```

---

## 4. Skill 配置示例

```javascript
module.exports = {
  name: 'testgen-skill',
  scheme: 'loop',
  config: {
    llmDefaultProfile: 'ollama-qwen',
    loop: {
      maxSteps: 4,
      stopWhen: 'llm-done',
      systemPromptFile: 'loop-system.md',   // templates/ 下 Prompt 文件
      initialState: { testCases: [], summary: '' },
      stateMerge: { testCases: 'concat', summary: 'replace', note: 'append' },
      listRecordsKey: 'testgen_runs',       // enrichContext 注入的 list 数据源
    },
  },
  callbacks: {
    async enrichContext(ctx, params) { /* 拼 doc_content、list 数据 */ },
    async persistResult(ctx, payload) { /* 落库 */ },
  },
};
```

`runLoop.js` 会从 `skill.config.loop` 读取自定义 Prompt、state 合并策略与 list 配置；未配置时回退为 research 默认行为。

---

## 5. testgen-skill 优化配置（推荐）

针对测试用例生成场景的 Loop 调优（见 `agent-management-sub/plugins/testgen-skill`）：

| 配置项 | 推荐值 | 说明 |
|--------|--------|------|
| `maxSteps` | 4 | 对应 analyze → functional → edge → review |
| `stopWhen` | `llm-done` | review 步输出 `done: true` 终止 |
| `stateMerge.testCases` | `concat` | 各 phase 用例累加，避免覆盖 |
| `userContextFields` | `doc_meta`, `endpoints`, `requirements_hint` | enrichContext 注入文档摘要 |
| `jsonSchemaHint` | 含 `phase`, `testCases[]`, `done` | 约束 LLM 结构化输出 |
| `temperature` | 0.3–0.5 | 用例生成偏确定性 |

**phase 状态机**：LLM 每步更新 `phase` 字段；`runLoop.js` 将 partial JSON merge 进 `initialState`，下一步 Prompt 携带当前 phase 与已有 `testCases` 摘要。

**与业务 BFF 协作**：Skill 的 `enrichContext` 通过 HTTP 拉取服务端文档 API，不在 Skill 内实现 PDF/MCP 工具。

设计文档：[测试用例生成-Agent与BFF层设计](../../../agent-management-sub/design-docs/testgen/测试用例生成-Agent与BFF层设计.md)

---

## 6. 实现里程碑

- [ ] `LoopExecutor` 继承 `AgentExecutor`
- [ ] 注册到 SchemeRegistry
- [x] 示例 Skill `testgen-skill`（测试用例生成）
- [ ] 示例 Skill `research-skill` + selftest

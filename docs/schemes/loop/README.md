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
  name: 'research-skill',
  scheme: 'loop',
  config: {
    llmDefaultProfile: 'ollama-qwen',
    loop: { maxSteps: 5, stopWhen: 'llm-done' },
  },
  callbacks: {
    async onStep(ctx, { stepIndex, state, llm }) {
      // 返回 { continue: boolean, state, partialOutput }
    },
    async onComplete(ctx, { finalState, steps }) {
      return { reply: finalState.summary };
    },
  },
};
```

---

## 5. 实现里程碑

- [ ] `LoopExecutor` 继承 `AgentExecutor`
- [ ] 注册到 SchemeRegistry
- [ ] 示例 Skill `research-skill` + selftest

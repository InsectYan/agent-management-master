# Agent 方案索引

> **读者**：主应用开发者、子 Agent（Skill）作者  
> **代码位置**：`app/lib/schemes/{scheme}/`（实现） ↔ 本文档目录（说明）

主 Agent 通过 **方案注册表（SchemeRegistry）** 统一管理多种 Agent 执行引擎。子 Agent 插件在 `index.js` 中声明 `scheme` 字段，主应用在运行时选择对应 Executor，**无需修改主应用核心代码** 即可接入新方案。

---

## 已规划方案

| scheme id | 名称 | 文档 | 实现状态 | 典型用途 |
|-----------|------|------|----------|----------|
| `pi` | Pi SDK | [pi/README.md](./pi/README.md) | Phase 2 | 文件工作区、tools、outbox 契约 |
| `langchain` | LangChain | [langchain/README.md](./langchain/README.md) | Phase 3 | Chain / Tool 编排、RAG |
| `loop` | Loop | [loop/README.md](./loop/README.md) | Phase 4（骨架） | 循环迭代、多步任务 |
| `react` | ReAct | [react/README.md](./react/README.md) | Phase 4（骨架） | 推理 + 行动交替 |

---

## 注册与扩展

### 1. 实现 Executor

每个方案目录需导出：

```javascript
// app/lib/schemes/{scheme}/index.js
class XxxExecutor extends AgentExecutor {
  static schemeId = 'xxx';
  async executeTask(ctx, params) { /* ... */ }
  async setupMemory(config) { /* optional */ }
  async teardownMemory() { /* optional */ }
}
module.exports = { XxxExecutor };
```

### 2. 注册到 SchemeRegistry

```javascript
// app/lib/schemes/registry.js
registry.register(require('./pi').PiExecutor);
registry.register(require('./langchain').LangChainExecutor);
```

### 3. 编写方案文档

在本目录下新建 `{scheme}/README.md`，说明：适用场景、配置项、与子 Agent 回调的协作方式、限制。

### 4. 子 Agent 选用

```javascript
// plugins/weather-skill/index.js
module.exports = {
  name: 'weather-skill',
  scheme: 'langchain',  // ← 指向本表中的 scheme id
  // ...
};
```

---

## 与子 Agent（Skill）的关系

```
HTTP 请求 → BFF → PluginManager 加载 skill 元数据
                        │
                        ├─ scheme: 'pi' | 'langchain' | ...
                        ▼
                 SchemeRegistry.get(scheme)
                        │
                        ▼
                 Executor.executeTask(ctx, params)
                        │
                        ├─ skill.callbacks.enrichContext (可选)
                        ├─ skill.callbacks.afterExecute / persistResult (可选)
                        ▼
                 响应 / SSE
```

**方案**负责「怎么跑 Agent」；**Skill**负责「跑什么业务、路由、表、回调」。

---

## 技术参考（外部仓库，不迁入本项目）

| 参考项目 | 可借鉴内容 |
|----------|------------|
| `fitness-agent` | Pi runTurn、BFF Pipeline、appSettings、记忆 merge |
| `cartoon-agent` | llmProfiles、sync SSE、outbox 落库、resolveChatLlm |

上述仓库 **仅作技术栈与模式参考**，不在 `agent-management-master` 内迁移或复制为插件。

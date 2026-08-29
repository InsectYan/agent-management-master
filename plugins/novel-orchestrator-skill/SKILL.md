# novel-orchestrator-skill

小说开书任务拆分：只产出 `patch.tasks`，**不写设定正文**，**不 invoke writer / brainstorm**。

会话与小说 CRUD 在小说 BFF。禁止直连 `novel_db`。

## 动作

| action | 说明 |
|--------|------|
| plan | 按 intent + coverage 拆五步 |
| replan | 已有 tasks 时按用户话重排状态 |

## 出参

```json
{
  "thinking": "",
  "reply": "先补基础信息，再写世界观。",
  "target_fields": ["tasks"],
  "patch": {
    "tasks": [
      { "id": "t_basic", "path": "plan.basic", "status": "pending", "reason": "还没有书名" }
    ]
  }
}
```

依赖由 BFF 强制：人物在世界观 `applied`/`skip` 前不能 dispatch。

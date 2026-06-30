# fitness-explore-skill — TS-05 探索 hook

| action | 说明 | 入参 | 出参 |
|--------|------|------|------|
| plan | 规划探索步骤 | current_steps[], env_url | steps[{ path, method, extract }] |

## 调用示例

```bash
curl -X POST http://127.0.0.1:4001/api/skills/fitness-explore-skill/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "action": "plan",
    "env_url": "https://staging.example.com",
    "current_steps": [{ "path": "/health", "method": "GET" }]
  }'
```

LLM 不可用时 `lib/planFallback.js` 基于 current_steps 追加探测步。

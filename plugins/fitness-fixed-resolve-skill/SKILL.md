---
name: fitness-fixed-resolve-skill
description: >-
  Resolve fixed auth/env/template bindings for Fitness DET launch.
  Reports missing_fixed without inventing template_id or secrets.
  Single action: resolve. Does not classify intent or patch config_json.
---

# fitness-fixed-resolve-skill

单职责：从 **本项目** `env_catalog` / `project_vars` / `api_templates_catalog` 解析固定值与资源引用；无法解析则列入 `missing_fixed`。禁止虚构。

## Action

| action | 说明 |
|--------|------|
| `resolve` | 输入 fields + catalogs + intent → resolved_fixed / bindings / missing_fixed |

## 不做

- 不判断测试意图（401/400）
- 不写 config_json 结构补丁
- 不生成样本

## 出参

```json
{
  "resolved_fixed": [{ "field": "headers.Authorization", "source": "env.global_headers", "present": true }],
  "bindings": { "preflight_api_template_id": 12 },
  "missing_fixed": [{ "field": "preflight_api_template_id", "expected_source": "ft_api_template", "detail": "..." }],
  "skip_resolve_fields": ["headers.Authorization"]
}
```

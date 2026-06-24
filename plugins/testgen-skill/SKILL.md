# testgen-skill — 文档驱动测试用例生成

## 用途

Loop 方案完整示例：读取 API/需求文档，通过 **多步循环迭代**（分析 → 功能用例 → 边界用例 → 评审）生成结构化测试用例，并落库 `testgen_runs`。支持文档注册、历史查询与单次结果回放。

## 执行动作

| action | 说明 | 必填参数 |
| generate | 根据文档多步生成测试用例 | doc_content |
| register-doc | 注册文档到库 | doc_content |
| list | 列出最近生成记录 | |
| get | 获取某次生成的完整用例 | run_id |

## 入参说明

### generate

| 参数 | 说明 |
|------|------|
| doc_content | 文档正文（Markdown / 纯文本） |
| doc_id | 已注册文档 ID（与 doc_content 二选一） |
| doc_path | 相对 Skill 目录的文档路径，如 `fixtures/sample-user-api.md` |
| doc_title / title | 文档标题（可选，可从正文推断） |
| llm_profile | 可选 LLM 覆盖 |

### register-doc

| 参数 | 说明 |
|------|------|
| doc_content | 文档正文 |
| doc_title | 文档标题 |
| doc_type | 默认 `markdown` |
| tags | 标签数组（可选） |

### get

| 参数 | 说明 |
|------|------|
| run_id | 生成记录 ID |

## 出参说明

### generate

| 字段 | 说明 |
|------|------|
| reply | 最终 summary 文本 |
| output.testCases | 结构化测试用例数组 |
| output.test_case_count | 用例数量 |
| output.steps | Loop 各步 partialOutput |
| output.stoppedReason | 终止原因 |
| output.coverage_notes | 覆盖分析 |
| meta.run_id | 落库记录 ID |
| meta.test_case_count | 用例数量 |
| meta.stepsRun | 实际执行步数 |

### testCases 单条结构

```json
{
  "id": "TC-001",
  "title": "正常注册",
  "type": "functional",
  "priority": "high",
  "preconditions": "无重复邮箱",
  "steps": ["POST /api/users/register", "..."],
  "expected": "201 + user_id",
  "tags": ["register"]
}
```

## 数据库表

| 表名 | 说明 |
|------|------|
| testgen_documents | 注册的源文档 |
| testgen_runs | 每次生成 run（含 test_cases_json） |

## Loop 迭代说明

默认 `maxSteps=4`，对应四个 phase：

1. **analyze** — 解析文档结构与接口清单
2. **functional** — 正向功能/接口用例
3. **edge** — 边界、异常、安全用例
4. **review** — 去重补全，输出最终 summary

LLM 每步输出 JSON，平台按 `config.loop.stateMerge` 合并 `testCases` 到 state。

## 调用示例

```bash
# 使用内置 fixture 生成
POST /api/skills/testgen-skill/invoke
Content-Type: application/json
{
  "action": "generate",
  "doc_path": "fixtures/sample-user-api.md"
}

# 内联文档
POST /api/skills/testgen
{
  "doc_content": "# 登录模块\n## 需求\n用户可使用邮箱登录...",
  "doc_title": "登录模块"
}

# 注册文档
POST /api/skills/testgen-skill/invoke
{"action": "register-doc", "doc_title": "支付 API", "doc_content": "..."}

# 列出历史
POST /api/skills/testgen-skill/invoke
{"action": "list"}

# 获取某次结果
POST /api/skills/testgen-skill/invoke
{"action": "get", "run_id": 1}
```

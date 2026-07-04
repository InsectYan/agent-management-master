# api-template-skill — 接口文档驱动接口模板生成

## 用途

Loop 方案：读取 API / OpenAPI / 需求文档，通过 **三步循环迭代**（分析 → 生成模板 → 评审）生成 `ft_api_template` 结构化草案，供 testgen-sub 平台用户确认后入库。

## 执行动作

| action | 说明 | 必填参数 |
|--------|------|----------|
| generate | 根据文档多步生成接口模板草案 | doc_content |
| list | 列出最近生成记录 | |
| get | 获取某次生成的完整模板 | run_id |

## 入参说明

### generate

| 参数 | 说明 |
|------|------|
| doc_content | 文档正文（Markdown / OpenAPI / 纯文本） |
| doc_id | 已注册文档 ID（与 doc_content 二选一） |
| doc_path | 相对 Skill 目录的文档路径 |
| doc_title / title | 文档标题（可选） |
| project_code | 所属项目编码（可选，写入模板 project_code） |
| hint | 用户备注 / 补充说明 |
| job_id | 平台任务 ID（用于进度上报） |
| llm_profile | 可选 LLM 覆盖 |

### 单条 apiTemplates 结构

```json
{
  "template_code": "user-register",
  "name": "用户注册",
  "description": "POST /api/users/register 注册接口",
  "http_method": "POST",
  "url_path": "/api/users/register",
  "headers_json": { "Content-Type": "application/json" },
  "query_json": {},
  "body_template": { "username": "{{username}}", "password": "{{password}}" },
  "inject_schema": [
    { "key": "username", "label": "用户名", "location": "body", "json_path": "username" },
    { "key": "password", "label": "密码", "location": "body", "json_path": "password" }
  ]
}
```

平台自动填入：`project_code`（来自任务配置）、`id`（入库后）。

## 出参说明

| 字段 | 说明 |
|------|------|
| output.apiTemplates | 最终接口模板数组 |
| output.steps | 各步摘要 |
| output.summary | 综合说明 |
| meta.stoppedReason | 停止原因 |

## 调用示例

```bash
POST /api/skills/api-template-skill/invoke
{
  "action": "generate",
  "doc_content": "# User API\nPOST /api/users/register",
  "project_code": "fitness-agent",
  "hint": "只需注册和登录接口",
  "job_id": 1
}
```

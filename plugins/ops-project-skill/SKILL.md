# ops-project-skill — 运维项目配置生成

## 位置（持续优化入口）

本 Skill **只维护在这一处**，后续扫描规则、流程图启发式、提示词都在此迭代：

```
agent-management-master/plugins/ops-project-skill/
├── SKILL.md                 # 契约（本文件）
├── index.js                 # 注册、callbacks、LLM / 规则兜底
├── lib/projectScanner.js    # 按 source_path 扫描目录 / 路由（含小程序 app.json）
├── lib/flowBinding.js       # 目录/路由 ↔ 流程 点对点绑定
├── lib/configAssembler.js   # 组装 ops-project/v1（总览按能力分簇 + 分流程）
└── templates/loop-system.md # LLM 系统提示
```

**不要**把生成逻辑复制到 `ops-sub` BFF。BFF 只负责：校验路径、转发 `POST /api/skills/ops-project-skill/invoke`、把返回的 document 写入项目库。

运维子应用：`admin-management-station/project-sub/ops-sub/`。

### Docker 下如何让路径可扫

Agent 容器默认看不到宿主机盘符。请把项目根挂到 `/host-projects`，并设置 `HOST_PROJECTS_ROOT=/host-projects`。

例如基础信息路径为 `E:/AI Tools/projects/private-project/admin-management-station/project-sub/novel-sub/frontend` 时，Skill 会尝试：

- 原路径
- `/host-projects/private-project/admin-management-station/project-sub/novel-sub/frontend`

## 用途

根据基础信息里的 **项目本地路径 `source_path`** 扫描代码，生成可导入运维平台的 `ops-project/v1` 配置（目录树、路由、功能流程图）。

固定生成 `key=overview` 的总览；其余按**业务能力**成组，不是「一页一条、且都能进所有流程」。

## 梳理硬约束（共性问题，必须遵守）

目录结构和路由**可以**进入流程图，但必须和流程有对应关系：

| 规则 | 正确 | 错误 |
|------|------|------|
| 绑定数量 | 一个路由/页面文件只绑 **一条** `flow_key` | 一个节点能进全部 flows |
| 总览 | `overview` 只做索引，不写到叶子 `flow_key` | 所有目录都绑 overview，假装万能入口 |
| 同能力多页 | 列表/创建/详情或同一评估多页 **共用** 一条流程 | 每页一条且互不相关，或反过来绑到所有流程 |
| 父目录 | 子节点同一条 flow 才继承；混杂则留空 | `pages/` 绑了某条流程，从而「进入」所有子页流程 |
| 支撑目录 | components / utils / assets / store / lib **不绑** | 工具目录也能「进入流程」 |
| 对端 | 写「进入后端/Agent（黑盒）」 | 在前端流程里展开 Agent skill 全文 |

总览里：有衔接的连边，无衔接的单独成簇，不要用「下一步」把无关页面串成一条直线。

## 执行动作

| action | 说明 | 必填参数 |
|--------|------|----------|
| generate | 扫描路径并生成完整配置 | source_path |
| regenerate | 在已有配置上按提示词重生成 | source_path |

## 入参

| 参数 | 说明 |
|------|------|
| source_path | 项目根目录绝对路径（基础信息中的「项目路径」） |
| name | 项目名称 |
| type / project_type | frontend \| backend \| fullstack \| agent |
| description | 简介 |
| repo_url | Git 地址 |
| hint | 用户补充提示词（编辑页重生成时常用） |
| existing | 已有配置（regenerate 时传入，作对照） |
| llm_profile | 可选模型覆盖 |

## 出参

| 字段 | 说明 |
|------|------|
| output.document | 完整 `ops-project/v1` 对象 |
| output.summary | 生成说明 |
| output.source | `llm` 或 `rule_fallback` |
| output.scan | 扫描摘要（文件数、路由数、流程数） |

## 调用示例

```bash
POST /api/skills/ops-project-skill/invoke
{
  "action": "generate",
  "source_path": "E:/AI Tools/projects/private-project/admin-management-station/project-sub/novel-sub/frontend",
  "name": "小说创作平台前端",
  "type": "frontend",
  "hint": "按能力绑定 flow_key，目录和路由只能进入对应流程"
}
```

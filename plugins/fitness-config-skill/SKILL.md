# fitness-config-skill

Fitness 测试用例配置模板自动生成 Skill。

## 执行动作

| action | 说明 | 必填参数 |
|--------|------|----------|
| generate_det | 生成确定性单次配置 | item |
| generate_bnd | 生成边界矩阵配置 | item |
| generate_rep | 生成重复抽样配置 | item |
| generate_chain | 生成多步链路配置 | item |
| generate_pair | 生成对照对比配置 | item |
| generate_neg | 生成对抗专项配置 | item |
| generate_obs | 生成可观测稽核配置 | item |
| generate_load | 生成压测容量配置 | item |
| generate_config | 通用兜底（同 generate_det） | item, template_code |

## 出参

```json
{
  "config_json": {},
  "threshold_json": {},
  "summary": "string"
}
```

## 关联模板

- TPL-DET / BND / REP / CHAIN / PAIR / NEG / OBS / LOAD → 本 Skill
- TPL-SET → fitness-sample-skill
- TPL-MAN → 无 Agent（人工评审）

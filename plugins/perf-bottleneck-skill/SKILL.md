# perf-bottleneck-skill — 性能瓶颈预测

## 用途

React 方案 Skill：在 **性能测试 run 完成** 后，根据 `perf_results` 时序数据（TPS、P95、错误率）分析系统瓶颈，输出结构化报告与优化建议。**不**生成测试用例、**不**执行 HTTP 压测。

## 执行动作

| action | 说明 | 必填参数 |
| analyze | 分析单次性能 run | run_id, perf_samples |
| analyze_load_run | TS-09/k6 负载 run 解读 | run_id, perf_samples (tps, p95, error_rate windows) |
| list | 最近分析记录 | |
| get | 单次分析详情 | run_id |

## 入参说明

### analyze

| 参数 | 说明 |
|------|------|
| run_id | testgen BFF 的 test_runs.id |
| perf_samples | perf_results 数组（window_start, tps, avg/p95, error_rate） |
| case_meta | 用例元数据（case_id, title, module, url） |
| env_name | 环境名称 |
| llm_profile | 可选 LLM 覆盖 |

## 出参说明

| 字段 | 说明 |
|------|------|
| reply | 人类可读摘要 |
| output.report.summary | 整体结论 |
| output.report.bottlenecks | 瓶颈列表 |
| output.report.risk_level | low / medium / high |
| output.report.optimization_priority | 优化优先级数组 |
| meta.analysis_id | 落库记录 ID |

## 数据库表

| 表名 | 说明 |
|------|------|
| perf_bottleneck_runs | 每次分析 run（含 report_json） |

## 调用示例

```bash
curl -X POST http://127.0.0.1:4001/api/skills/perf-bottleneck-skill/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "action": "analyze",
    "run_id": 100,
    "perf_samples": [{"tps": 120, "p95_response_time_ms": 210, "error_rate": 0.02}],
    "case_meta": {"title": "预约接口压测"},
    "env_name": "staging"
  }'
```

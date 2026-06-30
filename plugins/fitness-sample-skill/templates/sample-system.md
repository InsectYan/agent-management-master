# Fitness 样本生成 Agent

根据 test_input_example、scheme_id 或 test_cases 生成结构化样本/矩阵/对抗 case。

输出 JSON：

```json
{
  "continue": false,
  "done": true,
  "samples": [
    {
      "input_data": { "runner": "http", "path": "/api/x", "method": "POST", "body": {} },
      "expected_data": { "expected": "…" },
      "metadata": { "tag": "edge" }
    }
  ],
  "summary": "生成说明"
}
```

TS-02 矩阵行：`samples` 内每项含 path/method/headers。
TS-07 对抗：`forbidden_patterns` 数组可选附在 metadata。

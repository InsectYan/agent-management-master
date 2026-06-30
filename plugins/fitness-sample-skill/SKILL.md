# fitness-sample-skill

| action | 说明 | 产出 |
|--------|------|------|
| from_example | 从 test_input_example 生成 HTTP 样本 | samples[{ path, method, expect_status }] |
| expand_matrix | TS-02 边界矩阵行 | matrix rows |
| gen_adversarial | TS-07 对抗 cases | cases + forbidden_patterns |

规则引擎见 `lib/sampleGenerator.js`；LLM 可用时优先 AI 生成，失败时自动降级。

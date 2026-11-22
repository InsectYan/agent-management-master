# cartoon-prompt-skill — 漫剧提示词

## 用途

按分镜写中文正向、负向提示词与对白/音效备注。不改 ComfyUI 节点图，不提交出图。

要求描写丰富、动人、场景齐全：`positive_zh` 含风格、场记、时长。时间轴从 3 段起到更多段都可以，不设上限，最短一档 0.5 秒。动作密或多次切镜时写细；一镜到底保持一条运镜，并把动作路径写清。对白按镜头 dialogue 的原句放进对应段，不改词、不漏句。情节改成景别、姿态路径、运镜和光，不要把故事再总结一遍。大段心理收成眉、眼、视线和呼吸。漏掉原句的稿子会打回重写。`production_note` 核对对白并写音效。附录精简条款对本平台不适用。镜头里出现动作时，读取公共动作知识库里对应的模版；亲密模版只在双方都已写明满二十一岁时调用。公共动作知识库里的 `phraseMap.json` 由人维护：生成提示词时，视频提示词、首帧、尾帧里命中左侧原句的文字会换成右侧说法，长句优先。「」里的对白原句不换。表里没有的说法不要另做替换。

## 执行动作

| action | 说明 | 必填参数 |
| draft | 写提示词 | shots |

## 入参说明

- `shots`：分镜数组
- `visual_style` / `visual_style_label` / `visual_style_prompt`
- `genre` / `genre_subcategory` / `is_xianxia`
- `package_id`、`package_version` 或 `copy_block_id`：两者不能同时出现
- `content_type`：内容类型

## 出参说明

- `output.prompts`：一次只写一项。`prompt_part=positive` 写 positive_zh；`frame_start` 写首帧，可参考已写好的 positive_zh；`frame_end` 写尾帧。negative_zh 跟视频提示词一起写。`shot.source_excerpt` 是这一镜对应的原文段。

重启 Agent 服务后新合同才会生效。

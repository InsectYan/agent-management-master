# cartoon-av-prompt-skill — AV 视频和静帧提示词

## 用途

漫剧、短剧项目开启 AV 后，常规提示词技能先写一稿，本技能再收口一次。动作和人体变化统一读公共动作知识库。双方都已写明满二十一岁并且命中亲密动作时，再引用男女体征知识库，用解剖名称写镜头里已经出现的部位。不满足就不引用，也不补原文没有的身体部位。

不改 ComfyUI 节点图，不提交出图。公共动作知识库里的 `phraseMap.json` 由人维护：收口后的视频提示词、首帧、尾帧会按这张表做整句替换，长句优先。「」里的对白原句不换。表里没有的说法不要另做替换。

## 执行动作

| action | 说明 | 必填参数 |
| draft | 写提示词 | shots |

## 出参说明

- `output.prompts`：positive_zh 是视频，frame_start_zh 是首帧，frame_end_zh 是尾帧。negative_zh 一份共用。production_note 核对对白并写音效。

重启 Agent 服务后新技能才会被加载。

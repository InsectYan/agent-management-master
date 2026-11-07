# cartoon-av-prompt-skill — AV 视频提示词

## 用途

漫剧、短剧项目开启 AV 后，常规提示词技能先写一稿，本技能再调用一次做收口。不代替常规技能。收口时按时间片重排画面，每个时间片写光影、表演、动态、承接，并保留该片对白原句。人体和道具用看得见的外形，隐私部位用解剖名称，不用美化替代。人物、动作和时间以常规稿为准。

不改 ComfyUI 节点图，不提交出图。

## 执行动作

| action | 说明 | 必填参数 |
| draft | 写提示词 | shots |

## 出参说明

- `output.prompts`：positive_zh、negative_zh、production_note
- 对白原句留在 positive_zh 的对应时间片里，production_note 再列一遍供核对

重启 Agent 服务后新技能才会被加载。

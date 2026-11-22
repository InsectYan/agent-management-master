# cartoon-script-skill — 漫剧剧本

## 用途

把章节按剧情分成场次。每场写这段剧情的摘要、人物身穿的衣服，并留下这段开头的一句原文。场次用来让整章连成剧本。镜头下一步再按这句原文往后的段落拆。标题写成「内·地点·日」或「外·地点·夜」。不写景别和运镜，不调 ComfyUI。

第一稿未通过定稿检查时，按缺失项重写一次。第二稿仍不合格时，结果标记为未定稿，调用方不得保存。

## 执行动作

| action | 说明 | 必填参数 |
| draft | 整理剧本 | body |

## 入参说明

- `body`：章节正文
- `chapter_title`：章节标题
- `content_type`：内容类型。短剧会要求开场进入冲突、收场留钩子
- `av_mode`：项目是否勾选 AV
- `min_scenes`：场次下限，只防止长章被收成概述
- 画面风格、题材和是否修仙不送进这一步。场次只按正文拆
- `package_id`、`package_version` 或 `copy_block_id`：两者不能同时出现

## 出参说明

- `output.script_data.logline`：一句话故事
- `output.script_data.summary`：这一章从哪件事到哪件事
- `output.script_data.characters`：人名和外形。正文写了的外形按原文锁定；找不到人物描写时只写「正文未写」，不编造
- `output.script_data.scenes`：`title`、`summary`、`purpose`
- `output.script_data.omissions`：删掉的情节
- `output.script_data.accepted`：定稿检查是否通过
- `output.script_data.reject_reasons`：未通过时的原因，不引用原句

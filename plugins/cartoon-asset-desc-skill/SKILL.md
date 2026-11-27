# cartoon-asset-desc-skill — 资产描述

## 用途

按项目指定的一种画风，套用人物、场景或道具公式，写成一条可直接生图的描述。描述里不写三视图、不写多视角。提交出图时，人物会另生成面部特写和全身全景，场景只生成一张全景。

## 执行动作

| action | 说明 | 必填参数 |
|--------|------|----------|
| draft | 写一条资产描述 | kind、name |

## 入参

- `kind`：`character`、`scene` 或 `prop`
- `name`：资产名称
- `notes`：已有外形、空间或备注
- `visual_style`：项目画风取值，只抽取这一条风格知识
- `visual_style_label` / `visual_style_prompt`：项目风格名称和说明
- `av_nude`：为 true 时人物描述写成全裸

## 出参

`output.description`：一段中文生图描述。

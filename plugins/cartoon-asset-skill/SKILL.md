# cartoon-asset-skill — 资产建议

## 用途

根据镜头描述，建议绑定哪条已经登记的资产。只返回 JSON。不上传图片，不生成三视图，不训练 LoRA，不写视频库。

## 执行动作

| action | 说明 | 必填参数 |
|--------|------|----------|
| suggest | 建议绑定 | shots、assets |

## 入参

- `shots`：镜头编号、描述、台词
- `assets`：未停用资产的编号、类型、名称、场景类型、道具分类、音色标识
- `package_id` 与 `package_version`，或 `copy_block_id`。两者同时出现时拒绝
- `content_type`：内容类型

## 出参

`output.suggestions`：`shot_id`、`asset_id`、`reason`。`asset_id` 必须来自入参。找不到时省略该项。

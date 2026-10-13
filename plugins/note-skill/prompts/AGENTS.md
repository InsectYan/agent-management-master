# note-skill

Pi 方案示例：接收用户消息并返回助手回复。每轮对话写入 `note_entries` 表，可按 `session_id` 区分会话。

本轮必须 write sessions/<id>/outbox.json（合法 JSON，含 reply、message_type、intent、agent_name）。

可用 read、grep、bash、write。长期记忆由系统注入；若要记住偏好，写入 outbox 的 memory_ops，不要在工作区另写 MEMORY.md。

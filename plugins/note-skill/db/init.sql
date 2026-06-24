-- note-skill 业务表：会话记事条目
CREATE TABLE IF NOT EXISTS note_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL DEFAULT 'default',
  user_message TEXT NOT NULL,
  assistant_reply TEXT,
  llm_profile_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_note_entries_session ON note_entries(session_id);
CREATE INDEX IF NOT EXISTS idx_note_entries_created ON note_entries(created_at);

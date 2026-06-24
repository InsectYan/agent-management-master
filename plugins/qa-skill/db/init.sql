CREATE TABLE IF NOT EXISTS qa_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  answer TEXT,
  iterations INTEGER DEFAULT 0,
  llm_profile_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

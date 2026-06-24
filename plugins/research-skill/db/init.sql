CREATE TABLE IF NOT EXISTS research_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic TEXT NOT NULL,
  summary TEXT,
  steps_count INTEGER DEFAULT 0,
  stopped_reason TEXT,
  llm_profile_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

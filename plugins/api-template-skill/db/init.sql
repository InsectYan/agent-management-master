CREATE TABLE IF NOT EXISTS api_template_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_title TEXT,
  project_code TEXT,
  summary TEXT,
  templates_count INTEGER DEFAULT 0,
  steps_count INTEGER DEFAULT 0,
  stopped_reason TEXT,
  llm_profile_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

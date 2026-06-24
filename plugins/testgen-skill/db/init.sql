CREATE TABLE IF NOT EXISTS testgen_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  doc_type TEXT DEFAULT 'markdown',
  content TEXT NOT NULL,
  source TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS testgen_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER,
  doc_title TEXT NOT NULL,
  summary TEXT,
  test_cases_json TEXT DEFAULT '[]',
  steps_count INTEGER DEFAULT 0,
  stopped_reason TEXT,
  coverage_notes TEXT,
  llm_profile_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (doc_id) REFERENCES testgen_documents(id)
);

CREATE INDEX IF NOT EXISTS idx_testgen_runs_doc_id ON testgen_runs(doc_id);
CREATE INDEX IF NOT EXISTS idx_testgen_runs_created ON testgen_runs(created_at);

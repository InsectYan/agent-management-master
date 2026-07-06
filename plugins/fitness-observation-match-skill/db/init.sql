CREATE TABLE IF NOT EXISTS fitness_observation_match_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id TEXT,
  item_id TEXT,
  expected_observation TEXT,
  actual_excerpt TEXT,
  pass INTEGER,
  score REAL,
  fallback INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

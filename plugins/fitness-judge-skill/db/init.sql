-- fitness-judge-skill (SQLite)

CREATE TABLE IF NOT EXISTS fitness_judge_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER,
  item_id TEXT,
  rubric_id TEXT,
  action TEXT,
  result_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fitness_judge_runs_run ON fitness_judge_runs(run_id);

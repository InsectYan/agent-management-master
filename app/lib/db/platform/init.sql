CREATE TABLE IF NOT EXISTS execution_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_key TEXT NOT NULL DEFAULT '',
  skill_name TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  flow_key TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  target_label TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'running',
  error_text TEXT NOT NULL DEFAULT '',
  elapsed_ms INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT '',
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_execution_runs_started
  ON execution_runs(started_at);

CREATE INDEX IF NOT EXISTS idx_execution_runs_skill
  ON execution_runs(skill_name, started_at);

CREATE TABLE IF NOT EXISTS execution_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  node_key TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  skill_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'running',
  log_text TEXT NOT NULL DEFAULT '',
  error_text TEXT NOT NULL DEFAULT '',
  elapsed_ms INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT '',
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_execution_steps_run
  ON execution_steps(run_id, sort_order, id);

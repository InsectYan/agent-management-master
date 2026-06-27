-- perf-bottleneck-skill (SQLite)

CREATE TABLE IF NOT EXISTS perf_bottleneck_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  report_json TEXT NOT NULL,
  risk_level TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_perf_bottleneck_runs_run ON perf_bottleneck_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_perf_bottleneck_runs_created ON perf_bottleneck_runs(created_at DESC);

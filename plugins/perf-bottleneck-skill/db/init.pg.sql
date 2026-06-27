-- perf-bottleneck-skill (PostgreSQL)

CREATE TABLE IF NOT EXISTS perf_bottleneck_runs (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL,
  report_json JSONB NOT NULL,
  risk_level VARCHAR(16),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_perf_bottleneck_runs_run ON perf_bottleneck_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_perf_bottleneck_runs_created ON perf_bottleneck_runs(created_at DESC);

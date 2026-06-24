-- testgen-skill (PostgreSQL)

CREATE TABLE IF NOT EXISTS testgen_documents (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  doc_type TEXT DEFAULT 'markdown',
  content TEXT NOT NULL,
  source TEXT DEFAULT '',
  tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS testgen_runs (
  id BIGSERIAL PRIMARY KEY,
  doc_id BIGINT REFERENCES testgen_documents(id),
  doc_title TEXT NOT NULL,
  summary TEXT,
  test_cases_json JSONB DEFAULT '[]'::jsonb,
  steps_count INTEGER DEFAULT 0,
  stopped_reason TEXT,
  coverage_notes TEXT,
  llm_profile_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_testgen_runs_doc_id ON testgen_runs(doc_id);
CREATE INDEX IF NOT EXISTS idx_testgen_runs_created ON testgen_runs(created_at DESC);

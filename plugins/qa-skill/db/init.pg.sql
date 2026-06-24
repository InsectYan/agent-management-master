-- qa-skill (PostgreSQL)
CREATE TABLE IF NOT EXISTS qa_log (
  id BIGSERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT,
  iterations INTEGER DEFAULT 0,
  llm_profile_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

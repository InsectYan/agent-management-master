-- research-skill (PostgreSQL)
CREATE TABLE IF NOT EXISTS research_log (
  id BIGSERIAL PRIMARY KEY,
  topic TEXT NOT NULL,
  summary TEXT,
  steps_count INTEGER DEFAULT 0,
  stopped_reason TEXT,
  llm_profile_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

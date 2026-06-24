-- note-skill (PostgreSQL)
CREATE TABLE IF NOT EXISTS note_entries (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL DEFAULT 'default',
  user_message TEXT NOT NULL,
  assistant_reply TEXT,
  llm_profile_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_note_entries_session ON note_entries(session_id);
CREATE INDEX IF NOT EXISTS idx_note_entries_created ON note_entries(created_at DESC);

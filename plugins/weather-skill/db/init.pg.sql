-- weather-skill (PostgreSQL)
CREATE TABLE IF NOT EXISTS weather_history (
  id BIGSERIAL PRIMARY KEY,
  city TEXT NOT NULL,
  query_text TEXT,
  reply_text TEXT,
  llm_profile_id TEXT,
  temperature REAL,
  condition_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weather_history_city ON weather_history(city);

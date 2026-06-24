-- weather-skill 业务表：天气查询历史
CREATE TABLE IF NOT EXISTS weather_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city TEXT NOT NULL,
  query_text TEXT,
  reply_text TEXT,
  llm_profile_id TEXT,
  temperature REAL,
  condition_text TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_weather_history_city ON weather_history(city);
CREATE INDEX IF NOT EXISTS idx_weather_history_created ON weather_history(created_at);

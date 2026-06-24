-- Platform schema: plugin registry, pgvector memory, dream jobs

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS plugin_registry (
  skill_name TEXT PRIMARY KEY,
  version TEXT,
  scheme TEXT,
  db_tables JSONB,
  enabled BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memory_embeddings (
  id BIGSERIAL PRIMARY KEY,
  skill_name TEXT NOT NULL,
  memory_table TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(768),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_embeddings_skill
  ON memory_embeddings(skill_name, memory_table);

-- ivfflat/hnsw 索引在有一定数据量后创建（见 memory 迁移脚本）

CREATE TABLE IF NOT EXISTS memory_dream_jobs (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_name TEXT NOT NULL,
  session_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  not_before TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trigger_kind TEXT NOT NULL DEFAULT 'session_idle',
  request_json JSONB DEFAULT '{}'::jsonb,
  result_json JSONB,
  error_text TEXT,
  worker_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dream_jobs_pending
  ON memory_dream_jobs(status, not_before);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dream_jobs_pending_session
  ON memory_dream_jobs(skill_name, session_id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS pipeline_runs (
  run_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started ON pipeline_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON pipeline_runs (status);

-- ============================================
-- PERFORMANCE TRACKING & BACKTESTING
-- ============================================

CREATE TABLE signal_snapshots (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL REFERENCES stocks(symbol),
  snapshot_date DATE NOT NULL,
  price_at_signal NUMERIC(12,4) NOT NULL,

  sentinel_score INTEGER,
  technical_score INTEGER,
  fundamental_score INTEGER,
  earnings_ai_score INTEGER,
  insider_score INTEGER,
  institutional_score INTEGER,
  news_sentiment_score INTEGER,
  options_flow_score INTEGER,

  insider_flags TEXT[],
  flow_flags TEXT[],
  sector TEXT,
  sector_rotation_signal TEXT,

  trigger_type TEXT NOT NULL,
  trigger_detail TEXT,

  price_1d NUMERIC(12,4),
  price_3d NUMERIC(12,4),
  price_7d NUMERIC(12,4),
  price_14d NUMERIC(12,4),
  price_30d NUMERIC(12,4),
  price_60d NUMERIC(12,4),
  price_90d NUMERIC(12,4),

  return_1d NUMERIC(8,4),
  return_3d NUMERIC(8,4),
  return_7d NUMERIC(8,4),
  return_14d NUMERIC(8,4),
  return_30d NUMERIC(8,4),
  return_60d NUMERIC(8,4),
  return_90d NUMERIC(8,4),

  spy_return_1d NUMERIC(8,4),
  spy_return_3d NUMERIC(8,4),
  spy_return_7d NUMERIC(8,4),
  spy_return_14d NUMERIC(8,4),
  spy_return_30d NUMERIC(8,4),
  spy_return_60d NUMERIC(8,4),
  spy_return_90d NUMERIC(8,4),

  alpha_1d NUMERIC(8,4),
  alpha_7d NUMERIC(8,4),
  alpha_14d NUMERIC(8,4),
  alpha_30d NUMERIC(8,4),
  alpha_60d NUMERIC(8,4),
  alpha_90d NUMERIC(8,4),

  max_drawdown_30d NUMERIC(8,4),
  max_drawdown_90d NUMERIC(8,4),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_snapshots_trigger ON signal_snapshots(trigger_type, snapshot_date DESC);
CREATE INDEX idx_snapshots_symbol ON signal_snapshots(symbol, snapshot_date DESC);
CREATE INDEX idx_snapshots_date ON signal_snapshots(snapshot_date DESC);

CREATE TABLE signal_performance (
  id BIGSERIAL PRIMARY KEY,
  signal_type TEXT NOT NULL,
  period TEXT NOT NULL,
  computed_date DATE NOT NULL,

  total_signals INTEGER,
  avg_return NUMERIC(8,4),
  median_return NUMERIC(8,4),
  win_rate NUMERIC(5,2),
  avg_alpha NUMERIC(8,4),
  median_alpha NUMERIC(8,4),
  avg_max_drawdown NUMERIC(8,4),
  best_return NUMERIC(8,4),
  worst_return NUMERIC(8,4),
  sharpe_estimate NUMERIC(6,3),

  sample_start DATE,
  sample_end DATE,
  symbols_involved TEXT[],

  UNIQUE(signal_type, period, computed_date)
);

CREATE TABLE score_bucket_performance (
  id BIGSERIAL PRIMARY KEY,
  bucket TEXT NOT NULL,
  period TEXT NOT NULL,
  computed_date DATE NOT NULL,

  num_stocks INTEGER,
  avg_return NUMERIC(8,4),
  avg_alpha NUMERIC(8,4),
  win_rate NUMERIC(5,2),

  UNIQUE(bucket, period, computed_date)
);

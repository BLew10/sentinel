-- ============================================
-- SECTOR SIGNALS
-- ============================================

CREATE TABLE sector_signals (
  sector TEXT PRIMARY KEY,
  avg_sentinel_score NUMERIC(5,1),
  avg_technical_score NUMERIC(5,1),
  avg_earnings_ai_score NUMERIC(5,1),
  sector_rs_rank INTEGER,
  pct_above_sma50 NUMERIC(5,1),
  pct_above_sma200 NUMERIC(5,1),
  net_insider_flow_30d NUMERIC(14,2),
  net_institutional_flow BIGINT,
  net_options_flow_5d NUMERIC(14,2),
  stocks_above_75_score INTEGER,
  total_stocks INTEGER,
  rotation_signal TEXT,
  sector_narrative TEXT,
  key_drivers TEXT[],
  top_opportunity TEXT,
  biggest_risk TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

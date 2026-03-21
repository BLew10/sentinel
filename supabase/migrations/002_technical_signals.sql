-- ============================================
-- TECHNICAL INDICATORS (computed daily)
-- ============================================

CREATE TABLE technical_signals (
  symbol TEXT PRIMARY KEY REFERENCES stocks(symbol),
  sma_20 NUMERIC(12,4),
  sma_50 NUMERIC(12,4),
  sma_150 NUMERIC(12,4),
  sma_200 NUMERIC(12,4),
  ema_10 NUMERIC(12,4),
  ema_21 NUMERIC(12,4),
  price_vs_sma50 NUMERIC(8,4),
  price_vs_sma200 NUMERIC(8,4),
  pct_from_52w_high NUMERIC(8,4),
  pct_from_52w_low NUMERIC(8,4),
  rsi_14 NUMERIC(6,2),
  macd NUMERIC(12,4),
  macd_signal NUMERIC(12,4),
  macd_histogram NUMERIC(12,4),
  volume_ratio_50d NUMERIC(8,2),
  rs_rank_3m INTEGER,
  rs_rank_6m INTEGER,
  rs_rank_12m INTEGER,
  atr_14 NUMERIC(12,4),
  atr_pct NUMERIC(8,4),
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

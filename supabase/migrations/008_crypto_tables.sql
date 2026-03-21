-- ============================================
-- CRYPTO TABLES (scaffolding for future sprints)
-- ============================================

CREATE TABLE crypto_assets (
  symbol TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  coingecko_id TEXT,
  category TEXT,
  market_cap_rank INTEGER,
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE crypto_daily_prices (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL REFERENCES crypto_assets(symbol),
  date DATE NOT NULL,
  open NUMERIC(18,8),
  high NUMERIC(18,8),
  low NUMERIC(18,8),
  close NUMERIC(18,8),
  volume NUMERIC(18,2),
  market_cap NUMERIC(18,2),
  UNIQUE(symbol, date)
);

CREATE INDEX idx_crypto_prices_symbol_date ON crypto_daily_prices(symbol, date DESC);

CREATE TABLE crypto_signals (
  symbol TEXT PRIMARY KEY REFERENCES crypto_assets(symbol),
  sma_20 NUMERIC(18,8),
  sma_50 NUMERIC(18,8),
  sma_200 NUMERIC(18,8),
  rsi_14 NUMERIC(6,2),
  macd NUMERIC(18,8),
  macd_signal NUMERIC(18,8),
  volume_ratio_20d NUMERIC(8,2),
  pct_from_ath NUMERIC(8,4),
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE crypto_scores (
  symbol TEXT PRIMARY KEY REFERENCES crypto_assets(symbol),
  technical_score INTEGER,
  momentum_score INTEGER,
  volume_score INTEGER,
  sentiment_score INTEGER,
  composite_score INTEGER,
  rank INTEGER,
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_crypto_score ON crypto_scores(composite_score DESC);

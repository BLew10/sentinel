-- ============================================
-- CORE TABLES: stocks, daily_prices, fundamentals
-- ============================================

CREATE TABLE stocks (
  symbol TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sector TEXT,
  industry TEXT,
  market_cap BIGINT,
  exchange TEXT,
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE daily_prices (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL REFERENCES stocks(symbol),
  date DATE NOT NULL,
  open NUMERIC(12,4),
  high NUMERIC(12,4),
  low NUMERIC(12,4),
  close NUMERIC(12,4),
  volume BIGINT,
  UNIQUE(symbol, date)
);

CREATE INDEX idx_prices_symbol_date ON daily_prices(symbol, date DESC);

CREATE TABLE fundamentals (
  symbol TEXT PRIMARY KEY REFERENCES stocks(symbol),
  pe_ratio NUMERIC(10,2),
  forward_pe NUMERIC(10,2),
  peg_ratio NUMERIC(10,2),
  ps_ratio NUMERIC(10,2),
  pb_ratio NUMERIC(10,2),
  revenue_growth_yoy NUMERIC(8,4),
  earnings_growth_yoy NUMERIC(8,4),
  revenue_growth_qoq NUMERIC(8,4),
  earnings_growth_qoq NUMERIC(8,4),
  gross_margin NUMERIC(8,4),
  operating_margin NUMERIC(8,4),
  net_margin NUMERIC(8,4),
  roe NUMERIC(8,4),
  roa NUMERIC(8,4),
  debt_to_equity NUMERIC(10,2),
  current_ratio NUMERIC(8,2),
  free_cash_flow BIGINT,
  dividend_yield NUMERIC(8,4),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AI SIGNAL TABLES
-- ============================================

CREATE TABLE insider_trades (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL REFERENCES stocks(symbol),
  insider_name TEXT NOT NULL,
  insider_title TEXT,
  is_board_director BOOLEAN,
  transaction_date DATE NOT NULL,
  transaction_type TEXT NOT NULL,
  shares INTEGER NOT NULL,
  price_per_share NUMERIC(12,4),
  transaction_value NUMERIC(14,2),
  shares_owned_after BIGINT,
  filing_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol, insider_name, transaction_date, transaction_type, shares)
);

CREATE INDEX idx_insider_symbol_date ON insider_trades(symbol, transaction_date DESC);

CREATE TABLE insider_signals (
  symbol TEXT PRIMARY KEY REFERENCES stocks(symbol),
  signal_type TEXT,
  num_buyers_30d INTEGER DEFAULT 0,
  num_sellers_30d INTEGER DEFAULT 0,
  net_buy_value_30d NUMERIC(14,2),
  largest_transaction_value NUMERIC(14,2),
  largest_transaction_name TEXT,
  conviction_score INTEGER,
  ai_summary TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE institutional_holdings (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL REFERENCES stocks(symbol),
  institution_name TEXT NOT NULL,
  shares_held BIGINT,
  value BIGINT,
  pct_of_portfolio NUMERIC(8,4),
  change_shares BIGINT,
  change_pct NUMERIC(8,4),
  filing_quarter TEXT,
  filing_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol, institution_name, filing_quarter)
);

CREATE TABLE institutional_signals (
  symbol TEXT PRIMARY KEY REFERENCES stocks(symbol),
  num_new_positions INTEGER DEFAULT 0,
  num_increased INTEGER DEFAULT 0,
  num_decreased INTEGER DEFAULT 0,
  num_closed INTEGER DEFAULT 0,
  net_institutional_flow BIGINT,
  notable_funds TEXT[],
  conviction_score INTEGER,
  ai_summary TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE earnings_analysis (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL REFERENCES stocks(symbol),
  fiscal_quarter TEXT NOT NULL,
  transcript_date DATE,
  conviction_score INTEGER,
  management_tone TEXT,
  guidance_direction TEXT,
  key_positives TEXT[],
  key_concerns TEXT[],
  hedging_language_count INTEGER,
  confidence_phrases_count INTEGER,
  forward_catalysts TEXT[],
  competitive_position TEXT,
  one_line_summary TEXT,
  full_analysis JSONB,
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol, fiscal_quarter)
);

CREATE TABLE sec_filing_analysis (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL REFERENCES stocks(symbol),
  filing_type TEXT,
  filing_date DATE,
  risks_added TEXT[],
  risks_removed TEXT[],
  material_changes TEXT[],
  overall_direction TEXT,
  risk_score INTEGER,
  ai_summary TEXT,
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol, filing_type, filing_date)
);

CREATE TABLE news_sentiment (
  symbol TEXT PRIMARY KEY REFERENCES stocks(symbol),
  sentiment_score NUMERIC(5,2),
  sentiment_label TEXT,
  sentiment_velocity NUMERIC(5,2),
  num_articles_7d INTEGER,
  top_headline TEXT,
  ai_summary TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE options_flow_signals (
  symbol TEXT PRIMARY KEY REFERENCES stocks(symbol),
  net_flow_1d NUMERIC(14,2),
  net_flow_5d NUMERIC(14,2),
  num_sweeps_1d INTEGER,
  num_blocks_1d INTEGER,
  largest_print_value NUMERIC(14,2),
  largest_print_type TEXT,
  largest_print_expiry DATE,
  flow_sentiment TEXT,
  conviction_score INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- COMPOSITE SENTINEL SCORE
-- ============================================

CREATE TABLE sentinel_scores (
  symbol TEXT PRIMARY KEY REFERENCES stocks(symbol),
  technical_score INTEGER,
  fundamental_score INTEGER,
  earnings_ai_score INTEGER,
  insider_score INTEGER,
  institutional_score INTEGER,
  news_sentiment_score INTEGER,
  options_flow_score INTEGER,
  sentinel_score INTEGER,
  score_change_1d INTEGER,
  score_change_7d INTEGER,
  rank INTEGER,
  percentile INTEGER,
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sentinel_score ON sentinel_scores(sentinel_score DESC);

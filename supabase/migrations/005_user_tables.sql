-- ============================================
-- USER TABLES
-- ============================================

CREATE TABLE watchlist (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  symbol TEXT NOT NULL REFERENCES stocks(symbol),
  added_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  target_price NUMERIC(12,4),
  UNIQUE(user_id, symbol)
);

CREATE TABLE alert_history (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL REFERENCES stocks(symbol),
  alert_type TEXT NOT NULL,
  message TEXT,
  sentinel_score INTEGER,
  discord_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

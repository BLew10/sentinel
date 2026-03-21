# SENTINEL — AI-Powered Equity & Crypto Screening Platform

## Vision

Sentinel is an intelligent market screening platform that combines fundamental data,
technical analysis, options flow, insider activity, and AI-driven analysis into a
single **Sentinel Score (0–100)** for every tracked security. It surfaces high-conviction
opportunities through a web dashboard and real-time Discord alerts.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, TypeScript strict) |
| Styling | Tailwind CSS v4, dark theme only |
| Database | Supabase (PostgreSQL + Auth + Realtime) |
| Market Data | Financial Datasets API |
| Options Flow | Unusual Whales API |
| Technical Indicators | Alpha Vantage API |
| AI Analysis | Anthropic Claude API (`claude-sonnet-4-20250514`) |
| Alerts | Discord.js bot (separate process) |
| Charts | Lightweight Charts (TradingView) for price, Recharts for scores |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Vercel (Next.js 15)                     │
│                                                             │
│  app/                                                       │
│  ├── page.tsx .............. Dashboard (top movers, alerts)  │
│  ├── screener/page.tsx ..... Filterable stock screener       │
│  ├── stock/[symbol]/page.tsx Stock detail + score breakdown  │
│  ├── watchlist/page.tsx .... User watchlists                 │
│  ├── signals/page.tsx ...... Signal performance tracker      │
│  ├── api/                                                   │
│  │   ├── scores/route.ts ... GET /api/scores                │
│  │   ├── stock/[symbol]/route.ts                            │
│  │   ├── analyze/route.ts .. POST trigger AI analysis       │
│  │   └── cron/                                              │
│  │       ├── fetch-prices/route.ts .. 6:00 AM ET            │
│  │       ├── fetch-financials/route.ts 6:15 AM ET           │
│  │       ├── fetch-insiders/route.ts   6:30 AM ET           │
│  │       ├── fetch-flow/route.ts ..    6:45 AM ET           │
│  │       ├── compute-scores/route.ts   7:00 AM ET           │
│  │       ├── ai-analysis/route.ts ..   7:15 AM ET           │
│  │       └── discord-alerts/route.ts   7:30 AM ET           │
│  │                                                          │
│  lib/                                                       │
│  ├── db.ts ................. Supabase client + query helpers │
│  ├── financial-datasets.ts . FD API wrapper                 │
│  ├── unusual-whales.ts ..... UW API wrapper                 │
│  ├── alpha-vantage.ts ...... AV API wrapper                 │
│  ├── claude.ts ............. Anthropic API wrapper           │
│  ├── scoring.ts ............ Composite score computation     │
│  ├── analyzers/                                             │
│  │   ├── fundamental.ts .... Valuation + financial health    │
│  │   ├── technical.ts ...... RSI, MACD, moving averages      │
│  │   ├── insider.ts ........ Insider transaction analysis    │
│  │   ├── flow.ts ........... Options flow analysis           │
│  │   └── sentiment.ts ...... AI sentiment scoring            │
│  ├── signals.ts ............ Signal snapshot + performance   │
│  └── utils/                                                 │
│      ├── types.ts .......... All TypeScript interfaces       │
│      ├── format.ts ......... Currency, %, number formatting  │
│      ├── constants.ts ...... Tickers, weights, thresholds    │
│      └── date.ts ........... Date helpers (date-fns)         │
│                                                             │
│  discord/                                                   │
│  └── bot.ts ................ Standalone Discord bot process  │
└─────────────────────────────────────────────────────────────┘
```

---

## Environment Variables

Create `.env.local` from this template:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Financial Datasets
FINANCIAL_DATASETS_API_KEY=your-key

# Unusual Whales
UNUSUAL_WHALES_API_KEY=your-key

# Alpha Vantage
ALPHA_VANTAGE_API_KEY=your-key

# Anthropic
ANTHROPIC_API_KEY=your-key

# Discord
DISCORD_BOT_TOKEN=your-bot-token
DISCORD_GUILD_ID=your-server-id
DISCORD_CHANNEL_DAILY_TOP_10=channel-id
DISCORD_CHANNEL_SCORE_ALERTS=channel-id
DISCORD_CHANNEL_INSIDER_ALERTS=channel-id
DISCORD_CHANNEL_FLOW_ALERTS=channel-id

# App
CRON_SECRET=your-random-secret
```

---

## Database Schema (Supabase)

### `stocks`

Core security reference table.

```sql
CREATE TABLE stocks (
  symbol         TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  sector         TEXT,
  industry       TEXT,
  market_cap     BIGINT,
  exchange       TEXT,
  is_active      BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);
```

### `price_history`

Daily OHLCV data.

```sql
CREATE TABLE price_history (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol         TEXT NOT NULL REFERENCES stocks(symbol),
  date           DATE NOT NULL,
  open           NUMERIC(12,4) NOT NULL,
  high           NUMERIC(12,4) NOT NULL,
  low            NUMERIC(12,4) NOT NULL,
  close          NUMERIC(12,4) NOT NULL,
  volume         BIGINT NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE(symbol, date)
);

CREATE INDEX idx_price_history_symbol_date ON price_history(symbol, date DESC);
```

### `financial_metrics`

Quarterly/annual fundamental data.

```sql
CREATE TABLE financial_metrics (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol                TEXT NOT NULL REFERENCES stocks(symbol),
  period                TEXT NOT NULL,           -- 'Q1 2025', 'FY 2024'
  period_type           TEXT NOT NULL,           -- 'quarterly' | 'annual'
  revenue               NUMERIC(16,2),
  net_income            NUMERIC(16,2),
  eps                   NUMERIC(10,4),
  pe_ratio              NUMERIC(10,2),
  ps_ratio              NUMERIC(10,2),
  pb_ratio              NUMERIC(10,2),
  ev_to_ebitda          NUMERIC(10,2),
  debt_to_equity        NUMERIC(10,4),
  current_ratio         NUMERIC(10,4),
  free_cash_flow        NUMERIC(16,2),
  gross_margin          NUMERIC(8,4),
  operating_margin      NUMERIC(8,4),
  net_margin            NUMERIC(8,4),
  revenue_growth_yoy    NUMERIC(8,4),
  eps_growth_yoy        NUMERIC(8,4),
  created_at            TIMESTAMPTZ DEFAULT now(),
  UNIQUE(symbol, period)
);
```

### `technical_indicators`

Daily computed indicators.

```sql
CREATE TABLE technical_indicators (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol         TEXT NOT NULL REFERENCES stocks(symbol),
  date           DATE NOT NULL,
  rsi_14         NUMERIC(8,4),
  macd_line      NUMERIC(12,6),
  macd_signal    NUMERIC(12,6),
  macd_histogram NUMERIC(12,6),
  sma_20         NUMERIC(12,4),
  sma_50         NUMERIC(12,4),
  sma_200        NUMERIC(12,4),
  ema_12         NUMERIC(12,4),
  ema_26         NUMERIC(12,4),
  bb_upper       NUMERIC(12,4),
  bb_middle      NUMERIC(12,4),
  bb_lower       NUMERIC(12,4),
  atr_14         NUMERIC(12,4),
  adx_14         NUMERIC(8,4),
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE(symbol, date)
);

CREATE INDEX idx_technical_symbol_date ON technical_indicators(symbol, date DESC);
```

### `insider_trades`

SEC Form 4 insider transaction data.

```sql
CREATE TABLE insider_trades (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol            TEXT NOT NULL REFERENCES stocks(symbol),
  filing_date       DATE NOT NULL,
  trade_date        DATE NOT NULL,
  insider_name      TEXT NOT NULL,
  insider_title     TEXT,
  transaction_type  TEXT NOT NULL,        -- 'buy' | 'sell' | 'option_exercise'
  shares            BIGINT NOT NULL,
  price_per_share   NUMERIC(12,4),
  total_value       NUMERIC(16,2),
  shares_owned_after BIGINT,
  is_10b5_1         BOOLEAN DEFAULT false, -- planned vs discretionary
  source_url        TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(symbol, filing_date, insider_name, transaction_type, shares)
);

CREATE INDEX idx_insider_symbol_date ON insider_trades(symbol, filing_date DESC);
```

### `options_flow`

Unusual options activity.

```sql
CREATE TABLE options_flow (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol           TEXT NOT NULL REFERENCES stocks(symbol),
  date             DATE NOT NULL,
  expiration       DATE NOT NULL,
  strike           NUMERIC(12,2) NOT NULL,
  option_type      TEXT NOT NULL,          -- 'call' | 'put'
  volume           INTEGER NOT NULL,
  open_interest    INTEGER,
  premium          NUMERIC(16,2),
  implied_volatility NUMERIC(8,4),
  delta            NUMERIC(8,4),
  side             TEXT,                   -- 'ask' | 'bid' | 'mid'
  size_category    TEXT,                   -- 'sweep' | 'block' | 'split'
  is_unusual       BOOLEAN DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_flow_symbol_date ON options_flow(symbol, date DESC);
```

### `ai_analyses`

Claude-generated analysis stored for each scoring run.

```sql
CREATE TABLE ai_analyses (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol           TEXT NOT NULL REFERENCES stocks(symbol),
  analysis_date    DATE NOT NULL,
  analysis_type    TEXT NOT NULL,          -- 'fundamental' | 'technical' | 'insider' | 'flow' | 'composite'
  prompt           TEXT NOT NULL,
  raw_response     JSONB NOT NULL,         -- full Claude response for debugging
  parsed_result    JSONB NOT NULL,         -- structured extracted data
  model            TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  tokens_used      INTEGER,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(symbol, analysis_date, analysis_type)
);
```

### `sentinel_scores`

Composite and component scores per stock per day.

```sql
CREATE TABLE sentinel_scores (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol           TEXT NOT NULL REFERENCES stocks(symbol),
  date             DATE NOT NULL,
  composite_score  INTEGER NOT NULL,       -- 0-100 final Sentinel Score
  fundamental_score INTEGER NOT NULL,      -- 0-100
  technical_score  INTEGER NOT NULL,       -- 0-100
  insider_score    INTEGER NOT NULL,       -- 0-100
  flow_score       INTEGER NOT NULL,       -- 0-100
  sentiment_score  INTEGER NOT NULL,       -- 0-100
  flags            JSONB DEFAULT '[]',     -- array of triggered flag strings
  score_metadata   JSONB DEFAULT '{}',     -- breakdown details
  previous_score   INTEGER,               -- yesterday's composite for delta
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(symbol, date)
);

CREATE INDEX idx_scores_symbol_date ON sentinel_scores(symbol, date DESC);
CREATE INDEX idx_scores_composite ON sentinel_scores(composite_score DESC);
```

### `signal_snapshots`

Performance tracking — snapshot of conditions when a signal fires.

```sql
CREATE TABLE signal_snapshots (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol           TEXT NOT NULL REFERENCES stocks(symbol),
  trigger_date     DATE NOT NULL,
  trigger_type     TEXT NOT NULL,           -- 'score_alert' | 'insider_cluster' | 'flow_sweep' | 'backtest'
  trigger_detail   JSONB NOT NULL,          -- flags, scores, conditions at trigger
  price_at_trigger NUMERIC(12,4) NOT NULL,
  spy_price_at_trigger NUMERIC(12,4),
  return_7d        NUMERIC(8,4),           -- filled by cron
  return_14d       NUMERIC(8,4),
  return_30d       NUMERIC(8,4),
  return_60d       NUMERIC(8,4),
  return_90d       NUMERIC(8,4),
  spy_return_7d    NUMERIC(8,4),
  spy_return_14d   NUMERIC(8,4),
  spy_return_30d   NUMERIC(8,4),
  spy_return_60d   NUMERIC(8,4),
  spy_return_90d   NUMERIC(8,4),
  alpha_7d         NUMERIC(8,4),           -- stock return - SPY return
  alpha_14d        NUMERIC(8,4),
  alpha_30d        NUMERIC(8,4),
  alpha_60d        NUMERIC(8,4),
  alpha_90d        NUMERIC(8,4),
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_snapshots_type ON signal_snapshots(trigger_type, trigger_date DESC);
CREATE INDEX idx_snapshots_symbol ON signal_snapshots(symbol, trigger_date DESC);
```

### `watchlists`

User-created watchlists.

```sql
CREATE TABLE watchlists (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID NOT NULL,
  name             TEXT NOT NULL,
  symbols          TEXT[] NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);
```

### `alert_history`

Log of all Discord alerts sent.

```sql
CREATE TABLE alert_history (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol           TEXT NOT NULL REFERENCES stocks(symbol),
  alert_type       TEXT NOT NULL,           -- 'daily_top_10' | 'score_spike' | 'insider_cluster' | 'flow_unusual'
  channel          TEXT NOT NULL,
  message_content  TEXT NOT NULL,
  discord_message_id TEXT,
  sent_at          TIMESTAMPTZ DEFAULT now()
);
```

### `cache`

Generic API response cache to reduce redundant calls.

```sql
CREATE TABLE cache (
  cache_key        TEXT PRIMARY KEY,
  data             JSONB NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cache_expires ON cache(expires_at);
```

### `universe`

Tracked ticker universe (S&P 500 + watchlist additions).

```sql
CREATE TABLE universe (
  symbol           TEXT PRIMARY KEY REFERENCES stocks(symbol),
  source           TEXT NOT NULL DEFAULT 'sp500',  -- 'sp500' | 'manual' | 'watchlist'
  added_at         TIMESTAMPTZ DEFAULT now(),
  is_active        BOOLEAN DEFAULT true
);
```

### `scoring_weights`

Configurable score weights (admin-adjustable without code changes).

```sql
CREATE TABLE scoring_weights (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name             TEXT NOT NULL UNIQUE,
  fundamental_weight NUMERIC(5,2) NOT NULL DEFAULT 25,
  technical_weight   NUMERIC(5,2) NOT NULL DEFAULT 20,
  insider_weight     NUMERIC(5,2) NOT NULL DEFAULT 20,
  flow_weight        NUMERIC(5,2) NOT NULL DEFAULT 15,
  sentiment_weight   NUMERIC(5,2) NOT NULL DEFAULT 20,
  is_active          BOOLEAN DEFAULT true,
  created_at         TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT weights_sum CHECK (
    fundamental_weight + technical_weight + insider_weight + flow_weight + sentiment_weight = 100
  )
);

INSERT INTO scoring_weights (name) VALUES ('default');
```

---

## Sentinel Score Formula

### Composite Score

```
Sentinel Score = (fundamental × 0.25)
              + (technical   × 0.20)
              + (insider     × 0.20)
              + (flow        × 0.15)
              + (sentiment   × 0.20)
```

Weights are stored in `scoring_weights` and can be adjusted. Default above.

### Fundamental Score (0–100)

Inputs: PE ratio, PS ratio, EPS growth, revenue growth, margins, debt/equity, FCF yield.

| Factor | Bullish (→ high score) | Bearish (→ low score) |
|--------|----------------------|----------------------|
| PE Ratio | < 15 (value) | > 40 (expensive) |
| Revenue Growth YoY | > 20% | < 0% (declining) |
| EPS Growth YoY | > 25% | < 0% |
| Gross Margin | > 60% | < 20% |
| Debt/Equity | < 0.5 (low leverage) | > 2.0 (high leverage) |
| FCF Yield | > 5% | < 0% (burning cash) |
| Current Ratio | > 1.5 | < 1.0 |

Scoring approach: each factor maps to a 0–100 sub-score via linear interpolation
between bearish and bullish thresholds. The fundamental score is the weighted average
of all sub-scores. Missing data defaults to 50 (neutral).

### Fundamental Flags

- `DEEP_VALUE` — PE < 10 AND positive FCF
- `GROWTH_MACHINE` — Revenue growth > 30% AND EPS growth > 30%
- `CASH_RICH` — Current ratio > 3 AND debt/equity < 0.3
- `MARGIN_EXPANSION` — Operating margin increased QoQ for 3+ quarters
- `DEBT_BOMB` — Debt/equity > 3 AND current ratio < 1
- `REVENUE_DECLINE` — Revenue growth YoY < -10%
- `CASH_BURN` — Negative FCF for 2+ consecutive quarters

### Technical Score (0–100)

Inputs: RSI, MACD, SMA crossovers, Bollinger Band position, ADX trend strength.

| Factor | Bullish | Bearish |
|--------|---------|---------|
| RSI (14) | 30–50 (oversold recovery) | > 80 (overbought) |
| MACD | Histogram positive & rising | Histogram negative & falling |
| Price vs SMA 50 | Above | Below |
| Price vs SMA 200 | Above | Below |
| SMA 50 vs SMA 200 | Golden cross | Death cross |
| Bollinger Band | Near lower band (reversal) | Near upper band (exhaustion) |
| ADX | > 25 (strong trend) | < 15 (no trend) |

### Technical Flags

- `GOLDEN_CROSS` — SMA 50 crossed above SMA 200 in last 5 days
- `DEATH_CROSS` — SMA 50 crossed below SMA 200 in last 5 days
- `RSI_OVERSOLD` — RSI < 30
- `RSI_OVERBOUGHT` — RSI > 70
- `MACD_BULLISH_CROSS` — MACD line crossed above signal line in last 3 days
- `MACD_BEARISH_CROSS` — MACD line crossed below signal line in last 3 days
- `BB_SQUEEZE` — Bollinger Band width < 2% of price (volatility contraction)
- `BREAKOUT` — Price closed above 52-week high

### Insider Score (0–100)

Inputs: recent insider buys/sells, cluster buying, transaction sizes, insider roles.

| Factor | Bullish | Bearish |
|--------|---------|---------|
| Net insider buying | Multiple buys, no sells | Heavy selling |
| Cluster buying | 3+ insiders buying in 14 days | — |
| Transaction size | > $500K purchase | — |
| Buyer role | CEO/CFO/Director buying | — |
| Planned vs discretionary | Discretionary buy (not 10b5-1) | — |
| Sell pattern | — | All insiders selling |

Baseline score is 50 (no activity). Buys push up, sells push down.

### Insider Flags

- `INSIDER_CLUSTER_BUY` — 3+ unique insiders bought within 14 days
- `CEO_BUY` — CEO/President made a discretionary purchase
- `LARGE_INSIDER_BUY` — Single purchase > $500K
- `INSIDER_SELLING_SPREE` — 3+ insiders sold within 14 days (non-10b5-1)
- `INSIDER_QUIET` — No insider activity for 180+ days (neutral, remove from scoring)

### Flow Score (0–100)

Inputs: unusual options volume, call/put ratio, sweep activity, premium concentration.

| Factor | Bullish | Bearish |
|--------|---------|---------|
| Call/Put ratio | > 2.0 (heavy calls) | < 0.5 (heavy puts) |
| Unusual volume | Options vol > 3× avg | — |
| Sweep orders | Call sweeps at ask | Put sweeps at ask |
| Premium | > $1M call premium same strike | > $1M put premium same strike |
| Expiration | Near-term (< 30 days) = conviction | — |

Baseline score is 50 (normal activity).

### Flow Flags

- `CALL_SWEEP_SURGE` — 5+ call sweeps in a single session
- `PUT_WALL` — Concentrated put open interest at a single strike
- `WHALE_CALLS` — Single call order > $1M premium
- `WHALE_PUTS` — Single put order > $1M premium
- `IV_CRUSH_RISK` — IV rank > 90% (post-earnings mean reversion likely)
- `GAMMA_SQUEEZE_SETUP` — High call OI near current price with low float

### Sentiment Score (0–100)

Claude AI analyzes a composite summary of all other signals and produces:

1. A **sentiment_score** (0–100) reflecting overall conviction
2. A **narrative** (2–3 sentence summary)
3. **key_factors** (array of the 3 most important considerations)
4. **risk_factors** (array of top risks)
5. A **catalyst_timeline** (upcoming events that could move the stock)

**Claude Prompt Template:**

```
You are a senior equity analyst. Analyze the following data for {symbol} and
provide a structured assessment.

DATA:
- Fundamental metrics: {fundamental_data}
- Technical indicators: {technical_data}
- Insider activity (last 90 days): {insider_data}
- Options flow (last 5 days): {flow_data}
- Current price: {price} | 52-week range: {range}

Respond ONLY with valid JSON (no markdown, no preamble):
{
  "sentiment_score": <0-100 integer>,
  "bias": "<bullish|bearish|neutral>",
  "narrative": "<2-3 sentence summary>",
  "key_factors": ["<factor1>", "<factor2>", "<factor3>"],
  "risk_factors": ["<risk1>", "<risk2>"],
  "catalyst_timeline": [
    {"event": "<description>", "expected_date": "<YYYY-MM-DD or 'unknown'>", "impact": "<positive|negative|uncertain>"}
  ],
  "confidence": <0-100 integer representing confidence in this analysis>
}
```

### Sentiment Flags

- `AI_STRONG_BUY` — Sentiment score ≥ 85 AND confidence ≥ 80
- `AI_STRONG_SELL` — Sentiment score ≤ 15 AND confidence ≥ 80
- `AI_CATALYST_IMMINENT` — Catalyst within 14 days with positive impact
- `AI_CONFLICTING_SIGNALS` — Confidence < 40 (data is contradictory)

---

## Cron Job Schedule

All times in US Eastern. Triggered via Vercel Cron.

| Time | Route | Action |
|------|-------|--------|
| 6:00 AM | `/api/cron/fetch-prices` | Fetch previous day's OHLCV for all universe symbols |
| 6:15 AM | `/api/cron/fetch-financials` | Fetch latest quarterly data for any symbols missing recent filings |
| 6:30 AM | `/api/cron/fetch-insiders` | Fetch insider trades from last 7 days |
| 6:45 AM | `/api/cron/fetch-flow` | Fetch unusual options flow from previous session |
| 7:00 AM | `/api/cron/compute-scores` | Run all analyzers, compute Sentinel Scores, store in DB |
| 7:15 AM | `/api/cron/ai-analysis` | Run Claude analysis on top 20 movers (biggest score changes) |
| 7:30 AM | `/api/cron/discord-alerts` | Post daily top 10, score spikes, insider clusters, flow alerts |

Additional cron jobs:

| Time | Route | Action |
|------|-------|--------|
| 8:00 PM | `/api/cron/fill-returns` | Fill forward returns on signal_snapshots where data is now available |
| Sunday 2:00 AM | `/api/cron/refresh-universe` | Update S&P 500 constituent list |
| Sunday 3:00 AM | `/api/cron/compute-signal-performance` | Aggregate signal performance stats |

### Vercel Cron Config (`vercel.json`)

```json
{
  "crons": [
    { "path": "/api/cron/fetch-prices", "schedule": "0 10 * * 1-5" },
    { "path": "/api/cron/fetch-financials", "schedule": "15 10 * * 1-5" },
    { "path": "/api/cron/fetch-insiders", "schedule": "30 10 * * 1-5" },
    { "path": "/api/cron/fetch-flow", "schedule": "45 10 * * 1-5" },
    { "path": "/api/cron/compute-scores", "schedule": "0 11 * * 1-5" },
    { "path": "/api/cron/ai-analysis", "schedule": "15 11 * * 1-5" },
    { "path": "/api/cron/discord-alerts", "schedule": "30 11 * * 1-5" },
    { "path": "/api/cron/fill-returns", "schedule": "0 0 * * 1-5" },
    { "path": "/api/cron/refresh-universe", "schedule": "0 6 * * 0" },
    { "path": "/api/cron/compute-signal-performance", "schedule": "0 7 * * 0" }
  ]
}
```

*(Cron schedule is UTC — 10:00 UTC = 6:00 AM ET during EDT)*

---

## Design Tokens

Dark theme only. All values below are Tailwind-compatible.

### Colors

```css
:root {
  /* Backgrounds */
  --bg-primary: #0a0a0f;        /* Main background */
  --bg-secondary: #12121a;      /* Card/panel background */
  --bg-tertiary: #1a1a2e;       /* Elevated surfaces */
  --bg-hover: #22223a;          /* Hover states */

  /* Borders */
  --border-primary: #2a2a3e;
  --border-secondary: #3a3a52;

  /* Text */
  --text-primary: #e4e4ed;      /* Primary text */
  --text-secondary: #9494a8;    /* Secondary/muted */
  --text-tertiary: #6a6a7e;     /* Disabled/placeholder */

  /* Semantic */
  --green-bullish: #22c55e;     /* Bullish, positive, buy */
  --green-subtle: #15803d;      /* Green background tint */
  --red-bearish: #ef4444;       /* Bearish, negative, sell */
  --red-subtle: #991b1b;        /* Red background tint */
  --amber-caution: #f59e0b;     /* Caution, mixed signals */
  --amber-subtle: #92400e;
  --purple-ai: #a855f7;         /* AI-related elements */
  --purple-subtle: #6b21a8;
  --blue-info: #3b82f6;         /* Informational, links */
  --blue-subtle: #1e40af;

  /* Score gradient */
  --score-0:   #ef4444;         /* 0-20: Strong bearish */
  --score-20:  #f97316;         /* 20-40: Bearish */
  --score-40:  #f59e0b;         /* 40-50: Neutral-bearish */
  --score-50:  #eab308;         /* 50: Neutral */
  --score-60:  #84cc16;         /* 50-60: Neutral-bullish */
  --score-80:  #22c55e;         /* 60-80: Bullish */
  --score-100: #10b981;         /* 80-100: Strong bullish */

  /* Chart */
  --chart-line: #3b82f6;
  --chart-volume: #3b82f680;
  --chart-grid: #1a1a2e;
}
```

### Typography

```css
:root {
  --font-data: 'JetBrains Mono', monospace;    /* Tickers, prices, numbers */
  --font-body: 'Inter', sans-serif;            /* Labels, descriptions */

  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 1.875rem;
}
```

### Spacing & Layout

```css
:root {
  --sidebar-width: 240px;
  --header-height: 56px;
  --card-radius: 8px;
  --card-padding: 16px;
  --page-padding: 24px;
  --gap-sm: 8px;
  --gap-md: 16px;
  --gap-lg: 24px;
  --gap-xl: 32px;
}
```

---

## Historical Backtesting

### Purpose

Validate that signals and flags have predictive value by testing against
historical data. Without backtesting, we're flying blind on whether the
scoring system actually works.

### Methodology

1. **Replay historical data**: For each date in the test range, compute what
   flags/signals would have fired using only data available at that time
   (no look-ahead bias).

2. **Record trigger snapshots**: Store each trigger as a `signal_snapshot`
   with `trigger_type = 'backtest'`.

3. **Fill forward returns**: For each snapshot, compute the actual return
   at 7d, 14d, 30d, 60d, 90d from the trigger date.

4. **Compute alpha**: `alpha = stock_return - spy_return` for the same
   period. Raw returns are misleading in trending markets.

5. **Aggregate performance**: `computeSignalPerformance()` groups snapshots
   by `trigger_type` and computes:
   - Win rate (% of signals with positive alpha)
   - Average return
   - Average alpha
   - Sharpe-like ratio (avg alpha / std dev alpha)
   - Sample size (N)

### Minimum Confidence

- N ≥ 30 before trusting a signal type's statistics
- Win rate is meaningless without alpha (a 60% win rate in a bull market
  that lags SPY is a bad signal)
- Display confidence intervals where possible

### Backtest Script Structure

Scripts live in `scripts/` and are run manually or via `npm run backtest:*`.

```typescript
// scripts/backtest-insider.ts
import { fetchHistoricalInsiderTrades } from '../lib/financial-datasets';
import { computeInsiderScore, detectInsiderFlags } from '../lib/analyzers/insider';
import { snapshotSignal } from '../lib/signals';

async function backtestInsider(startDate: string, endDate: string) {
  // 1. Fetch historical insider data for all universe symbols
  // 2. For each date, compute scores and flags
  // 3. When a flag fires, create a signal_snapshot
  // 4. After all dates processed, fill forward returns
  // 5. Call computeSignalPerformance('backtest')
}
```

---

## Discord Alert Formats

### Daily Top 10

Posted to `#daily-top-10` at 7:30 AM ET.

```
📊 Sentinel Daily Top 10 — March 20, 2026

 #  Symbol  Score  Δ    Top Flag
 1  NVDA     92   +8   INSIDER_CLUSTER_BUY
 2  AAPL     88   +3   GOLDEN_CROSS
 3  MSFT     85   +5   AI_STRONG_BUY
 ...

Full dashboard: https://sentinel.app/screener?sort=score&dir=desc
```

### Score Spike Alert

Posted to `#score-alerts` when a stock's score changes by ≥ 15 points in a day.

```
🚨 Score Spike: NVDA 84 → 92 (+8)

Triggered flags:
• INSIDER_CLUSTER_BUY — 4 insiders bought $2.3M in 10 days
• MACD_BULLISH_CROSS — MACD crossed signal line today
• AI_STRONG_BUY — Claude confidence: 88%

AI Summary: "NVDA shows strong insider conviction ahead of earnings..."

View: https://sentinel.app/stock/NVDA
```

### Insider Cluster Alert

Posted to `#insider-alerts`.

```
🔍 Insider Cluster: ABNB

4 insiders purchased within 12 days:
• Brian Chesky (CEO) — 50,000 shares @ $142.30 ($7.1M)
• Dave Stephenson (CFO) — 10,000 shares @ $143.50 ($1.4M)
• ...

Total insider buying: $9.8M
Discretionary (non-10b5-1): 100%
Sentinel Score: 78 → 86 (+8)
```

### Flow Alert

Posted to `#flow-alerts`.

```
🌊 Unusual Flow: TSLA

Call sweep surge detected:
• 8 call sweeps at ask in 2 hours
• Total premium: $4.2M
• Concentrated at $280 strike, Apr 18 expiry
• IV rank: 62%

Put/Call ratio: 0.3 (heavily bullish)
Sentinel Score: 71
```

---

## Sprint Plan

### Sprint 1: Data Pipeline Foundation (Week 1–2)

**Goal**: Fetch and store market data reliably. No UI, no scoring — just the pipes.

**Tasks**:

1. **Project setup**
   - `create-next-app`, install deps, configure TypeScript strict
   - Set up Supabase project, run all CREATE TABLE statements
   - Create `.env.local` from template
   - Verify Supabase connection from Next.js

2. **`lib/db.ts`** — Supabase client wrapper
   - Initialize Supabase client (server-side with service role key)
   - Helper: `upsertBatch(table, rows, conflictColumns)`
   - Helper: `getCached(key, fetcher, ttlHours)`
   - Helper: `queryWithRetry(fn, retries=3)`

3. **`lib/financial-datasets.ts`** — Financial Datasets API wrapper
   - `fetchPriceHistory(symbol, startDate, endDate)`
   - `fetchFinancialMetrics(symbol)`
   - `fetchInsiderTrades(symbol, startDate)`
   - `fetchStockList()` (for universe management)
   - Rate limiting: queue with configurable delay
   - Response caching via `getCached()`
   - Error handling: retry on 429/500, throw on 4xx

4. **`lib/unusual-whales.ts`** — Unusual Whales API wrapper
   - `fetchOptionsFlow(symbol, date)`
   - `fetchOptionsSummary(symbol)`
   - Error handling and caching

5. **`lib/alpha-vantage.ts`** — Alpha Vantage API wrapper
   - `fetchRSI(symbol)`
   - `fetchMACD(symbol)`
   - `fetchSMA(symbol, period)`
   - `fetchBollingerBands(symbol)`
   - Aggressive caching (25 calls/day free tier limit)

6. **Cron: `fetch-prices`**
   - Route: `app/api/cron/fetch-prices/route.ts`
   - Auth: verify `CRON_SECRET` header
   - Fetch OHLCV for all active universe symbols
   - Upsert into `price_history`
   - Log count of inserted/updated rows

7. **Cron: `fetch-financials`**
   - Fetch quarterly metrics for symbols with stale data (> 90 days old)
   - Upsert into `financial_metrics`

8. **Cron: `fetch-insiders`**
   - Fetch insider trades from last 7 days for all universe symbols
   - Upsert into `insider_trades` (dedupe on unique constraint)

9. **Cron: `fetch-flow`**
   - Fetch unusual options flow from previous trading day
   - Insert into `options_flow`

10. **Cron: `refresh-universe`**
    - Fetch S&P 500 list from Financial Datasets
    - Upsert into `stocks` and `universe` tables
    - Mark delisted symbols as `is_active = false`

11. **Tests**: Write tests for all API wrappers with mocked responses

### Sprint 2: Scoring Engine (Week 3–4)

**Goal**: Build all analyzer modules and the composite scoring function.

**Tasks**:

1. **`lib/utils/types.ts`** — Define all interfaces
   - `Stock`, `PriceBar`, `FinancialMetrics`, `InsiderTrade`, `OptionsFlow`
   - `TechnicalIndicators`, `AIAnalysis`, `SentinelScore`
   - All flag enums: `FundamentalFlag`, `TechnicalFlag`, `InsiderFlag`, `FlowFlag`, `SentimentFlag`
   - `SignalSnapshot`, `SignalPerformance`
   - `ScoreBreakdown`, `ScoreMetadata`

2. **`lib/analyzers/fundamental.ts`**
   - `computeFundamentalScore(metrics: FinancialMetrics): number`
   - `detectFundamentalFlags(metrics: FinancialMetrics): FundamentalFlag[]`
   - Linear interpolation scoring for each sub-factor
   - Handle missing data → default 50

3. **`lib/analyzers/technical.ts`**
   - `computeTechnicalScore(indicators: TechnicalIndicators, prices: PriceBar[]): number`
   - `detectTechnicalFlags(indicators: TechnicalIndicators, prices: PriceBar[]): TechnicalFlag[]`
   - Golden/death cross detection (compare last 5 days of SMA 50 vs 200)

4. **`lib/analyzers/insider.ts`**
   - `computeInsiderScore(trades: InsiderTrade[]): number`
   - `detectInsiderFlags(trades: InsiderTrade[]): InsiderFlag[]`
   - Cluster detection: group trades within 14-day window
   - Role-weighted scoring (CEO buy > random VP buy)

5. **`lib/analyzers/flow.ts`**
   - `computeFlowScore(flow: OptionsFlow[]): number`
   - `detectFlowFlags(flow: OptionsFlow[]): FlowFlag[]`
   - Call/put ratio, sweep detection, premium concentration

6. **`lib/analyzers/sentiment.ts`**
   - `computeSentimentScore(symbol, allData): Promise<number>`
   - Calls Claude API with the prompt template
   - Parses JSON response with validation
   - Falls back to 50 on parse failure
   - Stores raw + parsed in `ai_analyses`

7. **`lib/scoring.ts`** — Composite score
   - `computeSentinelScore(symbol): Promise<SentinelScore>`
   - Gathers latest data for each analyzer
   - Runs all 5 analyzers
   - Combines with weights from `scoring_weights`
   - Stores in `sentinel_scores`
   - Returns full breakdown

8. **`lib/signals.ts`** — Signal tracking
   - `snapshotSignal(symbol, triggerType, triggerDetail, price, spyPrice)`
   - `fillForwardReturns()` — cron helper
   - `computeSignalPerformance(triggerType?): SignalPerformance[]`

9. **Cron: `compute-scores`**
   - For each active universe symbol, call `computeSentinelScore()`
   - Batch process with concurrency limit (avoid rate limits)
   - Log score distribution summary

10. **Cron: `ai-analysis`**
    - Identify top 20 movers (biggest daily score changes)
    - Run Claude analysis for each
    - Store in `ai_analyses`

11. **Cron: `fill-returns`**
    - Query `signal_snapshots` where return columns are NULL
    - For each, check if enough time has passed
    - Fetch forward price and SPY price, compute returns and alpha

12. **Tests**: Comprehensive tests for all scoring functions and flag detection
    - Edge cases: all zeros, max values, missing data, null fields
    - Verify score clamping (0–100)
    - Verify flag detection in isolation and combination

### Sprint 3: Web Dashboard (Week 5–6)

**Goal**: Build the full web UI — dashboard, screener, stock detail pages.

**Tasks**:

1. **Layout & navigation**
   - `app/layout.tsx` — Dark theme, sidebar nav, header
   - Sidebar: Dashboard, Screener, Watchlist, Signals
   - Responsive: sidebar collapses on mobile

2. **Dashboard (`app/page.tsx`)**
   - Top 10 by Sentinel Score (card grid)
   - Biggest movers (score changes today)
   - Recent alerts feed
   - Market overview (SPY, QQQ, VIX mini-charts)

3. **Screener (`app/screener/page.tsx`)**
   - Full-width sortable table of all scored stocks
   - Columns: Symbol, Name, Score, Δ, Fundamental, Technical, Insider, Flow, Sentiment, Flags
   - Filters: score range, sector, flags, market cap
   - Sort by any column (click header)
   - URL-driven state (`?sort=score&dir=desc&sector=Technology`)

4. **Stock Detail (`app/stock/[symbol]/page.tsx`)**
   - Header: symbol, name, price, change, Sentinel Score badge
   - Price chart (Lightweight Charts)
   - Score breakdown radar chart (Recharts)
   - Score history line chart (last 30 days)
   - Tabs: Fundamentals, Technicals, Insider Activity, Options Flow, AI Analysis
   - Each tab shows relevant data + flags

5. **Watchlist (`app/watchlist/page.tsx`)**
   - Create/edit/delete watchlists
   - Add/remove symbols
   - View watchlist as mini-screener table

6. **Signal Performance (`app/signals/page.tsx`)**
   - Table of signal types with performance metrics
   - Win rate, avg return, avg alpha, sample size
   - Filter by date range, trigger type
   - Highlight signals with N < 30 as "low confidence"

7. **Shared components**
   - `ScoreBadge` — color-coded score circle
   - `FlagChip` — colored pill for each flag type
   - `DataTable` — sortable, filterable table base
   - `MiniChart` — sparkline for inline price display
   - `LoadingState`, `ErrorState`, `EmptyState` — consistent states
   - `lib/utils/format.ts` — `formatCurrency()`, `formatPercent()`, `formatLargeNumber()`, `formatDate()`

8. **API routes**
   - `GET /api/scores` — paginated, filterable, sortable
   - `GET /api/stock/[symbol]` — full stock data with scores
   - `POST /api/analyze` — trigger on-demand AI analysis for a symbol

### Sprint 4: Discord Bot & Alerts (Week 7–8)

**Goal**: Standalone Discord bot with automated alerts and interactive commands.

**Tasks**:

1. **`discord/bot.ts`** — Bot setup
   - Connect with discord.js
   - Register slash commands
   - Run as separate process (`npm run discord`)

2. **Discord commands**
   - `/sentinel <symbol>` — Show current score breakdown
   - `/top10` — Show today's top 10
   - `/alerts <on|off>` — Enable/disable alert mentions
   - `/watchlist <add|remove> <symbol>` — Manage personal watchlist

3. **Cron: `discord-alerts`**
   - Post daily top 10 to `#daily-top-10`
   - Post score spike alerts (Δ ≥ 15) to `#score-alerts`
   - Post insider cluster alerts to `#insider-alerts`
   - Post unusual flow alerts to `#flow-alerts`
   - Each alert includes `snapshotSignal()` call for performance tracking

4. **Alert formatting** — Use Discord embeds with color coding
   - Green embed = bullish alert
   - Red embed = bearish alert
   - Purple embed = AI-driven alert
   - Include link to web dashboard

### Sprint 5: Backtesting & Performance (Week 9–10)

**Goal**: Validate signals with historical data and build the performance tracking loop.

**Tasks**:

1. **Backtest scripts**
   - `scripts/backtest-insider.ts`
   - `scripts/backtest-technical.ts`
   - `scripts/backtest-flow.ts`
   - Each follows the backtest methodology above

2. **Performance aggregation**
   - `computeSignalPerformance()` fully implemented
   - Store results for display in Signals page

3. **Scoring weight optimization**
   - After backtesting, analyze which signals have the best alpha
   - Adjust default weights in `scoring_weights` based on evidence
   - Document the rationale

4. **Dashboard enhancements**
   - Add signal performance summary to dashboard
   - Add "Signal of the Day" highlight
   - Add score accuracy tracker (predicted vs actual returns)

### Sprint 6: Polish & Launch (Week 11–12)

**Goal**: Production hardening, edge cases, documentation, deployment.

**Tasks**:

1. Error monitoring and logging
2. Rate limit handling and circuit breakers
3. Data freshness indicators in UI
4. Mobile responsiveness audit
5. Performance optimization (RSC, streaming, caching)
6. Deployment to Vercel
7. Custom domain setup
8. Discord bot hosting (Railway or similar)
9. Documentation: API endpoints, scoring methodology, deployment

---

## API Reference Quick Links

- **Financial Datasets**: https://docs.financialdatasets.ai
- **Unusual Whales**: https://api.unusualwhales.com/docs
- **Alpha Vantage**: https://www.alphavantage.co/documentation/
- **Anthropic Claude**: https://docs.anthropic.com/en/api/getting-started
- **Supabase JS Client**: https://supabase.com/docs/reference/javascript
- **Discord.js**: https://discord.js.org/docs
- **Lightweight Charts**: https://tradingview.github.io/lightweight-charts/
- **Recharts**: https://recharts.org/en-US/api

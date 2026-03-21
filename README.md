# Sentinel

AI-powered equity and crypto screening platform. Sentinel scores every stock in its universe daily across 7 dimensions — technicals, fundamentals, earnings AI, insider activity, institutional flow, news sentiment, and options flow — then ranks, alerts, and tracks performance over time.

## Features

- **Composite Scoring** — Weighted 0-100 Sentinel Score combining 7 sub-scores with configurable weights
- **Technical Analysis** — SMA/EMA, RSI, MACD, ATR, relative strength rankings vs SPY, 52-week range
- **Fundamental Analysis** — Valuation, growth, profitability, and balance sheet scoring with flag detection
- **AI Sentiment** — LLM-powered stock analysis with multi-provider fallback (Gemini, Anthropic, OpenRouter)
- **Insider & Institutional Tracking** — Cluster buy detection, CEO buy alerts, institutional flow scoring
- **Screener** — 10+ preset filters (Minervini trend template, earnings acceleration, insider buying clusters, etc.)
- **Signal Performance** — Forward return tracking, win rates, alpha vs SPY, and weight optimization
- **Discord Bot** — Slash commands (`/sentinel`, `/top10`, `/scan`) with rich embed alerts
- **Pipeline Observability** — Structured logging for every cron run with per-step timing and error tracking

## Tech Stack

- **Frontend** — Next.js (App Router), React, Tailwind CSS v4 (dark theme)
- **Database** — Supabase (PostgreSQL + Auth)
- **Data** — [Financial Datasets API](https://docs.financialdatasets.ai)
- **AI** — Gemini / Anthropic Claude / OpenRouter (multi-provider with automatic fallback)
- **Charts** — Lightweight Charts (TradingView), Recharts
- **Alerts** — Discord.js bot (separate process)
- **Testing** — Vitest

## Setup

```bash
# Clone and install
git clone <repo-url> sentinel
cd sentinel
npm install

# Environment
cp .env.example .env
# Edit .env with your API keys:
#   FINANCIAL_DATASETS_API_KEY (required)
#   SUPABASE_URL + SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY (required)
#   GEMINI_API_KEY or ANTHROPIC_API_KEY or OPENROUTER_API_KEY (at least one for AI)
#   DISCORD_BOT_TOKEN + DISCORD_GUILD_ID (optional, for Discord bot)

# Run Supabase migrations (apply in order)
# supabase/migrations/001_core_tables.sql through 010_pipeline_runs.sql

# Seed the stock universe
npm run seed:stocks

# Backfill historical data
npm run backfill:prices
npm run backfill:fundamentals
npm run backfill:insiders
npm run backfill:institutional

# Compute indicators and scores
npm run compute:technicals
npm run compute:scores
npm run compute:ai

# Start the dev server
npm run dev
```

## Scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm test` | Run all tests (vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run seed:stocks` | Seed equity universe |
| `npm run seed:crypto` | Seed crypto assets |
| `npm run backfill:prices` | Backfill historical OHLCV |
| `npm run backfill:fundamentals` | Backfill financial statements + metrics |
| `npm run backfill:insiders` | Backfill insider trades |
| `npm run backfill:institutional` | Backfill institutional holdings |
| `npm run compute:technicals` | Compute technical indicators |
| `npm run compute:scores` | Compute composite Sentinel Scores |
| `npm run compute:ai` | Run AI analysis on all stocks |
| `npm run cron` | Run full daily pipeline locally |
| `npm run cron:prices` | Fetch latest prices only |
| `npm run cron:scores` | Compute technicals + scores only |
| `npm run cron:alerts` | Detect and record alerts only |
| `npm run discord` | Start the Discord bot |
| `npm run backtest` | Run signal backtests |
| `npm run backfill:returns` | Backfill forward returns on snapshots |
| `npm run perf` | Compute signal performance aggregates |
| `npm run optimize:weights` | Run weight optimization analysis |
| `npm run check:freshness` | Check data freshness for sample tickers |

## Architecture

```text
Financial Datasets API
        |
        v
  lib/financial-datasets.ts  (rate-limited, retried, circuit-breaker protected)
        |
        v
  Supabase (daily_prices, fundamentals, insider_trades, ...)
        |
        v
  lib/indicators.ts  +  lib/analyzers/*.ts  (compute signals + sub-scores)
        |
        v
  lib/scoring.ts  (weighted composite -> sentinel_scores table)
        |
        v
  lib/alerts.ts  (threshold detection, dedup, recording)
        |
        v
  discord/bot.ts  (slash commands + embed alerts)
        |
  lib/signals.ts  (snapshot + forward return tracking)
        |
        v
  scripts/backtest.ts  +  scripts/compute-performance.ts  (signal validation)
```

## Detailed Documentation

See [SENTINEL_PROJECT_PLAN.md](SENTINEL_PROJECT_PLAN.md) for the full project specification, database schema, scoring formula, and sprint plan.

See [docs/SPRINT-TRACKER.md](docs/SPRINT-TRACKER.md) for implementation progress and sprint-by-sprint changelog.

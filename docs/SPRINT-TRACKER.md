# Sentinel — Sprint Tracker

Persistent tracking document. Updated at the end of each sprint with status, decisions, lessons, and context for the next sprint.

---

## Sprint 1: Foundation + Data Pipeline

**Status:** COMPLETE  
**Dates:** March 20, 2026

### What Was Built

| Component | Files | Status |
|-----------|-------|--------|
| Project scaffold | `package.json`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx` | Done |
| Design tokens & fonts | Inter + JetBrains Mono via `next/font`, CSS variables in globals.css | Done |
| TypeScript types | `lib/utils/types.ts` — all entity types, API response types, flag types, screener types | Done |
| Constants & presets | `lib/utils/constants.ts` — screener presets, sector mappings, notable funds, alert triggers | Done |
| Formatting utilities | `lib/utils/format.ts` — currency, percent, date, market cap, volume, score colors | Done |
| Database schema | `supabase/migrations/001-008_*.sql` — 8 migration files covering equities + crypto | Done |
| Supabase client | `lib/db.ts` — browser + server client initialization | Done |
| Financial Datasets API | `lib/financial-datasets.ts` — typed wrapper for prices, company facts, financials, insider trades, institutional, SEC, news | Done |
| Crypto API stub | `lib/crypto-api.ts` — CoinGecko wrapper for list, prices, metadata | Done |
| Stock seed script | `scripts/seed-universe.ts` — fetches tickers via API, falls back to S&P 500 list | Done |
| Crypto seed script | `scripts/seed-crypto.ts` — seeds top 100 crypto from CoinGecko | Done |
| Price backfill | `scripts/backfill-prices.ts` — 300 calendar days of OHLCV for all active stocks | Done |
| Fundamentals backfill | `scripts/backfill-fundamentals.ts` — financial metrics snapshot + quarterly income | Done |
| Technical indicators | `lib/indicators.ts` — SMA, EMA, RSI (Wilder's), MACD, ATR, volume ratio, 52w range, relative strength | Done |
| Compute technicals | `scripts/compute-technicals.ts` — reads prices from DB, computes all indicators, ranks RS across universe | Done |

### Architecture Decisions

1. **No `src/` directory** — spec requires flat root (`app/`, `lib/`, `components/`). `create-next-app` v16 created `src/` anyway; moved contents out.

2. **Financial Datasets API prices use `time` field** (ISO string), not `date`. The wrapper extracts the date portion (`time.split('T')[0]`) for DB storage.

3. **Institutional ownership endpoint returns `institutional-ownership`** (with a hyphen) as the JSON key. The wrapper checks both `institutional-ownership` and `institutional_ownership` for compatibility.

4. **Rate limiting** — a simple timestamp-based approach in each API wrapper. Financial Datasets gets 250ms between calls; CoinGecko the same. This is conservative but prevents 429s.

5. **Wilder's RSI** — uses the smoothed Wilder's method (not simple average), which is the standard for RSI-14 and matches what TradingView/Bloomberg display.

6. **Relative strength ranking** is a two-pass process: first compute raw RS for each stock, then rank across the full universe as percentiles (0-100). This is done in `compute-technicals.ts`.

7. **`dotenv` installed** for scripts since they run outside Next.js's env loading. Scripts import `dotenv/config` at the top.

8. **Unusual Whales API deferred** — removed from `.env` and dependencies. Options flow is 10% of the composite score; not worth $50-250/mo until the other six signals prove themselves. The `options_flow_signals` table and `options_flow_score` column are preserved in the schema. `scoreOptionsFlow()` returns neutral 50 for all stocks. Score weights redistributed: technical 25→28, earnings_ai 20→22, options_flow 10→5. Mega block and sweep storm Discord alerts disabled (commented out, not deleted). Architecture remains plug-and-play for when a data source is added.

9. **Alpha Vantage API removed** — unnecessary dependency. Financial Datasets already provides 200+ days of OHLCV data, and all technical indicators (SMA, EMA, RSI, MACD, ATR, volume ratio, 52-week range, relative strength) are computed locally in `lib/indicators.ts`. Zero additional API calls, zero rate limits (AV free tier is 25 calls/day), and indicators update instantly when price data refreshes. All data comes from one source: Financial Datasets.

### API Quirks / Gotchas

- Financial Datasets API uses `X-API-KEY` header (not Bearer token)
- Company facts endpoint is "experimental and free" per their docs
- Available tickers list is at `/prices/tickers/` (trailing slash matters on some endpoints)
- Income statements require both `ticker` and `period` params (period is not optional)
- Insider trades default limit is only 10 — always specify `limit=100` or higher
- The financial metrics snapshot endpoint returns pre-computed ratios (PE, PEG, margins, growth) which saves us from computing them ourselves

### Data Quality Notes

- Some stocks may not have 200 trading days of price data (recently IPO'd, delisted, etc.)
- Fundamentals `forward_pe` and `dividend_yield` are not available from the financial metrics snapshot — will need a separate data source or calculation in Sprint 3
- QoQ growth rates are computed from sequential quarterly income statements; the "year ago quarter" match uses a 300-420 day window to handle fiscal calendar differences

### Next Steps (Sprint 2 Context)

Sprint 2 focuses on the **Screener Engine + Basic UI**:
- `lib/screener.ts` — filtering engine that queries `technical_signals`, `fundamentals`, `sentinel_scores`
- `app/api/screen/route.ts` — POST endpoint
- Dark-themed sidebar navigation (`components/layout/Sidebar.tsx`)
- Screener page (`app/screener/page.tsx`) with filter panel and results table
- Needs: all 8 migrations run in Supabase, seed + backfill scripts executed at least once

**Before starting Sprint 2**, run in this order:
```bash
# 1. Run all migrations in Supabase SQL editor (001-008)
# 2. Seed the universe
npm run seed:stocks
npm run seed:crypto
# 3. Backfill data
npm run backfill:prices
npm run backfill:fundamentals
# 4. Compute technical indicators
npm run compute:technicals
```

---

## Sprint 2: Scoring Engine + Screener UI

**Status:** COMPLETE  
**Dates:** March 20, 2026

### What Was Built

| Component | Files | Status |
|-----------|-------|--------|
| Technical analyzer | `lib/analyzers/technical.ts` — score + flag detection (RSI, MACD, trend, breakout) | Done |
| Fundamental analyzer | `lib/analyzers/fundamental.ts` — score + flag detection (value, growth, margins) | Done |
| Insider/Institutional analyzer | `lib/analyzers/insider.ts` — insider score + institutional score | Done |
| Composite scorer | `lib/scoring.ts` — weighted combination of all sub-scores, ranking, persistence | Done |
| Score computation script | `scripts/compute-scores.ts` + npm script | Done |
| Screener engine | `lib/screener.ts` — multi-join query with in-memory post-filtering | Done |
| API routes | `app/api/scores/route.ts`, `app/api/screen/route.ts` | Done |
| Sidebar navigation | `components/layout/Sidebar.tsx` — dark theme, active state | Done |
| Dashboard page | `app/page.tsx` — stats cards, top 20 table with score badges | Done |
| Screener page | `app/screener/page.tsx` + `ScreenerClient.tsx` — filters, search, sortable table | Done |
| Shared components | `ScoreBadge.tsx`, `DataTable.tsx` | Done |

### Architecture Decisions (Sprint 2)

10. **Scoring approach**: Each analyzer returns a 0-100 score using linear interpolation (`lerp`). Missing data defaults to 50 (neutral). Composite score is a weighted average per `SCORE_WEIGHTS` in constants.

11. **Screener uses server-side data fetch + client-side filtering/sorting**: Initial data is loaded via RSC (server component), then all filtering/sorting happens client-side for instant UX. No round-trips for filter changes.

12. **Earnings AI, options flow, and news sentiment are stubbed at 50**: These require data sources not yet integrated (Sprint 3+). The scoring architecture supports them — just wire up the analyzer when data is available.

13. **tsconfig paths fixed**: `@/*` mapped to `./*` (not `./src/*`) since we don't use a src directory.

14. **656 stocks scored, 0 errors**: Full universe scored in ~284 seconds. All S&P 500 + 173 extras with sector data + SPY benchmark.

---

## Sprint 3: Full UI Overhaul + AI Analysis Layer

**Status:** COMPLETE  
**Dates:** March 20, 2026

### What Was Built

| Component | Files | Status |
|-----------|-------|--------|
| Stock detail page | `app/stock/[symbol]/page.tsx` — server data loader with parallel fetch | Done |
| Stock detail client | `app/stock/[symbol]/StockDetail.tsx` — tabbed layout (Overview, Fundamentals, Technicals, Insider) | Done |
| Price chart | `app/stock/[symbol]/PriceChart.tsx` — lightweight-charts v5 candlestick + SMA 50/200 overlays + volume | Done |
| Score radar | `app/stock/[symbol]/ScoreRadar.tsx` — recharts RadarChart of all 7 component scores | Done |
| Flag chips | `components/ui/FlagChip.tsx` — colored pills for 30+ technical/fundamental/insider flags with tooltips | Done |
| Filter modal | `components/screener/FilterModal.tsx` — slide-over with toggle/number inputs for all filter types | Done |
| Screener overhaul | `app/screener/ScreenerClient.tsx` — presets, filter modal, pagination (25/50/100), clickable rows | Done |
| LLM wrapper | `lib/llm.ts` — multi-provider (Gemini/Anthropic/OpenRouter) with JSON mode + fallback | Done |
| AI sentiment analyzer | `lib/analyzers/sentiment.ts` — builds prompts from fundamentals/technicals, returns structured scores | Done |
| Scoring upgrade | `lib/scoring.ts` — wired real AI scores from `earnings_analysis`, added `score_change_1d`/`7d` tracking | Done |
| AI batch script | `scripts/compute-ai-analysis.ts` — batch AI analysis for all stocks | Done |
| Dashboard upgrade | `app/page.tsx` — card grid top 10, movers section, SPY overview, preset quick links | Done |
| Responsive sidebar | `components/layout/Sidebar.tsx` — mobile hamburger + slide-over, stock page indicator | Done |
| Loading states | `app/loading.tsx`, `app/screener/loading.tsx`, `app/stock/[symbol]/loading.tsx` — skeleton loaders | Done |
| Error states | `app/stock/[symbol]/not-found.tsx` — 404 page for missing stocks | Done |

### Architecture Decisions (Sprint 3)

15. **lightweight-charts v5 API**: Uses `chart.addSeries(CandlestickSeries, options)` instead of the deprecated `chart.addCandlestickSeries()`. Series definitions are imported from the package (`CandlestickSeries`, `LineSeries`, `HistogramSeries`).

16. **LLM provider fallback**: `lib/llm.ts` checks `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY` in order. First available provider is used. Gemini is prioritized for speed and cost.

17. **AI scoring via `earnings_analysis` table**: The AI analyzer stores results in the existing `earnings_analysis` table (conviction_score, management_tone, one_line_summary, key_positives, key_concerns). The scorer reads `conviction_score` as the `earnings_ai_score` — no new tables needed.

18. **Score change tracking**: `computeAndStoreScores` reads the previous score + timestamp before computing. If scored within 2 days, stores `score_change_1d`; within 8 days, `score_change_7d`. Dashboard movers section uses this.

19. **Screener presets**: All presets from `SCREENER_PRESETS` are rendered as clickable pills above the screener. Clicking applies the preset's filters and sort; clicking again clears. Filter modal edits override preset state.

20. **Client-side filter matching**: `matchesFilters()` in `ScreenerClient.tsx` applies filters in-memory against the full dataset. This keeps the architecture simple (no additional API calls) and filters feel instant.

---

## Sprint 4: Discord Bot + Automation + Watchlist + Signals

**Status:** COMPLETE  
**Dates:** March 20, 2026

### What Was Built

| Component | Files | Status |
|-----------|-------|--------|
| Discord embed formatters | `lib/discord.ts` — score embed with bar charts, top 10 embed, alert embed | Done |
| Alert detection engine | `lib/alerts.ts` — detects score threshold, score drop, insider cluster buy, CEO buy, triple confirmation; 24h dedup via `alert_history` | Done |
| Discord bot | `discord/bot.ts` — standalone process with `/sentinel`, `/top10`, `/scan` slash commands | Done |
| Cron: fetch prices | `app/api/cron/fetch-prices/route.ts` — daily price ingestion for all active stocks (5-day rolling window) | Done |
| Cron: compute scores | `app/api/cron/compute-scores/route.ts` — technicals + RS ranking + composite score in one pass | Done |
| Cron: AI analysis | `app/api/cron/ai-analysis/route.ts` — re-analyze top 20 movers with LLM | Done |
| Cron: discord alerts | `app/api/cron/discord-alerts/route.ts` — detect + record alerts | Done |
| Watchlist API | `app/api/watchlist/route.ts` — GET/POST/DELETE, single-user mode with UUID sentinel | Done |
| Watchlist page | `app/watchlist/page.tsx` + `WatchlistClient.tsx` — add/remove symbols, score table, clickable rows | Done |
| Watchlist loading | `app/watchlist/loading.tsx` — skeleton loader | Done |
| Signal tracker lib | `lib/signals.ts` — snapshotSignal, computeSignalPerformance, getRecentSnapshots | Done |
| Signals page | `app/signals/page.tsx` + `SignalsClient.tsx` — performance by type table + recent signals table with tabs | Done |
| Signals loading | `app/signals/loading.tsx` — skeleton loader | Done |
| Dashboard alerts feed | `app/page.tsx` — recent alerts section with type icons, relative time | Done |
| Sidebar update | `components/layout/Sidebar.tsx` — v0.4.0 | Done |

### Architecture Decisions (Sprint 4)

21. **Cron routes use `CRON_SECRET` Bearer token** for auth. All four cron routes share the same verification pattern. `maxDuration` is set to 300s for data-intensive routes (fetch-prices, compute-scores, ai-analysis) and 60s for alerts.

22. **Watchlist uses single-user mode** with a hardcoded UUID (`00000000-0000-0000-0000-000000000001`). No auth required. When auth is added later, swap the constant for the session user ID.

23. **Discord bot is a standalone process** (`tsx discord/bot.ts`), not part of the Next.js app. This keeps the bot's persistent WebSocket connection separate from the Next.js server lifecycle.

24. **Alert dedup**: `detectAlerts()` queries `alert_history` for the last 24 hours and skips any symbol+type combo already present. This prevents duplicate alerts when cron runs multiple times per day.

25. **Signal snapshots**: `snapshotSignal()` captures the full score state at signal time. The `signal_snapshots` table has `return_7d`, `return_30d`, `return_90d`, and `alpha_30d` columns that get backfilled by a separate performance computation pass once enough time has elapsed.

26. **AI analysis cron targets movers**: Instead of re-analyzing all 656 stocks daily, the AI cron route focuses on the top 20 stocks by `score_change_1d`. This keeps LLM costs predictable while ensuring the most volatile/interesting stocks get fresh analysis.

27. **compute-scores cron combines technicals + scoring**: Rather than two separate cron jobs, the compute-scores route does technicals → RS ranking → composite scoring in a single pass. This ensures scores always reflect the latest technical indicators.

---

## Sprint 5: Backtesting & Performance Tracking

**Status:** COMPLETE  
**Dates:** March 20, 2026

### What Was Built

| Component | Files | Status |
|-----------|-------|--------|
| Return backfill engine | `scripts/backfill-returns.ts` — computes 1d/3d/7d/14d/30d/60d/90d forward returns, SPY alpha, max drawdown for all signal snapshots | Done |
| Historical backtester | `scripts/backtest.ts` — replays price history to detect golden_cross, stage2_breakout, rsi_oversold_bounce, volume_breakout, macd_bullish_cross, insider_cluster_buy, insider_ceo_buy, score_threshold, score_drop signals | Done |
| Performance aggregation | `scripts/compute-performance.ts` — aggregates into `signal_performance` + `score_bucket_performance` tables with Sharpe estimate | Done |
| Weight optimization | `scripts/optimize-weights.ts` — Pearson correlation analysis of sub-scores vs forward alpha, produces `docs/weight-optimization-report.md` | Done |
| Signals page upgrade | `app/signals/SignalsClient.tsx` — 3 tabs: By Signal Type, By Score Bucket, Recent Signals | Done |
| Score bucket tab | Shows 5 buckets (0-30, 30-50, 50-65, 65-75, 75-100) with avg return, alpha, win rate, verdict | Done |
| Dashboard: Signal of the Day | `app/page.tsx` — highlights best-performing signal type with avg return, win rate, alpha | Done |
| Dashboard: Score accuracy | `app/page.tsx` — compares high-score (75-100) vs low-score (0-30) 30d returns | Done |
| Signal lib upgrade | `lib/signals.ts` — added `getScoreBucketPerformance()`, `getSignalPerformanceFromDB()` | Done |

### Architecture Decisions (Sprint 5)

28. **Backtest deduplication**: Signals are deduplicated per symbol+type within 10 trading-day windows. A golden cross on day 50 and day 52 for the same stock counts as one signal. This prevents inflating signal counts and biasing performance metrics.

29. **Forward returns use trading days, not calendar days**: `return_7d` is actually 5 trading days forward, `return_30d` is 21, etc. This is more meaningful for stock returns and avoids weekend/holiday artifacts.

30. **Score backtest uses weekly sampling**: To avoid O(n²) complexity, score threshold/drop signals are sampled every 5 trading days rather than daily. This is sufficient to capture regime changes while keeping backtest runtime reasonable.

31. **Weight optimization uses Pearson correlation + quartile spread**: Predictive power is 60% correlation strength + 40% high-low quartile return spread. This dual metric prevents over-fitting to noise in sparse sub-scores while rewarding genuine discriminating signals.

32. **Signals page prefers DB-stored backtest data**: `getSignalPerformanceFromDB()` is checked first; falls back to live `computeSignalPerformance()` only if no backtest results exist. This ensures fast page loads after backtest runs.

33. **Backtest upserts use `ignoreDuplicates: true`**: Re-running the backtest is idempotent. Existing snapshots with the same (symbol, snapshot_date, trigger_type) are preserved, not overwritten.

### Running the Pipeline

```bash
# Step 1: Generate historical signal snapshots
npm run backtest

# Step 2: Fill in forward returns for all snapshots
npm run backfill:returns

# Step 3: Aggregate performance metrics
npm run perf

# Step 4: (Optional) Analyze weight optimization
npm run optimize:weights
```

---

## Post-Sprint 5: Data Backfill + Cron Consolidation

**Status:** COMPLETE

### Changes
- **Insider trades backfill:** `scripts/backfill-insiders.ts` — 56,943 trades from Financial Datasets API + insider signal computation
- **Institutional holdings backfill:** `scripts/backfill-institutional.ts` — 62,216 holdings + institutional signal computation
- **Consolidated cron route:** Merged 4 separate routes (`fetch-prices`, `compute-scores`, `ai-analysis`, `discord-alerts`) into single `app/api/cron/daily/route.ts` — Vercel free tier only allows 2 cron jobs
- **RSI Oversold Bounce detection:** Real-time detection in cron pipeline — compares previous RSI against new RSI, fires `signal_snapshot` + alert when RSI crosses back above 30
- **Fixed:** Pagination bug in `compute-performance.ts` (was capped at 1000 rows), pre-existing missing import in `screener/page.tsx`

### Architecture Decisions
34. Consolidated all cron routes into single `/api/cron/daily` — runs at 14:00 UTC weekdays (after market close)
35. RSI bounce detection reads previous RSI from `technical_signals` before overwriting with new value
36. Insider backtest signals show negative performance (-15% to -20%), consistent with academic research on insider buying during distressed periods

### Running

```bash
# Backfill insider & institutional data
npm run backfill:insiders
npm run backfill:institutional

# Local cron (all steps including RSI bounce detection)
npm run cron
```

---

## Sprint 6: Polish & Launch

**Status:** NOT STARTED

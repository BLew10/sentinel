# Sentinel Daily Playbook

How to use Sentinel every day to find high-probability trades before the crowd.

---

## The Core Idea

Sentinel scores ~3,000 stocks daily across 7 dimensions and produces a composite **Sentinel Score** (0–100). But scores alone don't make money — **convergence of predictive signals does**. This playbook teaches you how to read the platform like a professional, prioritize what matters, and act on setups with an actual edge.

---

## Daily Schedule

### Pre-Market (before 9:30 AM ET)

The cron pipeline runs at 10:00 AM ET and refreshes prices, indicators, scores, and alerts. Before that:

1. **Check yesterday's alerts** — Open the Dashboard. The "Recent Alerts" section splits into **Predictive** and **Confirmatory** tabs.
   - Predictive alerts (BB Squeeze, RSI Divergence, Accumulation, Vol Dry-Up, SMA Converging) are your edge — these fire *before* moves happen.
   - Confirmatory alerts (Score Spike, Golden Cross, Volume Breakout) tell you a move is already underway. Useful for confirmation, dangerous for entries.

2. **Review "Today's Best Setups"** — The Dashboard hero section shows up to 5 stocks with the highest-conviction setups. Each card shows:
   - **Setup type** (e.g. Volatility Squeeze, Accumulation Detected)
   - **Conviction dots** (1–5) — higher is better
   - **Thesis** — a one-line reason this setup matters
   - **Watch-for checklist** — the specific things that would confirm the setup is working
   - **Timeframe** — how long you should expect to wait

3. **Scan "Setups Forming Now"** — Counts of stocks by predictive alert type over the past 7 days. Click any chip to jump to a filtered screener view. Look for setup types with growing counts — that's where the market is setting up.

### Post-Pipeline (after 10:00 AM ET)

After fresh data arrives:

4. **Run the Morning Screener Workflow** — See the "Four Screener Strategies" section below.

5. **Deep-dive 2–3 stocks** — For your best candidates, open the Stock Detail page. Use the **Setup Analysis Panel** at the top (before the chart tabs) to see:
   - Active setup name + conviction
   - AI analysis summary and forward catalysts
   - Watch-for checklist specific to that stock

6. **Check Divergences** — The Dashboard "Divergences" section shows stocks where one signal is strong but another is weak. These are the highest-edge plays. Examples:
   - **Insider Buy + Weak Price** — insiders are buying but the stock hasn't moved yet
   - **Fundamentals Lead Price** — financials improved but the market hasn't noticed
   - **AI Sees Value** — Claude's analysis is bullish but the score is low
   - **Quiet Accumulation** — institutional buying without price movement
   - **Deep Value Ignored** — classic value metrics screaming but the market is asleep

### End of Day (after 4:00 PM ET)

7. **Update your watchlist** — Add stocks from today's setups to your watchlist with notes about what you're watching for. Remove stocks where the setup has played out or failed.

8. **Review the Signals page** — Check the "Best Performing Signal (30d)" and "Score Accuracy" panels. This tells you which alert types have been most profitable recently and whether high Sentinel Scores are actually predicting forward returns. Adjust your strategy emphasis accordingly.

---

## Four Screener Strategies

The Screener is your primary tool for finding new ideas. The Dashboard "Find Your Edge" section links to four pre-built strategies. Here's how to use each:

### 1. Volatility Squeeze (Predictive)

**Screener Preset:** `volatility_squeeze`

**What it finds:** Stocks where Bollinger Bands have contracted (BB Squeeze flag) with low ATR — coiled springs about to expand.

**How to trade it:**
- Entry: When Bollinger Bands begin to expand (watch for price breaking above the upper band on volume)
- Confirmation: OBV accumulation, RS acceleration
- Timeframe: 1–3 weeks
- Best when: VIX is low and the broader market is range-bound

**Watch for:** Volume surge on breakout day. No volume = false breakout.

### 2. Insider Contrarian (Edge)

**Screener Preset:** `insider_contrarian`

**What it finds:** Stocks with insider buying while price action is weak or declining. The divergence is the edge — insiders know more than the tape shows.

**How to trade it:**
- Entry: After confirming insiders are buying at current or lower levels (check the Insiders tab on Stock Detail)
- Confirmation: Look for CEO/CFO buys specifically (higher signal value than director buys)
- Timeframe: 1–3 months (insiders are early)
- Best when: The stock has been beaten down on no specific bad news

**Watch for:** Cluster buys (3+ insiders within 30 days). Single buys are weaker.

### 3. Value Reversal (Predictive)

**Screener Preset:** `value_reversal_candidates`

**What it finds:** Stocks flagged `VALUE_REVERSAL_CANDIDATE` — high fundamental score + low technical score. The financials are strong but the stock is technically broken.

**How to trade it:**
- Entry: Wait for a technical catalyst (RSI crossing above 30, price reclaiming 50-day SMA)
- Confirmation: AI conviction score > 60, estimate revisions trending up
- Timeframe: 2–8 weeks
- Best when: Market is recovering from a selloff (value rotations)

**Watch for:** Don't catch falling knives. Wait for the first sign of a bottom (higher low on the daily chart).

### 4. Minervini Trend Template (Momentum)

**Screener Preset:** `minervini_trend_template`

**What it finds:** Stocks in confirmed Stage 2 uptrends — price above rising 50/150/200-day SMAs, within 25% of 52-week high, and at least 30% above 52-week low.

**How to trade it:**
- Entry: On pullbacks to the 50-day SMA or on breakouts from tight consolidations (BB Squeeze within a Stage 2 is the best setup)
- Confirmation: Volume should contract during the pullback and expand on the breakout
- Timeframe: Swing (2–6 weeks) or position (2–6 months)
- Best when: Broad market is trending up (rising SPY)

**Watch for:** Death Cross or break below 200-day SMA = exit signal.

---

## Reading the Stock Detail Page

When you find a candidate from the screener or dashboard, here's what to focus on:

### Setup Analysis Panel (top of page)

This is the most important section. It tells you:
- **Which setup is active** and at what conviction level
- **AI summary** — Claude's one-line assessment and forward catalysts
- **What to watch** — specific confirmations you need before acting

### Score Breakdown

The composite score is a weighted blend:

| Dimension | Weight | What It Measures |
|-----------|--------|------------------|
| Technical | 22% | Price action, SMAs, RSI, MACD, volume |
| Estimate Revision | 20% | Analyst estimate changes (EPS + revenue) |
| AI Analysis | 18% | Claude's earnings analysis conviction |
| Insider | 15% | Net insider buying activity |
| Fundamental | 12% | Growth, profitability, valuation |
| Institutional | 8% | Notable fund positioning |
| News Sentiment | 5% | Recent news tone |

**What to look for:**
- Scores above 75 are high-conviction
- A rising score (positive score change) matters more than absolute level
- Check which dimensions are driving the score — if it's all technical, the move may already be priced in; if it's insider + fundamental, the move may be ahead

### Tabs to Check

1. **Overview** — Score bars for each dimension. Look for lopsided scores (high fundamental, low technical = potential value reversal).
2. **Technicals** — Flags section shows all active technical flags. Check for predictive flags (BB_SQUEEZE, RSI_BULLISH_DIVERGENCE, OBV_ACCUMULATION, ATR_SQUEEZE, RS_ACCELERATING).
3. **Insiders** — Timeline of insider transactions. Focus on CEO/CFO buys and cluster activity.
4. **AI Analysis** — Full Claude analysis including key positives, concerns, and catalysts. Check `analyzed_at` — stale analysis (>7 days) should be treated with less confidence.

---

## Signal Types Cheat Sheet

### Predictive (Act Before the Move)

| Signal | What It Means | Typical Lead Time |
|--------|---------------|-------------------|
| BB Squeeze | Bollinger Bands contracting, volatility coiling | 1–3 weeks |
| RSI Divergence | Price making lower lows, RSI making higher lows | 1–2 weeks |
| Accumulation | OBV rising while price flat — someone is buying quietly | 2–4 weeks |
| Volume Dry-Up | Volume contracting to extremely low levels — precedes expansion | 1–2 weeks |
| SMA Converging | Moving averages bunching together — big move imminent | 1–3 weeks |
| Value Reversal | Strong fundamentals + beaten-down technicals | 2–8 weeks |
| Pre-Earnings Setup | Positive estimate revisions heading into earnings | Days to 2 weeks |
| Estimate Revision | Analysts raising EPS/revenue estimates | 1–4 weeks |

### Confirmatory (Move in Progress)

| Signal | What It Means | Action |
|--------|---------------|--------|
| Score Spike | Sentinel Score jumped significantly | Investigate why — may be chasing |
| Golden Cross | 50-day SMA crossed above 200-day | Trend confirmed, not a timing signal |
| Volume Breakout | Price + volume surging | Move is happening now — assess risk/reward |
| Insider Cluster | 3+ insiders bought recently | Confirms conviction — good for adding |
| Stage 2 Breakout | Stock entered Minervini uptrend | Trend is established |
| MACD Cross | MACD crossed bullish | Momentum shifting — confirming, not predicting |

---

## Flag Reference

### Technical Flags
| Flag | Meaning | Predictive? |
|------|---------|-------------|
| BB_SQUEEZE | Bollinger Bands contracted | Yes |
| RSI_BULLISH_DIVERGENCE | Bullish RSI divergence | Yes |
| RSI_BEARISH_DIVERGENCE | Bearish RSI divergence | Yes (bearish) |
| OBV_ACCUMULATION | On-Balance Volume accumulating | Yes |
| OBV_DISTRIBUTION | On-Balance Volume distributing | Yes (bearish) |
| VOLUME_DRY_UP | Volume at extreme lows | Yes |
| ATR_SQUEEZE | ATR percentile contracting | Yes |
| RS_ACCELERATING | Relative strength improving vs SPY | Yes |
| RS_DECELERATING | Relative strength weakening vs SPY | Yes (bearish) |
| GOLDEN_CROSS | 50-day crossed above 200-day | No (lagging) |
| DEATH_CROSS | 50-day crossed below 200-day | No (lagging) |
| RSI_OVERSOLD | RSI below 30 | Condition, not signal |
| RSI_OVERBOUGHT | RSI above 70 | Condition, not signal |
| MACD_BULLISH_CROSS | MACD crossed bullish | No (lagging) |
| VOLUME_SURGE | Unusual volume spike | No (reactive) |
| STAGE2_UPTREND | In Minervini Stage 2 | Trend state |
| NEAR_52W_HIGH | Within 10% of 52-week high | Trend state |
| BREAKING_OUT | Price at new highs on volume | No (reactive) |

### Fundamental Flags
| Flag | Meaning |
|------|---------|
| DEEP_VALUE | Undervalued on multiple metrics |
| HIGH_GROWTH | Revenue + earnings growth > 20% |
| ACCELERATING_REVENUE | Revenue growth rate increasing |
| ACCELERATING_EARNINGS | Earnings growth rate increasing |
| MARGIN_EXPANSION | Profit margins improving |
| HIGH_ROE | Return on equity > 20% |
| CASH_MACHINE | Strong free cash flow generation |
| OVER_LEVERAGED | Debt levels concerning |
| NEGATIVE_EARNINGS | Company is unprofitable |

### Estimate Flags
| Flag | Meaning | Predictive? |
|------|---------|-------------|
| EPS_REVISION_UP | Analysts raising EPS estimates | Yes |
| EPS_REVISION_DOWN | Analysts cutting EPS estimates | Yes (bearish) |
| REVENUE_REVISION_UP | Analysts raising revenue estimates | Yes |
| REVENUE_REVISION_DOWN | Analysts cutting revenue estimates | Yes (bearish) |
| ESTIMATE_BEAT_STREAK | Consecutive earnings beats | Trend |
| EARNINGS_APPROACHING | Earnings date within ~2 weeks | Event flag |

---

## The Decision Framework

Before acting on any setup, run through this checklist:

### 1. Is the signal predictive or confirmatory?
If confirmatory, the move may be mostly done. Assess remaining upside carefully.

### 2. How many signals are converging?
- 1 signal = interesting, not actionable
- 2 signals = worth watching closely
- 3+ signals = high-conviction setup

### 3. What is the conviction level?
- 1–2 dots = early/weak — add to watchlist only
- 3 dots = moderate — begin sizing position
- 4–5 dots = strong — full position warranted

### 4. What is the timeframe?
Match your holding period to the setup's expected timeframe. Don't expect a volatility squeeze to pay off in 2 days, and don't hold a pre-earnings setup past the earnings date.

### 5. What's the exit plan?
Before entering, define:
- **Profit target** — based on ATR or prior resistance levels
- **Stop loss** — below the setup's key level (e.g. below the squeeze range, below the divergence low)
- **Time stop** — if the setup hasn't triggered within 2x the expected timeframe, it probably failed

---

## Weekly Review (Weekend)

1. **Signals page** — Check which signal types had the best forward returns over 7d, 14d, 30d. Double down on what's working.
2. **Sectors page** — Look for sector rotation signals. Money flowing into a new sector = new setups forming.
3. **Score bucket performance** — Are high-scoring stocks (75–100) actually outperforming low-scoring stocks (0–30)? If yes, trust the scores. If not, weight divergences and flags more heavily.
4. **Guide page** — Revisit the four strategy archetypes. Consider whether market conditions favor one over others:
   - Low-VIX, range-bound → Volatility Squeeze
   - Market selloff → Value Reversal
   - Strong uptrend → Minervini Trend Template
   - Uncertain → Insider Contrarian (insiders don't care about macro)

---

## Common Mistakes to Avoid

1. **Chasing confirmatory signals** — By the time you see a Score Spike or Volume Breakout, the easy money is made. Use these to validate, not initiate.

2. **Ignoring conviction levels** — A 1-dot setup is a hypothesis, not a trade. Wait for conviction to build or for confirming signals to arrive.

3. **Overloading on one setup type** — If you have 5 Volatility Squeeze plays, you're making one bet five times. Diversify across setup types.

4. **Skipping the watch-for checklist** — Every setup card has specific conditions to monitor. These exist because the setup can fail. If the watch-for items aren't checking off, the setup is breaking down.

5. **Treating the Sentinel Score as a buy signal** — The score is a ranking tool, not a timing tool. A score of 85 means the stock ranks well across dimensions — it doesn't mean "buy now." Combine the score with an active predictive setup for timing.

6. **Not checking AI analysis freshness** — Claude's analysis is a snapshot. If `analyzed_at` is more than 7 days old, the analysis may not reflect recent developments.

7. **Fighting the trend** — Value reversals and RSI divergences are powerful, but they require patience. Don't size up until price confirms the reversal. The market can stay irrational longer than you can stay solvent.

---

## Using Claude as Your Analyst (No API Credits)

Sentinel includes a built-in briefing system that exports today's data in a format optimized for LLMs. You can use Claude (claude.ai), ChatGPT, or any AI chat to analyze the data — no API credits needed.

### One-Time Setup

1. Go to [claude.ai](https://claude.ai) and create a new **Project** called "Sentinel Trading"
2. Upload this file (`docs/DAILY-PLAYBOOK.md`) as **project knowledge** — Claude will use it as permanent context for every conversation in the project
3. That's it. The playbook teaches Claude how to interpret Sentinel data.

### Daily Workflow

1. Open Sentinel and go to **Briefing** in the sidebar (or visit `/briefing`)
2. Click **Copy Briefing** — this copies all of today's data (setups, divergences, scores, alerts, signal performance)
3. Open your Claude project and start a new chat
4. Paste the briefing data
5. Copy the suggested prompt from the Briefing page (or use the one below) and send it

### The Prompt

```
You are my trading analyst. I've pasted today's Sentinel platform briefing data below.

Using the data, give me:

1. **Today's Top 3 Plays** — The 3 best risk/reward setups from the active setups
   and divergences. For each:
   - Ticker and setup type
   - Why this is actionable NOW (not just interesting)
   - Specific entry trigger to watch for
   - Where to set a stop loss
   - Realistic profit target and timeframe
   - Conviction level (low/medium/high) and why

2. **What to Avoid** — Any stocks that look like traps (confirmatory signals only,
   move already done, poor risk/reward)

3. **Market Context Read** — Based on SPY, setup counts, and signal performance:
   - Is the current market favoring any particular strategy type?
   - Should I be aggressive or cautious today?

4. **Watchlist Additions** — 2-3 stocks not yet actionable but worth monitoring,
   with the specific trigger that would make them actionable

Rules:
- Prioritize PREDICTIVE signals over confirmatory ones
- Higher conviction setups (3+ dots) are stronger
- Divergences represent the highest edge
- Consider which signal types have been profitable recently
- Be specific with entries and exits
```

### API Access

The briefing is also available as a raw API endpoint:

```
GET /api/briefing?token=YOUR_BRIEFING_TOKEN
```

- Returns markdown by default
- Add `&format=json` for structured JSON
- Supports `Authorization: Bearer YOUR_BRIEFING_TOKEN` header as an alternative

Set your token in `.env` as `BRIEFING_TOKEN`. This allows you to integrate with any tool that can fetch a URL — including Claude's web browsing, custom scripts, or automation workflows.

import Link from 'next/link';

export const metadata = {
  title: 'Guide — Sentinel',
  description: 'Learn how to use Sentinel effectively to find high-conviction trade ideas.',
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-xl font-display font-bold tracking-tight mb-4 text-text-primary">{title}</h2>
      {children}
    </section>
  );
}

function Card({ children, accent }: { children: React.ReactNode; accent?: 'green' | 'purple' | 'amber' | 'red' | 'cyan' }) {
  const borderColor = accent ? `border-${accent}/20` : 'border-border';
  const bgColor = accent ? `bg-${accent}-bg` : 'bg-bg-secondary';
  return (
    <div className={`rounded-lg border ${borderColor} ${bgColor} p-5`}>
      {children}
    </div>
  );
}

function ScoreRange({ range, label, color, description }: {
  range: string; label: string; color: string; description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className={`w-2.5 h-2.5 rounded-full ${color} shrink-0 mt-1.5`} />
      <div>
        <div className="flex items-center gap-2">
          <span className="font-display font-bold text-sm text-text-primary">{range}</span>
          <span className="text-xs text-text-secondary">— {label}</span>
        </div>
        <p className="text-text-tertiary text-xs mt-0.5">{description}</p>
      </div>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 bg-green-bg border border-green/20 rounded-lg px-4 py-3">
      <span className="text-green text-sm mt-0.5 shrink-0">✦</span>
      <p className="text-text-secondary text-sm leading-relaxed">{children}</p>
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 bg-amber-bg border border-amber/20 rounded-lg px-4 py-3">
      <span className="text-amber text-sm mt-0.5 shrink-0">⚠</span>
      <p className="text-text-secondary text-sm leading-relaxed">{children}</p>
    </div>
  );
}

function NavPill({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="px-3 py-1.5 text-xs rounded-lg border border-border text-text-secondary hover:text-text-primary hover:border-green/30 transition-colors"
    >
      {label}
    </a>
  );
}

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'sentinel-score', label: 'The Score' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'screener', label: 'Screener' },
  { id: 'stock-detail', label: 'Stock Detail' },
  { id: 'signals', label: 'Signals' },
  { id: 'strategies', label: 'Strategies' },
  { id: 'flags', label: 'Flags' },
  { id: 'risk', label: 'Risk' },
];

export default function GuidePage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Platform Guide</h1>
        <p className="text-text-secondary text-sm mt-1">
          Everything you need to get the most out of Sentinel and find high-conviction trade ideas.
        </p>
      </div>

      {/* Quick nav */}
      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <NavPill key={s.id} href={`#${s.id}`} label={s.label} />
        ))}
      </div>

      {/* Overview */}
      <Section id="overview" title="What is Sentinel?">
        <div className="space-y-4">
          <p className="text-text-secondary text-sm leading-relaxed">
            Sentinel is an AI-powered equity screening platform that combines <strong className="text-text-primary">seven dimensions of analysis</strong> into
            a single composite score for every stock it tracks. Instead of checking five different tools,
            you get one number that synthesizes fundamental data, technical indicators, insider activity,
            institutional flow, options data, AI earnings analysis, and market sentiment.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card>
              <p className="text-text-tertiary text-[10px] uppercase tracking-wider mb-1">Data refreshed</p>
              <p className="font-display font-bold text-lg">Daily at 6 AM ET</p>
              <p className="text-text-tertiary text-xs mt-1">Prices, fundamentals, insider trades, and options flow are pulled before market open</p>
            </Card>
            <Card>
              <p className="text-text-tertiary text-[10px] uppercase tracking-wider mb-1">Scores computed</p>
              <p className="font-display font-bold text-lg">Daily at 7 AM ET</p>
              <p className="text-text-tertiary text-xs mt-1">All analyzers run and fresh scores are available before the opening bell</p>
            </Card>
          </div>
          <Tip>
            Check Sentinel between 7:30 AM and market open (9:30 AM ET) for the freshest scores and overnight developments. This is when new alerts fire.
          </Tip>
        </div>
      </Section>

      {/* Sentinel Score */}
      <Section id="sentinel-score" title="Understanding the Sentinel Score">
        <div className="space-y-5">
          <p className="text-text-secondary text-sm leading-relaxed">
            Every tracked stock receives a <strong className="text-text-primary">Sentinel Score from 0 to 100</strong>. Higher
            scores indicate more bullish alignment across multiple data sources. The score is a weighted
            composite of seven sub-scores:
          </p>

          <Card>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                {[
                  { name: 'Technical', weight: '28%', desc: 'RSI, MACD, moving averages, Bollinger Bands, trend strength' },
                  { name: 'AI Analysis', weight: '22%', desc: 'Claude AI evaluates earnings transcripts and cross-references all signals' },
                  { name: 'Fundamental', weight: '15%', desc: 'Valuation (PE, PS), growth rates, margins, debt, cash flow' },
                  { name: 'Insider', weight: '15%', desc: 'Insider buying/selling patterns, cluster buys, CEO purchases' },
                  { name: 'Institutional', weight: '10%', desc: 'Institutional ownership changes and 13F filing patterns' },
                  { name: 'Sentiment', weight: '5%', desc: 'Market sentiment and analyst consensus signals' },
                  { name: 'Options Flow', weight: '5%', desc: 'Unusual volume, call/put ratios, sweep orders, whale trades' },
                ].map((dim) => (
                  <div key={dim.name} className="flex items-start gap-3">
                    <span className="font-display font-bold text-green text-sm w-10 text-right shrink-0">{dim.weight}</span>
                    <div>
                      <p className="font-medium text-text-primary">{dim.name}</p>
                      <p className="text-text-tertiary text-xs">{dim.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <h3 className="text-sm font-display font-semibold text-text-primary">Score Ranges</h3>
          <div className="space-y-3">
            <ScoreRange
              range="75 – 100"
              label="Strong Buy / Bullish"
              color="bg-green"
              description="Multiple dimensions strongly aligned. These stocks have the highest conviction signals. Look for scores in this range that are also rising."
            />
            <ScoreRange
              range="65 – 74"
              label="Bullish"
              color="bg-green/60"
              description="Positive signals outweigh negatives. Worth researching further. Check which sub-scores are driving the composite."
            />
            <ScoreRange
              range="45 – 64"
              label="Neutral"
              color="bg-amber"
              description="Mixed signals or insufficient data. Not a strong edge in either direction. Wait for clearer alignment."
            />
            <ScoreRange
              range="30 – 44"
              label="Caution"
              color="bg-amber/60"
              description="More bearish than bullish signals. Proceed carefully if you hold this stock. Look at which dimensions are weak."
            />
            <ScoreRange
              range="0 – 29"
              label="Bearish"
              color="bg-red"
              description="Broad bearish alignment. Multiple red flags are present. These stocks often continue to underperform."
            />
          </div>

          <Warning>
            The Sentinel Score is a screening tool, not a trade signal by itself. Always do your own research before entering a position. High scores narrow your research universe — they don&apos;t replace analysis.
          </Warning>
        </div>
      </Section>

      {/* Dashboard */}
      <Section id="dashboard" title="Using the Dashboard">
        <div className="space-y-5">
          <p className="text-text-secondary text-sm leading-relaxed">
            The <Link href="/" className="text-green hover:text-green/80 transition-colors">Dashboard</Link> is
            your morning briefing. It surfaces the most important developments before you start your trading day.
          </p>

          <div className="space-y-4">
            <Card accent="purple">
              <h4 className="font-display font-semibold text-purple text-sm mb-2">Early Signals (the real edge)</h4>
              <p className="text-text-secondary text-xs leading-relaxed">
                These are <strong className="text-text-primary">divergences</strong> — situations where non-price indicators
                (insiders, fundamentals, AI analysis) disagree with what the chart shows. For example, insiders
                aggressively buying while the stock is technically weak. Historically, these setups offer the best
                risk/reward because the market hasn&apos;t priced in the information yet.
              </p>
              <p className="text-purple/80 text-xs mt-2 font-medium">
                Look for &quot;HIGH&quot; strength divergences with multiple overlapping signals.
              </p>
            </Card>

            <Card accent="green">
              <h4 className="font-display font-semibold text-green text-sm mb-2">Actionable Ideas</h4>
              <p className="text-text-secondary text-xs leading-relaxed">
                Stocks scoring 70+ with a human-readable summary of <em>why</em> they stand out. Each card
                explains the signal alignment — technical momentum, fundamental strength, or insider conviction.
                Click through to the stock detail page for the full breakdown.
              </p>
            </Card>

            <Card>
              <h4 className="font-display font-semibold text-sm mb-2">Score Movers</h4>
              <p className="text-text-secondary text-xs leading-relaxed">
                The biggest score changes in the last 24 hours. Score <em>gainers</em> are stocks where
                multiple signals just improved — potential emerging opportunities. Score <em>drops</em> are
                stocks losing momentum — if you hold one, investigate why the score is falling.
              </p>
            </Card>

            <Card>
              <h4 className="font-display font-semibold text-sm mb-2">Signal Performance</h4>
              <p className="text-text-secondary text-xs leading-relaxed">
                Shows the best-performing signal type over the last 30 days with win rate, average return, and
                alpha vs. SPY. Use this to understand which signal categories are currently working in this market regime.
              </p>
            </Card>
          </div>

          <Tip>
            Start each day on the Dashboard. Scan Early Signals first (divergences are the highest-alpha setups),
            then check Actionable Ideas for confirmation. Use Quick Screens to filter the screener with pre-built strategies.
          </Tip>
        </div>
      </Section>

      {/* Screener */}
      <Section id="screener" title="Using the Screener">
        <div className="space-y-5">
          <p className="text-text-secondary text-sm leading-relaxed">
            The <Link href="/screener" className="text-green hover:text-green/80 transition-colors">Screener</Link> lets
            you filter and sort the entire stock universe. Click any column header to sort, and use filters to narrow results.
          </p>

          <h3 className="text-sm font-display font-semibold text-text-primary">Pre-built Presets</h3>
          <p className="text-text-secondary text-xs leading-relaxed mb-3">
            Access these from the Dashboard&apos;s Quick Screens or the filter panel. Each preset is designed around a proven strategy:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { name: 'Sentinel Top Picks', desc: 'Highest composite scores — the system\'s strongest convictions across all dimensions.' },
              { name: 'Insider Contrarian', desc: 'Stocks where insiders are buying against the technical trend. Smart money sees value the chart doesn\'t.' },
              { name: 'Technical Breakout', desc: 'Stocks breaking above key moving averages with strong trend strength (ADX > 25).' },
              { name: 'Deep Value', desc: 'Low valuation multiples (PE, PS) with positive cash flow. For patient, value-oriented investors.' },
              { name: 'Momentum Leaders', desc: 'High technical scores with rising relative strength. Works best in trending markets.' },
              { name: 'Score Spikes', desc: 'Biggest 1-day score improvements — something just changed. Investigate what shifted.' },
            ].map((preset) => (
              <Card key={preset.name}>
                <h4 className="font-display font-semibold text-sm text-text-primary mb-1">{preset.name}</h4>
                <p className="text-text-tertiary text-xs">{preset.desc}</p>
              </Card>
            ))}
          </div>

          <h3 className="text-sm font-display font-semibold text-text-primary mt-6">Effective Screening Workflow</h3>
          <div className="space-y-2">
            {[
              { step: '1', text: 'Start with a preset or sort by Sentinel Score descending to see the highest-conviction stocks.' },
              { step: '2', text: 'Filter by sector if you have a macro thesis (e.g., tech recovering, energy strong).' },
              { step: '3', text: 'Look at the sub-score columns — a stock scoring 80+ overall with a weak technical score might be an early entry before price catches up.' },
              { step: '4', text: 'Click into individual stocks to see the full analysis, chart, and flag breakdown.' },
              { step: '5', text: 'Add your shortlist to a Watchlist for ongoing monitoring.' },
            ].map(({ step, text }) => (
              <div key={step} className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-bg-tertiary border border-border text-text-secondary text-xs font-display font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {step}
                </span>
                <p className="text-text-secondary text-sm">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Stock Detail */}
      <Section id="stock-detail" title="Reading a Stock Detail Page">
        <div className="space-y-5">
          <p className="text-text-secondary text-sm leading-relaxed">
            Click any stock ticker to open its detail page. This is where you do your deep research before making a decision.
          </p>

          <div className="space-y-3">
            <Card>
              <h4 className="font-display font-semibold text-sm mb-2">Score Breakdown</h4>
              <p className="text-text-secondary text-xs leading-relaxed">
                A radar chart shows how the stock scores across all seven dimensions. Lopsided charts reveal which
                factors are driving the composite. A stock with high insider + fundamental but low technical is a
                classic &quot;smart money is early&quot; setup.
              </p>
            </Card>

            <Card>
              <h4 className="font-display font-semibold text-sm mb-2">Price Chart</h4>
              <p className="text-text-secondary text-xs leading-relaxed">
                Interactive TradingView chart with key moving averages (SMA 50, SMA 200). Use this to identify
                support/resistance levels and validate technical signals. Volume bars show conviction behind price moves.
              </p>
            </Card>

            <Card>
              <h4 className="font-display font-semibold text-sm mb-2">Flags</h4>
              <p className="text-text-secondary text-xs leading-relaxed">
                Color-coded chips highlighting specific conditions detected by the analyzers. Green flags are bullish
                (GOLDEN_CROSS, CEO_BUY, GROWTH_MACHINE), red flags are bearish (DEATH_CROSS, DEBT_BOMB), and purple
                flags are AI-generated insights.
              </p>
            </Card>

            <Card>
              <h4 className="font-display font-semibold text-sm mb-2">AI Analysis</h4>
              <p className="text-text-secondary text-xs leading-relaxed">
                Claude AI reads all the data Sentinel has on the stock and produces a narrative summary, key factors,
                risk factors, and a catalyst timeline. The AI considers cross-signal interactions that simple rules might miss.
              </p>
            </Card>
          </div>

          <Tip>
            The most valuable information on the detail page is in the <strong>flags</strong> and <strong>AI narrative</strong>.
            Flags tell you <em>what</em> is happening. The AI narrative tells you <em>why it matters</em>.
          </Tip>
        </div>
      </Section>

      {/* Signals */}
      <Section id="signals" title="Signal Performance Tracking">
        <div className="space-y-5">
          <p className="text-text-secondary text-sm leading-relaxed">
            The <Link href="/signals" className="text-green hover:text-green/80 transition-colors">Signals</Link> page
            tracks the real performance of every signal Sentinel generates. This is how you know whether the system is actually working.
          </p>

          <Card accent="green">
            <h4 className="font-display font-semibold text-green text-sm mb-2">Why This Matters</h4>
            <p className="text-text-secondary text-xs leading-relaxed">
              Most screening tools tell you what looks good <em>now</em>. Sentinel also tracks what happened <em>after</em> each
              signal fired. Forward returns at 7, 14, 30, 60, and 90 days are measured. Alpha (return vs. SPY) is computed.
              You can see which signal types are actually profitable — and which are noise.
            </p>
          </Card>

          <h3 className="text-sm font-display font-semibold text-text-primary">Key Metrics</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card>
              <p className="font-display font-bold text-lg text-text-primary">Win Rate</p>
              <p className="text-text-tertiary text-xs mt-1">% of signals where the stock gained over the measured period. Above 55% is strong.</p>
            </Card>
            <Card>
              <p className="font-display font-bold text-lg text-text-primary">Avg Return</p>
              <p className="text-text-tertiary text-xs mt-1">Mean raw return across all signals of that type. Compares to doing nothing.</p>
            </Card>
            <Card>
              <p className="font-display font-bold text-lg text-text-primary">Alpha</p>
              <p className="text-text-tertiary text-xs mt-1">Stock return minus SPY return. Positive alpha means the signal beat the market. This is the most important metric.</p>
            </Card>
          </div>

          <Warning>
            Minimum sample size matters. A signal with 3 occurrences and 100% win rate is unreliable. Look for signals with 30+ data points for statistical significance.
          </Warning>
        </div>
      </Section>

      {/* Strategies */}
      <Section id="strategies" title="Trading Strategies">
        <div className="space-y-5">
          <p className="text-text-secondary text-sm leading-relaxed">
            Here are practical approaches to using Sentinel for profitable trading. Each strategy has a different risk profile and time horizon.
          </p>

          <div className="space-y-4">
            <Card accent="green">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-green font-display text-lg">01</span>
                <h4 className="font-display font-semibold text-sm">The Divergence Hunter</h4>
              </div>
              <div className="space-y-2 text-xs text-text-secondary leading-relaxed">
                <p><strong className="text-text-primary">Strategy:</strong> Buy stocks where insiders are buying but the technical score is weak (price hasn&apos;t caught up yet).</p>
                <p><strong className="text-text-primary">Find them:</strong> Dashboard → Early Signals, or Screener → Insider Contrarian preset.</p>
                <p><strong className="text-text-primary">Entry:</strong> After verifying insider buys are discretionary (not 10b5-1 plans). Wait for the first technical uptick.</p>
                <p><strong className="text-text-primary">Exit:</strong> When technical score catches up to insider/fundamental scores, or on a defined stop-loss.</p>
                <p><strong className="text-text-primary">Time horizon:</strong> 2-8 weeks.</p>
              </div>
            </Card>

            <Card accent="green">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-green font-display text-lg">02</span>
                <h4 className="font-display font-semibold text-sm">The Momentum Rider</h4>
              </div>
              <div className="space-y-2 text-xs text-text-secondary leading-relaxed">
                <p><strong className="text-text-primary">Strategy:</strong> Buy stocks with high and rising Sentinel Scores, especially those with strong technical and fundamental alignment.</p>
                <p><strong className="text-text-primary">Find them:</strong> Screener → sort by Sentinel Score descending. Filter for score change {'>'} +5 in the last day.</p>
                <p><strong className="text-text-primary">Entry:</strong> On score spikes (multiple dimensions improving simultaneously). Confirm with volume.</p>
                <p><strong className="text-text-primary">Exit:</strong> When the score starts declining for 3+ consecutive days, or technical score drops below 40.</p>
                <p><strong className="text-text-primary">Time horizon:</strong> 1-4 weeks.</p>
              </div>
            </Card>

            <Card accent="green">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-green font-display text-lg">03</span>
                <h4 className="font-display font-semibold text-sm">The Value Accumulator</h4>
              </div>
              <div className="space-y-2 text-xs text-text-secondary leading-relaxed">
                <p><strong className="text-text-primary">Strategy:</strong> Build positions in high-fundamental, high-AI-score stocks that are technically oversold.</p>
                <p><strong className="text-text-primary">Find them:</strong> Screener → filter for fundamental score {'>'} 70, RSI {'<'} 35. Look for RSI_OVERSOLD + DEEP_VALUE flags.</p>
                <p><strong className="text-text-primary">Entry:</strong> Scale in over multiple days. Don&apos;t try to catch the exact bottom.</p>
                <p><strong className="text-text-primary">Exit:</strong> When the stock returns to fair value (PE normalizes) or the fundamental thesis breaks.</p>
                <p><strong className="text-text-primary">Time horizon:</strong> 1-6 months.</p>
              </div>
            </Card>

            <Card accent="purple">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-purple font-display text-lg">04</span>
                <h4 className="font-display font-semibold text-sm">The AI Consensus Play</h4>
              </div>
              <div className="space-y-2 text-xs text-text-secondary leading-relaxed">
                <p><strong className="text-text-primary">Strategy:</strong> Act when AI analysis, insiders, and technicals all agree (triple confirmation).</p>
                <p><strong className="text-text-primary">Find them:</strong> Look for stocks with the AI_STRONG_BUY flag + insider buying + technical score {'>'} 60.</p>
                <p><strong className="text-text-primary">Entry:</strong> These are your highest-conviction trades. Size accordingly (still within risk limits).</p>
                <p><strong className="text-text-primary">Exit:</strong> When any two of the three dimensions flip bearish, or on your predetermined stop.</p>
                <p><strong className="text-text-primary">Time horizon:</strong> 2-6 weeks.</p>
              </div>
            </Card>
          </div>

          <Tip>
            Track your trades against the signals that triggered them. Over time, you&apos;ll learn which signal combinations work best for your risk tolerance and trading style.
          </Tip>
        </div>
      </Section>

      {/* Flags Reference */}
      <Section id="flags" title="Flags Reference">
        <div className="space-y-5">
          <p className="text-text-secondary text-sm leading-relaxed">
            Flags are specific conditions detected by Sentinel&apos;s analyzers. They appear as colored chips on stock cards and detail pages.
          </p>

          <h3 className="text-sm font-display font-semibold text-green">Bullish Flags</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { flag: 'GOLDEN_CROSS', desc: 'SMA 50 crossed above SMA 200 — long-term uptrend starting' },
              { flag: 'MACD_BULLISH_CROSS', desc: 'MACD line crossed above signal line — short-term momentum shifting up' },
              { flag: 'RSI_OVERSOLD', desc: 'RSI below 30 — potentially bouncing from oversold levels' },
              { flag: 'BREAKOUT', desc: 'Price closed above 52-week high — new high breakout' },
              { flag: 'INSIDER_CLUSTER_BUY', desc: '3+ insiders bought within 14 days — strong conviction' },
              { flag: 'CEO_BUY', desc: 'CEO made a discretionary purchase — the most informed buyer' },
              { flag: 'LARGE_INSIDER_BUY', desc: 'Single insider purchase exceeding $500K' },
              { flag: 'DEEP_VALUE', desc: 'PE under 10 with positive free cash flow — classic value' },
              { flag: 'GROWTH_MACHINE', desc: 'Revenue growth 30%+ and EPS growth 30%+ — rapid expansion' },
              { flag: 'CASH_RICH', desc: 'Current ratio above 3, debt/equity below 0.3' },
              { flag: 'CALL_SWEEP_SURGE', desc: '5+ call sweeps in one session — aggressive bullish bets' },
              { flag: 'WHALE_CALLS', desc: 'Single call order exceeding $1M premium — institutional conviction' },
              { flag: 'AI_STRONG_BUY', desc: 'AI sentiment 85+ with 80+ confidence — high AI conviction' },
            ].map(({ flag, desc }) => (
              <div key={flag} className="flex items-start gap-2 text-xs">
                <span className="font-display text-green font-bold shrink-0">{flag}</span>
                <span className="text-text-tertiary">{desc}</span>
              </div>
            ))}
          </div>

          <h3 className="text-sm font-display font-semibold text-red mt-4">Bearish Flags</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { flag: 'DEATH_CROSS', desc: 'SMA 50 crossed below SMA 200 — long-term downtrend starting' },
              { flag: 'MACD_BEARISH_CROSS', desc: 'MACD line crossed below signal — momentum fading' },
              { flag: 'RSI_OVERBOUGHT', desc: 'RSI above 70 — potentially due for a pullback' },
              { flag: 'INSIDER_SELLING_SPREE', desc: '3+ insiders selling within 14 days — management exiting' },
              { flag: 'DEBT_BOMB', desc: 'Debt/equity above 3 with current ratio below 1 — financial stress' },
              { flag: 'REVENUE_DECLINE', desc: 'Revenue down 10%+ year-over-year — shrinking business' },
              { flag: 'CASH_BURN', desc: 'Negative free cash flow for 2+ consecutive quarters' },
              { flag: 'PUT_WALL', desc: 'Concentrated put open interest at one strike — hedging or betting down' },
              { flag: 'WHALE_PUTS', desc: 'Single put order exceeding $1M premium — big bearish bet' },
              { flag: 'AI_STRONG_SELL', desc: 'AI sentiment 15 or below with high confidence — AI is bearish' },
            ].map(({ flag, desc }) => (
              <div key={flag} className="flex items-start gap-2 text-xs">
                <span className="font-display text-red font-bold shrink-0">{flag}</span>
                <span className="text-text-tertiary">{desc}</span>
              </div>
            ))}
          </div>

          <h3 className="text-sm font-display font-semibold text-amber mt-4">Caution Flags</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { flag: 'BB_SQUEEZE', desc: 'Bollinger Band width compressed — big move incoming, direction unclear' },
              { flag: 'IV_CRUSH_RISK', desc: 'IV rank above 90% — options are expensive, likely post-earnings reset' },
              { flag: 'AI_CONFLICTING_SIGNALS', desc: 'AI confidence below 40 — data is contradictory' },
              { flag: 'GAMMA_SQUEEZE_SETUP', desc: 'High call OI near price with low float — volatile setup' },
            ].map(({ flag, desc }) => (
              <div key={flag} className="flex items-start gap-2 text-xs">
                <span className="font-display text-amber font-bold shrink-0">{flag}</span>
                <span className="text-text-tertiary">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Risk Management */}
      <Section id="risk" title="Risk Management">
        <div className="space-y-5">
          <p className="text-text-secondary text-sm leading-relaxed">
            No screening tool eliminates risk. Sentinel helps you find better opportunities — but position sizing,
            diversification, and discipline determine whether you&apos;re profitable long-term.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card accent="red">
              <h4 className="font-display font-semibold text-sm text-red mb-2">Never Do</h4>
              <ul className="space-y-2 text-xs text-text-secondary">
                <li className="flex items-start gap-2">
                  <span className="text-red shrink-0 mt-0.5">×</span>
                  <span>Go all-in on a single high-score stock</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red shrink-0 mt-0.5">×</span>
                  <span>Ignore your own stop-loss rules because the score is still high</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red shrink-0 mt-0.5">×</span>
                  <span>Trade on a single flag without checking the full picture</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red shrink-0 mt-0.5">×</span>
                  <span>Chase a score spike after the price has already moved significantly</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red shrink-0 mt-0.5">×</span>
                  <span>Assume a high score means the stock can&apos;t go down</span>
                </li>
              </ul>
            </Card>

            <Card accent="green">
              <h4 className="font-display font-semibold text-sm text-green mb-2">Always Do</h4>
              <ul className="space-y-2 text-xs text-text-secondary">
                <li className="flex items-start gap-2">
                  <span className="text-green shrink-0 mt-0.5">✓</span>
                  <span>Size positions relative to your total portfolio (2-5% max per idea)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green shrink-0 mt-0.5">✓</span>
                  <span>Set stop-losses before entering any trade</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green shrink-0 mt-0.5">✓</span>
                  <span>Diversify across sectors — don&apos;t let high scores concentrate you</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green shrink-0 mt-0.5">✓</span>
                  <span>Check the Signals page to see which strategies are working <em>right now</em></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green shrink-0 mt-0.5">✓</span>
                  <span>Use multiple confirming signals before taking a trade, not just one dimension</span>
                </li>
              </ul>
            </Card>
          </div>

          <Card>
            <h4 className="font-display font-semibold text-sm mb-3">Position Sizing Framework</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <p className="text-text-tertiary text-[10px] uppercase tracking-wider mb-1">Full Position (4-5%)</p>
                <p className="text-text-secondary">Triple confirmation: high score + rising trend + insider buying. Your highest conviction.</p>
              </div>
              <div>
                <p className="text-text-tertiary text-[10px] uppercase tracking-wider mb-1">Half Position (2-3%)</p>
                <p className="text-text-secondary">Strong score with one or two dimensions confirming. Standard allocation.</p>
              </div>
              <div>
                <p className="text-text-tertiary text-[10px] uppercase tracking-wider mb-1">Starter Position (1%)</p>
                <p className="text-text-secondary">Interesting divergence but waiting for confirmation. Scale up if thesis plays out.</p>
              </div>
            </div>
          </Card>

          <Warning>
            Past signal performance does not guarantee future results. Market regimes change. Always verify that the strategies
            shown on the Signals page are still performing before increasing exposure.
          </Warning>
        </div>
      </Section>

      {/* Quick Reference */}
      <div className="border-t border-border pt-6">
        <h3 className="text-xs font-medium text-text-tertiary mb-3 uppercase tracking-wider">Quick Reference</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div>
            <p className="text-text-tertiary text-[10px] uppercase tracking-wider mb-1">Color Code</p>
            <div className="space-y-1">
              <p><span className="text-green">Green</span> — Bullish</p>
              <p><span className="text-red">Red</span> — Bearish</p>
              <p><span className="text-amber">Amber</span> — Caution</p>
              <p><span className="text-purple">Purple</span> — AI insight</p>
            </div>
          </div>
          <div>
            <p className="text-text-tertiary text-[10px] uppercase tracking-wider mb-1">Fonts</p>
            <div className="space-y-1">
              <p><span className="font-display">Monospace</span> — Data, tickers, numbers</p>
              <p>Sans-serif — Labels, descriptions</p>
            </div>
          </div>
          <div>
            <p className="text-text-tertiary text-[10px] uppercase tracking-wider mb-1">Best Time to Check</p>
            <div className="space-y-1">
              <p>7:30 AM ET — Fresh scores</p>
              <p>Pre-market — Plan your day</p>
              <p>After close — Review movers</p>
            </div>
          </div>
          <div>
            <p className="text-text-tertiary text-[10px] uppercase tracking-wider mb-1">Key Pages</p>
            <div className="space-y-1">
              <p><Link href="/" className="text-green hover:text-green/80">Dashboard</Link> — Morning brief</p>
              <p><Link href="/screener" className="text-green hover:text-green/80">Screener</Link> — Filter stocks</p>
              <p><Link href="/signals" className="text-green hover:text-green/80">Signals</Link> — Track accuracy</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

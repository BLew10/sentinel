'use client';

import { useState, useCallback, useEffect } from 'react';

interface Step {
  title: string;
  content: React.ReactNode;
}

const PLATFORM_STEPS: Step[] = [
  {
    title: 'The Daily Workflow',
    content: (
      <div className="space-y-4">
        <p className="text-text-secondary text-sm leading-relaxed">
          Sentinel works as a <span className="text-text-primary font-medium">funnel</span>: start wide, narrow down, then dig deep.
          Follow this loop every trading day.
        </p>
        <div className="space-y-2">
          {[
            { step: '1', label: 'Dashboard', desc: 'Check divergences and score movers — what changed overnight?', time: '2 min' },
            { step: '2', label: 'Screener', desc: 'Run 1-2 presets that match your strategy, filter the results', time: '5 min' },
            { step: '3', label: 'Stock Detail', desc: 'Deep-dive your top 3-5 candidates — read the action summary, check flags', time: '5 min/stock' },
            { step: '4', label: 'Watchlist', desc: 'Save interesting setups, monitor for score changes over days', time: '1 min' },
          ].map((s) => (
            <div key={s.step} className="flex items-start gap-3 bg-bg-tertiary/50 rounded-lg px-4 py-3">
              <span className="w-6 h-6 rounded-full bg-green-bg border border-green/30 flex items-center justify-center text-green text-xs font-display font-bold shrink-0">
                {s.step}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-text-primary text-sm font-medium">{s.label}</span>
                  <span className="text-text-tertiary text-[10px]">{s.time}</span>
                </div>
                <p className="text-text-secondary text-xs mt-0.5">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: 'Reading the Dashboard',
    content: (
      <div className="space-y-4">
        <p className="text-text-secondary text-sm leading-relaxed">
          The dashboard surfaces what matters most. Focus on these sections in order:
        </p>
        <div className="space-y-3">
          <ExampleCard
            accent="purple"
            title="Early Signals (Divergences)"
            example="AAPL — Insider buying into weakness. Insiders are accumulating while the stock is technically weak."
          >
            This is the highest-value section. Non-price indicators (insider buying, AI conviction) are ahead of the
            chart. Price hasn&apos;t caught up yet. These are your lead indicators.
          </ExampleCard>
          <ExampleCard
            accent="green"
            title="Score Movers"
            example="NVDA +12 today → Something changed — new insider activity, a filing, or technical breakout."
          >
            Stocks whose composite score jumped or dropped significantly in the last day. A +8 or more move
            usually means something material changed.
          </ExampleCard>
          <ExampleCard
            accent="amber"
            title="Recent Activity"
            example="👤 MSFT — CEO Buy · John Smith purchased 50,000 shares ($4.2M)"
          >
            A unified feed of insider trades, SEC filings, and institutional moves across all tracked stocks.
            Filter by category to focus on what matters to your strategy.
          </ExampleCard>
        </div>
      </div>
    ),
  },
  {
    title: 'Using the Screener',
    content: (
      <div className="space-y-4">
        <p className="text-text-secondary text-sm leading-relaxed">
          Use presets as starting points, then customize with filters. Here are the best combos:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-2 text-text-tertiary font-medium">Your Style</th>
                <th className="text-left py-2 px-2 text-text-tertiary font-medium">Preset</th>
                <th className="text-left py-2 px-2 text-text-tertiary font-medium">Then Filter</th>
              </tr>
            </thead>
            <tbody className="text-text-secondary">
              <tr className="border-b border-border/50"><td className="py-2 px-2">Trend following</td><td className="py-2 px-2 font-display">Minervini</td><td className="py-2 px-2">RS rank &gt; 80</td></tr>
              <tr className="border-b border-border/50"><td className="py-2 px-2">Growth</td><td className="py-2 px-2 font-display">Earnings Accel</td><td className="py-2 px-2">Rev QoQ &gt; 10%</td></tr>
              <tr className="border-b border-border/50"><td className="py-2 px-2">Smart money</td><td className="py-2 px-2 font-display">Insider Clusters</td><td className="py-2 px-2">Cap &gt; $1B</td></tr>
              <tr><td className="py-2 px-2">Value + catalyst</td><td className="py-2 px-2 font-display">Top Picks</td><td className="py-2 px-2">Insider &gt; 60</td></tr>
            </tbody>
          </table>
        </div>
        <ExampleCard accent="green" title="Pro Tip" example="">
          After filtering, sort by Sentinel Score descending. The top 5-10 results are your research candidates.
          Check the <span className="font-display">Signal Win Rate</span> column — above 60% with 30+ samples is meaningful.
        </ExampleCard>
      </div>
    ),
  },
  {
    title: 'Reading a Stock Page',
    content: (
      <div className="space-y-4">
        <p className="text-text-secondary text-sm leading-relaxed">
          The stock detail page is structured as a decision funnel. Read top to bottom:
        </p>
        <div className="space-y-2 text-xs">
          {[
            { label: 'Action Summary', desc: 'The verdict and divergence detection. The purple box is the real edge — it shows where non-price signals are ahead.', icon: '⚡' },
            { label: 'Flag Chips', desc: 'Specific conditions like CLUSTER_BUY, GOLDEN_CROSS, ACCELERATING_EARNINGS. Green = bullish, red = warning.', icon: '🏷️' },
            { label: 'Signals Panel', desc: 'Event-driven detections with severity levels. HIGH = act on it. WATCH = monitor. RISK = warning.', icon: '📡' },
            { label: 'Price Chart', desc: 'Candlesticks with event markers. Toggle insider buys (green ▲), sells (red ▼), earnings (amber ●), and SEC filings (purple ■).', icon: '📈' },
            { label: 'Score Radar', desc: 'Shows which dimensions are strong vs weak. Lopsided = momentum play. Balanced = conviction hold.', icon: '🎯' },
            { label: 'Detail Tabs', desc: 'Drill into fundamentals, technicals, and insider trade tables with contextual explanations.', icon: '📋' },
          ].map((s) => (
            <div key={s.label} className="flex items-start gap-2.5 bg-bg-tertiary/50 rounded-lg px-3 py-2.5">
              <span className="text-sm shrink-0">{s.icon}</span>
              <div>
                <span className="text-text-primary font-medium">{s.label}</span>
                <span className="text-text-secondary"> — {s.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: 'The Decision Framework',
    content: (
      <div className="space-y-4">
        <p className="text-text-secondary text-sm leading-relaxed">
          Before acting on any stock, confirm at least <span className="text-text-primary font-medium">3 of these 5 criteria</span>:
        </p>
        <div className="space-y-2">
          {[
            { num: '1', label: 'Score', rule: 'Sentinel score above 65 (top third of universe)' },
            { num: '2', label: 'Trend', rule: 'Price above SMA 50, ideally above SMA 200' },
            { num: '3', label: 'Smart Money', rule: 'Insider score > 55 OR institutional score > 55' },
            { num: '4', label: 'Catalyst', rule: 'Recent flag (earnings acceleration, cluster buy, volume surge)' },
            { num: '5', label: 'Timing', rule: 'Not overbought (RSI < 75), not extended (< 15% above SMA 50)' },
          ].map((c) => (
            <div key={c.num} className="flex items-start gap-3">
              <span className="w-5 h-5 rounded bg-bg-tertiary border border-border flex items-center justify-center text-text-tertiary text-[10px] font-display font-bold shrink-0 mt-0.5">
                {c.num}
              </span>
              <div className="text-sm">
                <span className="text-text-primary font-medium">{c.label}</span>
                <span className="text-text-secondary"> — {c.rule}</span>
              </div>
            </div>
          ))}
        </div>
        <ExampleCard accent="purple" title="Strongest Setup" example="">
          The best setups have a <span className="text-purple font-medium">divergence</span> — where insiders or institutions
          are accumulating but the price hasn&apos;t moved yet. That&apos;s the edge Sentinel is designed to find.
        </ExampleCard>
      </div>
    ),
  },
];

const AGENT_STEPS: Step[] = [
  {
    title: 'Why Use an AI Agent',
    content: (
      <div className="space-y-4">
        <p className="text-text-secondary text-sm leading-relaxed">
          Sentinel gives you structured, scored data. An external AI agent (Claude, ChatGPT, etc.) can synthesize
          it into a thesis — combining numbers with context you can&apos;t easily get from a dashboard.
        </p>
        <div className="space-y-2 text-xs">
          {[
            { icon: '🔍', title: 'Second opinion', desc: 'Agent can spot risks or catalysts you missed by cross-referencing all the data dimensions' },
            { icon: '📝', title: 'Thesis generation', desc: 'Get a structured bull/bear case with specific price levels and catalysts to watch' },
            { icon: '⚖️', title: 'Trade plan', desc: 'Agent can suggest entry, stop-loss, and target levels based on the technical and fundamental data' },
          ].map((item) => (
            <div key={item.title} className="flex items-start gap-2.5 bg-bg-tertiary/50 rounded-lg px-3 py-2.5">
              <span className="text-sm shrink-0">{item.icon}</span>
              <div>
                <span className="text-text-primary font-medium">{item.title}</span>
                <span className="text-text-secondary"> — {item.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: 'Step 1: Copy the Data',
    content: (
      <div className="space-y-4">
        <p className="text-text-secondary text-sm leading-relaxed">
          On any stock detail page, click the <span className="text-text-primary font-medium">Copy AI Prompt</span> button
          in the header. This exports all of Sentinel&apos;s data for that stock as structured text:
        </p>
        <div className="bg-bg-tertiary rounded-lg border border-border p-4 font-mono text-[11px] text-text-secondary space-y-1">
          <p className="text-green">## AAPL — Apple Inc.</p>
          <p>Sentinel Score: 78/100 | Rank: #12</p>
          <p>Technical: 82 | Fundamental: 71 | AI: 80</p>
          <p>Insider: 65 | Institutional: 74 | ...</p>
          <p className="text-text-tertiary">---</p>
          <p>## Active Flags</p>
          <p>- [TECHNICAL] STAGE2_UPTREND</p>
          <p>- [INSIDER] CLUSTER_BUY</p>
          <p className="text-text-tertiary">---</p>
          <p>## Recent Insider Trades (last 20)</p>
          <p>## Price Data (last 60 trading days)</p>
          <p className="text-text-tertiary italic">...full dataset included...</p>
        </div>
        <p className="text-text-tertiary text-xs">
          The prompt includes scores, flags, signals, insider trades, technicals, fundamentals, and 60 days of price data.
        </p>
      </div>
    ),
  },
  {
    title: 'Step 2: Paste Into Your Agent',
    content: (
      <div className="space-y-4">
        <p className="text-text-secondary text-sm leading-relaxed">
          Open Claude, ChatGPT, or any AI assistant. Paste the copied data and add your question. Here are effective prompts:
        </p>
        <div className="space-y-3">
          <PromptExample
            label="Quick Thesis"
            prompt="Based on this data, give me a 3-sentence bull case and bear case. What's the one thing I should watch this week?"
          />
          <PromptExample
            label="Trade Plan"
            prompt="Create a trade plan for this stock: entry zone, stop-loss level, first target, and position sizing for a $50K portfolio. Use the technical data."
          />
          <PromptExample
            label="Risk Check"
            prompt="What are the top 3 risks I'm not seeing? Focus on the insider selling pattern, debt levels, and any divergences between the scores."
          />
          <PromptExample
            label="Sector Context"
            prompt="How does this stock compare to its sector peers based on the fundamental data? Is it cheap or expensive relative to its growth?"
          />
        </div>
      </div>
    ),
  },
  {
    title: 'Step 3: Cross-Reference',
    content: (
      <div className="space-y-4">
        <p className="text-text-secondary text-sm leading-relaxed">
          The agent&apos;s response should complement Sentinel&apos;s data, not replace your judgment. Here&apos;s how to use both together:
        </p>
        <div className="space-y-3">
          <ExampleCard accent="green" title="Agent agrees with Sentinel" example="Sentinel: Score 82, CLUSTER_BUY flag → Agent: 'Strong buy thesis, insider activity confirms...'">
            High conviction. Multiple independent signals align. This is when you size up.
          </ExampleCard>
          <ExampleCard accent="amber" title="Agent disagrees with Sentinel" example="Sentinel: Score 75 → Agent: 'Concerning debt maturity schedule in 2026, watch for refinancing risk...'">
            Dig deeper. The agent may see context Sentinel can&apos;t score (macro, narrative, upcoming events).
            Lower your conviction or tighten your stop.
          </ExampleCard>
          <ExampleCard accent="red" title="Agent finds a red flag" example="Agent: 'The insider buying is all Form 4 stock option exercises, not open market purchases...'"  >
            This is the value of a second opinion. Not all insider &quot;buys&quot; are equal.
            Re-examine the insider trades tab on the stock page.
          </ExampleCard>
        </div>
      </div>
    ),
  },
  {
    title: 'Advanced: Batch Analysis',
    content: (
      <div className="space-y-4">
        <p className="text-text-secondary text-sm leading-relaxed">
          For power users: copy multiple stock prompts and paste them together for comparative analysis.
        </p>
        <PromptExample
          label="Comparative"
          prompt="Here are 3 stocks I'm considering. Rank them by risk-adjusted upside. Which one would you put the most capital into and why? [paste AAPL data] [paste NVDA data] [paste MSFT data]"
        />
        <PromptExample
          label="Portfolio Fit"
          prompt="I already hold NVDA, AMZN, and META. Based on this new stock's data, does it add diversification or am I doubling down on the same risk factors?"
        />
        <ExampleCard accent="green" title="Workflow Summary" example="">
          <span className="font-display">Screener → Top candidates → Copy AI Prompt → Agent analysis → Decision</span>
          <br />
          <span className="text-text-tertiary text-[11px] mt-1 block">
            Use Sentinel for what it&apos;s best at (scoring and screening) and the agent for what it&apos;s best at (synthesis and reasoning).
          </span>
        </ExampleCard>
      </div>
    ),
  },
];

function ExampleCard({ accent, title, example, children }: {
  accent: 'green' | 'purple' | 'amber' | 'red' | 'cyan';
  title: string;
  example: string;
  children: React.ReactNode;
}) {
  const borderMap = { green: 'border-green/20', purple: 'border-purple/20', amber: 'border-amber/20', red: 'border-red/20', cyan: 'border-cyan/20' };
  const bgMap = { green: 'bg-green-bg', purple: 'bg-purple-bg', amber: 'bg-amber-bg', red: 'bg-red-bg', cyan: 'bg-cyan-bg' };
  const textMap = { green: 'text-green', purple: 'text-purple', amber: 'text-amber', red: 'text-red', cyan: 'text-cyan' };

  return (
    <div className={`rounded-lg border ${borderMap[accent]} ${bgMap[accent]} p-4`}>
      <p className={`${textMap[accent]} text-xs font-medium mb-1`}>{title}</p>
      {example && <p className="text-text-secondary text-[11px] italic mb-2">{example}</p>}
      <p className="text-text-secondary text-xs leading-relaxed">{children}</p>
    </div>
  );
}

function PromptExample({ label, prompt }: { label: string; prompt: string }) {
  return (
    <div className="bg-bg-tertiary rounded-lg border border-border px-4 py-3">
      <p className="text-text-tertiary text-[10px] uppercase tracking-wider mb-1">{label}</p>
      <p className="text-text-secondary text-xs italic leading-relaxed">&quot;{prompt}&quot;</p>
    </div>
  );
}

type ModalTab = 'platform' | 'agent';

export function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<ModalTab>('platform');
  const [stepIndex, setStepIndex] = useState(0);

  const steps = tab === 'platform' ? PLATFORM_STEPS : AGENT_STEPS;
  const step = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  const handleTabChange = useCallback((t: ModalTab) => {
    setTab(t);
    setStepIndex(0);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && !isLast) setStepIndex((i) => i + 1);
      if (e.key === 'ArrowLeft' && !isFirst) setStepIndex((i) => i - 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose, isFirst, isLast]);

  useEffect(() => {
    setStepIndex(0);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-bg-primary border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-display font-bold">Getting Started</h2>
            <div className="flex bg-bg-secondary rounded-lg border border-border p-0.5">
              <button
                onClick={() => handleTabChange('platform')}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors cursor-pointer ${
                  tab === 'platform' ? 'bg-bg-tertiary text-text-primary font-medium' : 'text-text-tertiary hover:text-text-secondary'
                }`}
              >
                Using Sentinel
              </button>
              <button
                onClick={() => handleTabChange('agent')}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors cursor-pointer ${
                  tab === 'agent' ? 'bg-bg-tertiary text-text-primary font-medium' : 'text-text-tertiary hover:text-text-secondary'
                }`}
              >
                AI Agent Guide
              </button>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary text-xl transition-colors cursor-pointer w-8 h-8 flex items-center justify-center"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1.5 px-6 pt-4 shrink-0">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => setStepIndex(i)}
              className={`h-1.5 rounded-full transition-all cursor-pointer ${
                i === stepIndex ? 'bg-green w-8' : i < stepIndex ? 'bg-green/40 w-4' : 'bg-border w-4'
              }`}
              aria-label={`Step ${i + 1}`}
            />
          ))}
          <span className="ml-auto text-text-tertiary text-[10px] font-display">
            {stepIndex + 1} / {steps.length}
          </span>
        </div>

        {/* Step title */}
        <div className="px-6 pt-3 pb-1 shrink-0">
          <h3 className="text-base font-display font-semibold text-text-primary">{step.title}</h3>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {step.content}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0">
          <button
            onClick={() => setStepIndex((i) => i - 1)}
            disabled={isFirst}
            className={`px-4 py-2 text-sm rounded-lg border transition-colors cursor-pointer ${
              isFirst
                ? 'border-border text-text-tertiary cursor-not-allowed opacity-40'
                : 'border-border text-text-secondary hover:text-text-primary hover:border-border/80'
            }`}
          >
            Back
          </button>

          <div className="flex items-center gap-2">
            {isLast && tab === 'platform' && (
              <button
                onClick={() => handleTabChange('agent')}
                className="px-4 py-2 text-sm rounded-lg border border-purple/30 bg-purple-bg text-purple hover:border-purple/50 transition-colors cursor-pointer"
              >
                AI Agent Guide &rarr;
              </button>
            )}
            {isLast ? (
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm rounded-lg bg-green text-bg-primary font-medium hover:bg-green/90 transition-colors cursor-pointer"
              >
                Done
              </button>
            ) : (
              <button
                onClick={() => setStepIndex((i) => i + 1)}
                className="px-4 py-2 text-sm rounded-lg bg-green text-bg-primary font-medium hover:bg-green/90 transition-colors cursor-pointer"
              >
                Next &rarr;
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

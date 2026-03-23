import { headers } from 'next/headers';
import { CopyBriefingButton, CopyPromptButton } from './CopyButtons';

export const dynamic = 'force-dynamic';

async function fetchBriefing(host: string): Promise<string> {
  const token = process.env.BRIEFING_TOKEN;
  if (!token) return 'Error: BRIEFING_TOKEN not set in environment variables.';

  const protocol = host.includes('localhost') ? 'http' : 'https';
  const url = `${protocol}://${host}/api/briefing?token=${encodeURIComponent(token)}`;

  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return `Error: ${res.status} ${res.statusText}`;
    return await res.text();
  } catch {
    return 'Error: Could not fetch briefing data.';
  }
}

export default async function BriefingPage() {
  const headersList = await headers();
  const host = headersList.get('host') ?? 'localhost:3000';
  const briefing = await fetchBriefing(host);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Daily Briefing</h1>
          <p className="text-text-secondary text-sm mt-1">
            Copy this into Claude, ChatGPT, or any LLM for actionable trade analysis
          </p>
        </div>
        <CopyBriefingButton />
      </div>

      <div className="bg-bg-secondary border border-border rounded-lg p-6">
        <pre
          id="briefing-content"
          className="whitespace-pre-wrap font-mono text-sm text-text-primary leading-relaxed overflow-x-auto"
        >
          {briefing}
        </pre>
      </div>

      <div className="bg-bg-secondary border border-purple/20 rounded-lg p-6">
        <h2 className="text-sm font-display font-semibold text-purple mb-3">Suggested Claude Prompt</h2>
        <pre
          id="prompt-content"
          className="whitespace-pre-wrap font-mono text-xs text-text-secondary leading-relaxed"
        >{CLAUDE_PROMPT}</pre>
        <div className="mt-3">
          <CopyPromptButton />
        </div>
      </div>

      <div className="bg-bg-secondary border border-border/50 rounded-lg p-6">
        <h2 className="text-sm font-display font-semibold text-text-secondary mb-3">Alternative: Use with Claude Projects</h2>
        <ol className="list-decimal list-inside space-y-2 text-text-tertiary text-xs">
          <li>Go to <a href="https://claude.ai" target="_blank" rel="noopener noreferrer" className="text-purple underline">claude.ai</a> and create a new Project called &quot;Sentinel Trading&quot;</li>
          <li>Upload <code className="text-purple">docs/DAILY-PLAYBOOK.md</code> as project knowledge (one-time setup)</li>
          <li>Each morning: visit this page, copy the briefing, paste into the project chat</li>
          <li>Add the prompt below — Claude has the playbook context and will analyze accordingly</li>
        </ol>
      </div>
    </div>
  );
}

const CLAUDE_PROMPT = `You are my trading analyst. I've pasted today's Sentinel platform briefing data below.

Using the data, give me:

1. **Today's Top 3 Plays** — The 3 best risk/reward setups from the active setups and divergences. For each:
   - Ticker and setup type
   - Why this is actionable NOW (not just interesting)
   - Specific entry trigger to watch for
   - Where to set a stop loss
   - Realistic profit target and timeframe
   - Conviction level (low/medium/high) and why

2. **What to Avoid** — Any stocks that look like traps (confirmatory signals only, move already done, poor risk/reward)

3. **Market Context Read** — Based on SPY, setup counts, and signal performance data:
   - Is the current market favoring any particular strategy type?
   - Should I be aggressive or cautious today?

4. **Watchlist Additions** — 2-3 stocks not yet actionable but worth monitoring, with the specific trigger that would make them actionable

Rules:
- Prioritize PREDICTIVE signals over confirmatory ones
- Higher conviction setups (3+ dots) are stronger
- Divergences (where non-price indicators disagree with the chart) represent the highest edge
- Consider which signal types have been profitable recently (Signal Performance table)
- Be specific — "buy on a pullback" is useless, "buy if price holds above $X on a retest of the 50-day SMA" is actionable`;


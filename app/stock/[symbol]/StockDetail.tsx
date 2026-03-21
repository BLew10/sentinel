'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ScoreBadge } from '@/components/ui/ScoreBadge';
import { FlagChip } from '@/components/ui/FlagChip';
import { PriceChart } from './PriceChart';
import { ScoreRadar } from './ScoreRadar';
import { formatCurrency, formatPercent, formatMarketCap, generateActionSummary, scoreVerdict, verdictColor, verdictBgColor } from '@/lib/utils/format';
import { SignalsPanel } from './SignalsPanel';
import type { TechnicalFlag } from '@/lib/analyzers/technical';
import type { FundamentalFlag } from '@/lib/analyzers/fundamental';
import type { Fundamentals, TechnicalSignals, SentinelScore, InsiderTrade, InsiderFlag, DetectedSignal } from '@/lib/utils/types';

interface PriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Props {
  stock: { symbol: string; name: string; sector: string | null; market_cap: number | null; exchange: string | null };
  prices: PriceBar[];
  fundamentals: Fundamentals | null;
  technicals: TechnicalSignals | null;
  scores: SentinelScore | null;
  insiderTrades: InsiderTrade[];
  technicalFlags: TechnicalFlag[];
  fundamentalFlags: FundamentalFlag[];
  insiderFlags: InsiderFlag[];
  signals: DetectedSignal[];
  latestPrice: PriceBar | null;
  priceChange: { absolute: number; percent: number } | null;
}

const TABS = ['Overview', 'Fundamentals', 'Technicals', 'Insider Activity'] as const;
type Tab = (typeof TABS)[number];

function MetricCard({ label, value, sub, context }: { label: string; value: string; sub?: string; context?: string }) {
  return (
    <div className="bg-bg-secondary rounded-lg border border-border p-4">
      <p className="text-text-tertiary text-xs uppercase tracking-wider">{label}</p>
      <p className="text-lg font-display font-bold mt-1">{value}</p>
      {sub && <p className="text-text-tertiary text-xs mt-0.5">{sub}</p>}
      {context && <p className="text-text-tertiary/70 text-[10px] mt-1.5 leading-relaxed italic">{context}</p>}
    </div>
  );
}

function ActionSummary({
  scores, technicals, fundamentals, technicalFlags, fundamentalFlags,
}: {
  scores: SentinelScore | null;
  technicals: TechnicalSignals | null;
  fundamentals: Fundamentals | null;
  technicalFlags: TechnicalFlag[];
  fundamentalFlags: FundamentalFlag[];
}) {
  const action = generateActionSummary(
    scores as Parameters<typeof generateActionSummary>[0],
    technicals as Parameters<typeof generateActionSummary>[1],
    fundamentals as Parameters<typeof generateActionSummary>[2],
    technicalFlags,
    fundamentalFlags,
  );

  const iconMap: Record<string, string> = {
    'Strong Buy': '▲',
    'Bullish': '▲',
    'Neutral': '◆',
    'Caution': '▼',
    'Bearish': '▼',
  };

  const hasDivergences = action.divergences.length > 0;

  return (
    <div className="space-y-3">
      {/* Divergence banner — the real edge */}
      {hasDivergences && (
        <div className="rounded-lg border border-purple/30 bg-purple-bg p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-purple text-base">⚡</span>
            <span className="font-display font-bold text-purple">Leading Indicators Detected</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple/10 border border-purple/20 text-purple font-medium ml-auto">
              {action.divergences.filter(d => d.strength === 'high').length > 0 ? 'HIGH CONVICTION' : 'WATCH'}
            </span>
          </div>
          <p className="text-text-secondary text-sm mb-3">
            Non-price signals are ahead of the chart — this is where the edge lives
          </p>
          <div className="space-y-2">
            {action.divergences.map((div) => (
              <div key={div.type} className="flex items-start gap-2">
                <span className={`shrink-0 mt-1 w-1.5 h-1.5 rounded-full ${div.strength === 'high' ? 'bg-purple' : 'bg-purple/50'}`} />
                <div>
                  <span className="text-purple text-xs font-medium">{div.label}</span>
                  <p className="text-text-secondary text-xs leading-relaxed">{div.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Standard verdict summary */}
      <div className={`rounded-lg border p-5 ${verdictBgColor(action.verdict)}`}>
        <div className="flex items-center gap-3 mb-2">
          <span className={`text-lg ${verdictColor(action.verdict)}`}>{iconMap[action.verdict]}</span>
          <span className={`font-display font-bold text-lg ${verdictColor(action.verdict)}`}>{action.verdict}</span>
          {scores?.percentile != null && (
            <span className="text-text-tertiary text-xs ml-auto">Top {scores.percentile}% of all stocks</span>
          )}
        </div>
        <p className="text-text-secondary text-sm mb-3">{action.headline}</p>
        {action.bullets.length > 0 && (
          <ul className="space-y-1.5">
            {action.bullets.map((bullet, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                <span className="text-text-tertiary mt-0.5 shrink-0">•</span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function n(val: unknown): number | null {
  if (val == null) return null;
  return Number(val);
}

function fmt(val: unknown, decimals = 2): string {
  if (val == null) return '—';
  return Number(val).toFixed(decimals);
}

function fmtPct(val: unknown): string {
  if (val == null) return '—';
  return formatPercent(Number(val));
}

function buildAgentPrompt(
  stock: Props['stock'],
  prices: PriceBar[],
  fundamentals: Fundamentals | null,
  technicals: TechnicalSignals | null,
  scores: SentinelScore | null,
  insiderTrades: InsiderTrade[],
  technicalFlags: TechnicalFlag[],
  fundamentalFlags: FundamentalFlag[],
  insiderFlags: InsiderFlag[],
  signals: DetectedSignal[],
  latestPrice: PriceBar | null,
): string {
  const lines: string[] = [];
  const today = new Date().toISOString().split('T')[0];

  lines.push(`# ${stock.symbol} — ${stock.name}`);
  lines.push(`Data as of: ${today}`);
  lines.push(`Sector: ${stock.sector ?? 'Unknown'} | Market Cap: ${stock.market_cap ? formatMarketCap(stock.market_cap) : 'N/A'} | Exchange: ${stock.exchange ?? 'N/A'}`);
  if (latestPrice) {
    lines.push(`Last Close: $${latestPrice.close.toFixed(2)} (${latestPrice.date})`);
  }
  lines.push('');

  if (scores) {
    lines.push('## Sentinel Scores');
    lines.push(`Composite: ${scores.sentinel_score ?? 'N/A'}/100 | Rank: #${scores.rank ?? 'N/A'} (top ${scores.percentile ?? 'N/A'}%)`);
    lines.push(`Technical: ${scores.technical_score ?? 'N/A'} | Fundamental: ${scores.fundamental_score ?? 'N/A'} | AI Analysis: ${scores.earnings_ai_score ?? 'N/A'}`);
    lines.push(`Insider: ${scores.insider_score ?? 'N/A'} | Institutional: ${scores.institutional_score ?? 'N/A'} | Sentiment: ${scores.news_sentiment_score ?? 'N/A'} | Options Flow: ${scores.options_flow_score ?? 'N/A'}`);
    if (scores.score_change_1d != null) lines.push(`Score change (1d): ${scores.score_change_1d > 0 ? '+' : ''}${scores.score_change_1d}`);
    if (scores.score_change_7d != null) lines.push(`Score change (7d): ${scores.score_change_7d > 0 ? '+' : ''}${scores.score_change_7d}`);
    lines.push('');
  }

  if (technicalFlags.length > 0 || fundamentalFlags.length > 0 || insiderFlags.length > 0) {
    lines.push('## Active Flags');
    for (const f of technicalFlags) lines.push(`- [TECHNICAL] ${f}`);
    for (const f of fundamentalFlags) lines.push(`- [FUNDAMENTAL] ${f}`);
    for (const f of insiderFlags) lines.push(`- [INSIDER] ${f}`);
    lines.push('');
  }

  if (signals.length > 0) {
    lines.push('## Detected Signals');
    for (const s of signals) {
      lines.push(`- ${s.icon} [${s.severity}] ${s.label} — ${s.description} (${s.date})`);
    }
    lines.push('');
  }

  if (technicals) {
    lines.push('## Technical Indicators');
    lines.push('### Moving Averages');
    lines.push(`SMA 20: ${fmt(technicals.sma_20)} | SMA 50: ${fmt(technicals.sma_50)} | SMA 150: ${fmt(technicals.sma_150)} | SMA 200: ${fmt(technicals.sma_200)}`);
    lines.push(`EMA 10: ${fmt(technicals.ema_10)} | EMA 21: ${fmt(technicals.ema_21)}`);
    lines.push('### Momentum');
    lines.push(`RSI (14): ${fmt(technicals.rsi_14, 1)} | MACD: ${fmt(technicals.macd, 4)} | MACD Signal: ${fmt(technicals.macd_signal, 4)} | Histogram: ${fmt(technicals.macd_histogram, 4)}`);
    lines.push(`ATR (14): ${fmt(technicals.atr_14)} | ATR %: ${fmtPct(technicals.atr_pct)}`);
    lines.push('### Relative Strength');
    lines.push(`Price vs SMA50: ${fmtPct(technicals.price_vs_sma50)} | vs SMA200: ${fmtPct(technicals.price_vs_sma200)}`);
    lines.push(`From 52W High: ${fmtPct(technicals.pct_from_52w_high)} | From 52W Low: ${fmtPct(technicals.pct_from_52w_low)}`);
    lines.push(`RS Rank 3M: ${technicals.rs_rank_3m ?? 'N/A'} | 6M: ${technicals.rs_rank_6m ?? 'N/A'} | 12M: ${technicals.rs_rank_12m ?? 'N/A'}`);
    lines.push(`Volume Ratio (vs 50d avg): ${fmt(technicals.volume_ratio_50d)}`);
    lines.push('');
  }

  if (fundamentals) {
    lines.push('## Fundamentals');
    lines.push('### Valuation');
    lines.push(`PE: ${fmt(fundamentals.pe_ratio, 1)} | Forward PE: ${fmt(fundamentals.forward_pe, 1)} | PEG: ${fmt(fundamentals.peg_ratio)} | P/S: ${fmt(fundamentals.ps_ratio)} | P/B: ${fmt(fundamentals.pb_ratio)}`);
    lines.push('### Growth');
    lines.push(`Revenue YoY: ${fmtPct(fundamentals.revenue_growth_yoy)} | Earnings YoY: ${fmtPct(fundamentals.earnings_growth_yoy)}`);
    lines.push(`Revenue QoQ: ${fmtPct(fundamentals.revenue_growth_qoq)} | Earnings QoQ: ${fmtPct(fundamentals.earnings_growth_qoq)}`);
    lines.push('### Profitability & Health');
    lines.push(`Gross Margin: ${fmtPct(fundamentals.gross_margin)} | Operating Margin: ${fmtPct(fundamentals.operating_margin)} | Net Margin: ${fmtPct(fundamentals.net_margin)}`);
    lines.push(`ROE: ${fmtPct(fundamentals.roe)} | ROA: ${fmtPct(fundamentals.roa)} | Debt/Equity: ${fmt(fundamentals.debt_to_equity)} | Current Ratio: ${fmt(fundamentals.current_ratio)}`);
    if (fundamentals.free_cash_flow != null) lines.push(`Free Cash Flow: $${Number(fundamentals.free_cash_flow).toLocaleString()}`);
    if (fundamentals.dividend_yield != null) lines.push(`Dividend Yield: ${fmtPct(fundamentals.dividend_yield)}`);
    lines.push('');
  }

  if (insiderTrades.length > 0) {
    lines.push('## Recent Insider Trades (last 20)');
    lines.push('Date | Insider | Title | Type | Shares | Price | Value');
    lines.push('---|---|---|---|---|---|---');
    for (const t of insiderTrades) {
      lines.push(
        `${t.transaction_date} | ${t.insider_name} | ${t.insider_title ?? '—'} | ${t.transaction_type} | ${t.shares.toLocaleString()} | ${t.price_per_share != null ? '$' + t.price_per_share.toFixed(2) : '—'} | ${t.transaction_value != null ? '$' + t.transaction_value.toLocaleString() : '—'}`
      );
    }
    lines.push('');
  }

  // Recent price data: last 60 trading days as CSV for chart context
  const recentPrices = prices.slice(-60);
  if (recentPrices.length > 0) {
    lines.push('## Price Data (last 60 trading days)');
    lines.push('Date,Open,High,Low,Close,Volume');
    for (const p of recentPrices) {
      lines.push(`${p.date},${p.open.toFixed(2)},${p.high.toFixed(2)},${p.low.toFixed(2)},${p.close.toFixed(2)},${p.volume}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('Analyze this stock using the data above. Consider the technical setup, fundamental quality, insider activity, and score composition. Identify the key thesis (bull and bear case), any divergences between indicators, and what you would watch for as a catalyst or risk.');

  return lines.join('\n');
}

function CopyPromptButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = getText();
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
        copied
          ? 'border-green/40 bg-green-bg text-green'
          : 'border-border bg-bg-secondary text-text-secondary hover:text-text-primary hover:border-border/80'
      }`}
      title="Copy all data for this stock as a structured prompt you can paste into an AI agent"
    >
      {copied ? 'Copied!' : 'Copy AI Prompt'}
    </button>
  );
}

export function StockDetail({
  stock, prices, fundamentals, technicals, scores,
  insiderTrades, technicalFlags, fundamentalFlags, insiderFlags, signals,
  latestPrice, priceChange,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('Overview');

  const allFlags = [...technicalFlags, ...fundamentalFlags, ...insiderFlags];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Back link */}
      <Link href="/screener" className="text-text-tertiary text-sm hover:text-text-secondary transition-colors">
        ← Back to Screener
      </Link>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-display font-bold">{stock.symbol}</h1>
            {stock.exchange && (
              <span className="text-text-tertiary text-xs border border-border rounded px-2 py-0.5">{stock.exchange}</span>
            )}
          </div>
          <p className="text-text-secondary mt-1">{stock.name}</p>
          <div className="flex items-center gap-3 mt-2">
            {stock.sector && <span className="text-text-tertiary text-xs">{stock.sector}</span>}
            {stock.market_cap && <span className="text-text-tertiary text-xs">· {formatMarketCap(stock.market_cap)}</span>}
          </div>
        </div>

        <div className="flex items-center gap-6">
          {latestPrice && (
            <div className="text-right">
              <p className="text-2xl font-display font-bold">{formatCurrency(latestPrice.close)}</p>
              {priceChange && (
                <p className={`text-sm font-display ${priceChange.percent >= 0 ? 'text-green' : 'text-red'}`}>
                  {priceChange.absolute >= 0 ? '+' : ''}{priceChange.absolute.toFixed(2)} ({formatPercent(priceChange.percent)})
                </p>
              )}
            </div>
          )}
          <CopyPromptButton
            getText={() => buildAgentPrompt(stock, prices, fundamentals, technicals, scores, insiderTrades, technicalFlags, fundamentalFlags, insiderFlags, signals, latestPrice)}
          />
          <ScoreBadge score={n(scores?.sentinel_score)} size="lg" />
        </div>
      </div>

      {/* Score component badges */}
      {scores && (
        <div className="flex flex-wrap items-center gap-3">
          {([
            ['Technical', scores.technical_score, 'Price trend, momentum & relative strength'],
            ['Fundamental', scores.fundamental_score, 'Valuation, growth & financial health'],
            ['Earnings AI', scores.earnings_ai_score, 'AI analysis of the full data profile'],
            ['Insider', scores.insider_score, 'Insider buying/selling patterns'],
            ['Institutional', scores.institutional_score, 'Hedge fund & institutional flows'],
            ['Sentiment', scores.news_sentiment_score, 'News & market sentiment'],
            ['Flow', scores.options_flow_score, 'Options flow signals'],
          ] as const).map(([label, val, tip]) => (
            <div key={label} className="flex items-center gap-1.5" title={tip}>
              <span className="text-text-tertiary text-xs cursor-help border-b border-dotted border-text-tertiary/30">{label}</span>
              <ScoreBadge score={val} size="sm" />
            </div>
          ))}
          {scores.rank != null && (
            <span className="text-text-tertiary text-xs ml-2">
              Rank #{scores.rank} · Top {scores.percentile}%
            </span>
          )}
        </div>
      )}

      {/* Flags */}
      {allFlags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allFlags.map((flag) => (
            <FlagChip key={flag} flag={flag} />
          ))}
        </div>
      )}

      {/* Action Summary */}
      <ActionSummary
        scores={scores}
        technicals={technicals}
        fundamentals={fundamentals}
        technicalFlags={technicalFlags}
        fundamentalFlags={fundamentalFlags}
      />

      {/* Detected Signals */}
      <SignalsPanel signals={signals} />

      {/* Price Chart + Score Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-bg-secondary rounded-lg border border-border p-4">
          <h3 className="text-sm font-medium text-text-secondary mb-3">Price History</h3>
          <PriceChart prices={prices} sma50={n(technicals?.sma_50)} sma200={n(technicals?.sma_200)} />
        </div>
        <div className="bg-bg-secondary rounded-lg border border-border p-4">
          <h3 className="text-sm font-medium text-text-secondary mb-3">Score Breakdown</h3>
          <ScoreRadar scores={scores} />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-0">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-green text-green'
                  : 'border-transparent text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="min-h-[300px]">
        {activeTab === 'Overview' && (
          <OverviewTab fundamentals={fundamentals} technicals={technicals} />
        )}
        {activeTab === 'Fundamentals' && (
          <FundamentalsTab fundamentals={fundamentals} flags={fundamentalFlags} />
        )}
        {activeTab === 'Technicals' && (
          <TechnicalsTab technicals={technicals} flags={technicalFlags} />
        )}
        {activeTab === 'Insider Activity' && (
          <InsiderTab trades={insiderTrades} />
        )}
      </div>
    </div>
  );
}

function OverviewTab({ fundamentals, technicals }: { fundamentals: Fundamentals | null; technicals: TechnicalSignals | null }) {
  const pe = fundamentals?.pe_ratio != null ? Number(fundamentals.pe_ratio) : null;
  const peg = fundamentals?.peg_ratio != null ? Number(fundamentals.peg_ratio) : null;
  const revG = fundamentals?.revenue_growth_yoy != null ? Number(fundamentals.revenue_growth_yoy) : null;
  const earnG = fundamentals?.earnings_growth_yoy != null ? Number(fundamentals.earnings_growth_yoy) : null;
  const rsi = technicals?.rsi_14 != null ? Number(technicals.rsi_14) : null;
  const vsSma50 = technicals?.price_vs_sma50 != null ? Number(technicals.price_vs_sma50) : null;
  const vsSma200 = technicals?.price_vs_sma200 != null ? Number(technicals.price_vs_sma200) : null;
  const volRatio = technicals?.volume_ratio_50d != null ? Number(technicals.volume_ratio_50d) : null;
  const gm = fundamentals?.gross_margin != null ? Number(fundamentals.gross_margin) : null;
  const nm = fundamentals?.net_margin != null ? Number(fundamentals.net_margin) : null;
  const roe = fundamentals?.roe != null ? Number(fundamentals.roe) : null;
  const de = fundamentals?.debt_to_equity != null ? Number(fundamentals.debt_to_equity) : null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <MetricCard label="PE Ratio" value={fmt(pe, 1)} context={peContext(pe)} />
      <MetricCard label="PEG Ratio" value={fmt(peg, 2)} context={peg != null ? (peg < 1 ? 'Under 1.0 = potentially undervalued for its growth' : peg > 2 ? 'Above 2.0 = pricey relative to growth rate' : 'Fair value relative to growth') : undefined} />
      <MetricCard label="Rev Growth YoY" value={fmtPct(revG)} context={revG != null ? (revG > 0.25 ? 'High growth — 25%+ is exceptional' : revG > 0 ? 'Positive growth' : 'Revenue is declining') : undefined} />
      <MetricCard label="Earn Growth YoY" value={fmtPct(earnG)} context={earnG != null ? (earnG > 0.25 ? 'Earnings accelerating strongly' : earnG > 0 ? 'Earnings growing' : 'Earnings declining — watch cash flow') : undefined} />
      <MetricCard label="RSI (14)" value={fmt(rsi, 1)} sub={rsiLabel(rsi)} context="Momentum oscillator (0-100). Below 30 = oversold. Above 70 = overbought." />
      <MetricCard label="vs SMA 50" value={fmtPct(vsSma50)} context={vsSma50 != null ? (vsSma50 > 0 ? 'Trading above 50-day trend — bullish positioning' : 'Below 50-day trend — caution') : 'Distance from 50-day moving average'} />
      <MetricCard label="vs SMA 200" value={fmtPct(vsSma200)} context={vsSma200 != null ? (vsSma200 > 0 ? 'Above long-term trend — institutional support likely' : 'Below long-term trend — many funds exit here') : 'Distance from 200-day moving average'} />
      <MetricCard label="Volume Ratio" value={fmt(volRatio, 2)} sub="vs 50-day avg" context={volRatio != null ? (volRatio >= 2 ? 'Unusual activity — 2x+ signals institutional interest' : volRatio >= 1.3 ? 'Slightly above average' : 'Normal volume') : undefined} />
      <MetricCard label="Gross Margin" value={fmtPct(gm)} context={gm != null ? (gm > 0.5 ? 'Above 50% — strong pricing power' : gm > 0.3 ? 'Healthy margin' : 'Thin margins — commodity-like business') : undefined} />
      <MetricCard label="Net Margin" value={fmtPct(nm)} context={nm != null ? (nm > 0.2 ? 'Highly profitable — 20%+ is excellent' : nm > 0 ? 'Profitable' : 'Unprofitable — burning cash') : undefined} />
      <MetricCard label="ROE" value={fmtPct(roe)} context={roe != null ? (roe > 0.25 ? 'Exceptional — efficient capital deployment' : roe > 0.1 ? 'Solid returns on equity' : 'Low returns — capital-inefficient') : 'Return on Equity — how efficiently the company uses shareholder capital'} />
      <MetricCard label="Debt/Equity" value={fmt(de, 2)} context={de != null ? (de > 2.5 ? 'Highly leveraged — risk if rates rise or revenue drops' : de > 1 ? 'Moderate leverage' : 'Conservative balance sheet') : undefined} />
    </div>
  );
}

function peContext(pe: number | null): string | undefined {
  if (pe == null) return undefined;
  if (pe < 0) return 'Negative PE = currently unprofitable';
  if (pe < 12) return 'Low valuation — deep value territory. Verify it\'s not a value trap.';
  if (pe < 20) return 'Reasonable valuation for a mature company';
  if (pe < 35) return 'Growth premium — earnings growth should justify the price';
  return 'Expensive — high expectations baked in';
}

function rsiLabel(rsi: number | null): string {
  if (rsi == null) return '';
  if (rsi < 30) return 'Oversold';
  if (rsi > 70) return 'Overbought';
  if (rsi > 50) return 'Bullish momentum';
  return 'Bearish momentum';
}

function FundamentalsTab({ fundamentals, flags }: { fundamentals: Fundamentals | null; flags: FundamentalFlag[] }) {
  if (!fundamentals) return <p className="text-text-tertiary">No fundamental data available.</p>;

  return (
    <div className="space-y-4">
      {flags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {flags.map((f) => <FlagChip key={f} flag={f} />)}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-3">
          <h4 className="text-xs text-text-tertiary uppercase tracking-wider font-medium">Valuation</h4>
          <Row label="PE Ratio" value={fmt(fundamentals.pe_ratio, 1)} />
          <Row label="Forward PE" value={fmt(fundamentals.forward_pe, 1)} />
          <Row label="PEG Ratio" value={fmt(fundamentals.peg_ratio, 2)} />
          <Row label="P/S Ratio" value={fmt(fundamentals.ps_ratio, 2)} />
          <Row label="P/B Ratio" value={fmt(fundamentals.pb_ratio, 2)} />
        </div>
        <div className="space-y-3">
          <h4 className="text-xs text-text-tertiary uppercase tracking-wider font-medium">Growth</h4>
          <Row label="Revenue YoY" value={fmtPct(fundamentals.revenue_growth_yoy)} />
          <Row label="Earnings YoY" value={fmtPct(fundamentals.earnings_growth_yoy)} />
          <Row label="Revenue QoQ" value={fmtPct(fundamentals.revenue_growth_qoq)} />
          <Row label="Earnings QoQ" value={fmtPct(fundamentals.earnings_growth_qoq)} />
        </div>
        <div className="space-y-3">
          <h4 className="text-xs text-text-tertiary uppercase tracking-wider font-medium">Profitability</h4>
          <Row label="Gross Margin" value={fmtPct(fundamentals.gross_margin)} />
          <Row label="Operating Margin" value={fmtPct(fundamentals.operating_margin)} />
          <Row label="Net Margin" value={fmtPct(fundamentals.net_margin)} />
          <Row label="ROE" value={fmtPct(fundamentals.roe)} />
          <Row label="ROA" value={fmtPct(fundamentals.roa)} />
          <Row label="Debt/Equity" value={fmt(fundamentals.debt_to_equity, 2)} />
          <Row label="Current Ratio" value={fmt(fundamentals.current_ratio, 2)} />
        </div>
      </div>
    </div>
  );
}

function TechnicalsTab({ technicals, flags }: { technicals: TechnicalSignals | null; flags: TechnicalFlag[] }) {
  if (!technicals) return <p className="text-text-tertiary">No technical data available.</p>;

  return (
    <div className="space-y-4">
      {flags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {flags.map((f) => <FlagChip key={f} flag={f} />)}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-3">
          <h4 className="text-xs text-text-tertiary uppercase tracking-wider font-medium">Moving Averages</h4>
          <Row label="SMA 20" value={fmt(technicals.sma_20, 2)} />
          <Row label="SMA 50" value={fmt(technicals.sma_50, 2)} />
          <Row label="SMA 150" value={fmt(technicals.sma_150, 2)} />
          <Row label="SMA 200" value={fmt(technicals.sma_200, 2)} />
          <Row label="EMA 10" value={fmt(technicals.ema_10, 2)} />
          <Row label="EMA 21" value={fmt(technicals.ema_21, 2)} />
        </div>
        <div className="space-y-3">
          <h4 className="text-xs text-text-tertiary uppercase tracking-wider font-medium">Momentum</h4>
          <Row label="RSI (14)" value={fmt(technicals.rsi_14, 1)} />
          <Row label="MACD" value={fmt(technicals.macd, 4)} />
          <Row label="MACD Signal" value={fmt(technicals.macd_signal, 4)} />
          <Row label="MACD Histogram" value={fmt(technicals.macd_histogram, 4)} />
          <Row label="ATR (14)" value={fmt(technicals.atr_14, 2)} />
          <Row label="ATR %" value={fmtPct(technicals.atr_pct)} />
        </div>
        <div className="space-y-3">
          <h4 className="text-xs text-text-tertiary uppercase tracking-wider font-medium">Relative Strength</h4>
          <Row label="vs SMA 50" value={fmtPct(technicals.price_vs_sma50)} />
          <Row label="vs SMA 200" value={fmtPct(technicals.price_vs_sma200)} />
          <Row label="vs 52W High" value={fmtPct(technicals.pct_from_52w_high)} />
          <Row label="vs 52W Low" value={fmtPct(technicals.pct_from_52w_low)} />
          <Row label="RS Rank 3M" value={technicals.rs_rank_3m != null ? `${technicals.rs_rank_3m}` : '—'} />
          <Row label="RS Rank 6M" value={technicals.rs_rank_6m != null ? `${technicals.rs_rank_6m}` : '—'} />
          <Row label="RS Rank 12M" value={technicals.rs_rank_12m != null ? `${technicals.rs_rank_12m}` : '—'} />
          <Row label="Volume Ratio" value={fmt(technicals.volume_ratio_50d, 2)} />
        </div>
      </div>
    </div>
  );
}

function InsiderTab({ trades }: { trades: InsiderTrade[] }) {
  if (trades.length === 0) return <p className="text-text-tertiary">No insider trade data available.</p>;

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-bg-secondary">
            <th className="px-4 py-3 text-left text-text-secondary font-medium">Date</th>
            <th className="px-4 py-3 text-left text-text-secondary font-medium">Insider</th>
            <th className="px-4 py-3 text-left text-text-secondary font-medium">Title</th>
            <th className="px-4 py-3 text-left text-text-secondary font-medium">Type</th>
            <th className="px-4 py-3 text-right text-text-secondary font-medium">Shares</th>
            <th className="px-4 py-3 text-right text-text-secondary font-medium">Price</th>
            <th className="px-4 py-3 text-right text-text-secondary font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => {
            const isBuy = t.transaction_type?.toLowerCase().includes('buy') ||
              t.transaction_type?.toLowerCase().includes('purchase');
            return (
              <tr key={t.id} className="border-b border-border/50 hover:bg-bg-tertiary/30 transition-colors">
                <td className="px-4 py-2.5 text-text-secondary text-xs">{t.transaction_date}</td>
                <td className="px-4 py-2.5">{t.insider_name}</td>
                <td className="px-4 py-2.5 text-text-tertiary text-xs">{t.insider_title ?? '—'}</td>
                <td className="px-4 py-2.5">
                  <span className={isBuy ? 'text-green' : 'text-red'}>{t.transaction_type}</span>
                </td>
                <td className="px-4 py-2.5 text-right font-display text-xs">
                  {t.shares.toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-right font-display text-xs">
                  {t.price_per_share != null ? `$${t.price_per_share.toFixed(2)}` : '—'}
                </td>
                <td className="px-4 py-2.5 text-right font-display text-xs">
                  {t.transaction_value != null ? `$${t.transaction_value.toLocaleString()}` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-text-tertiary">{label}</span>
      <span className="font-display">{value}</span>
    </div>
  );
}

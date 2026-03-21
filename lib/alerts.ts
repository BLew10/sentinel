import { getSupabaseServerClient } from './db';
import { getSECFilings } from './financial-datasets';
import { detectVolumeAnomalies, detectPriceSpikeReversal } from './indicators';
import { detectFilingFlags } from './analyzers/sec-filings';
import { formatVolume } from './utils/format';
import type { SentinelScore, InsiderTrade, PriceBar, FDSECFiling } from './utils/types';

export interface Alert {
  symbol: string;
  name: string;
  sector: string | null;
  alert_type: string;
  sentinel_score: number;
  detail: string;
  channel_env: string;
}

function fmtDollars(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function today(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export async function detectAlerts(): Promise<Alert[]> {
  const db = getSupabaseServerClient();
  const alerts: Alert[] = [];

  const { data: scores } = await db
    .from('sentinel_scores')
    .select('symbol, sentinel_score, score_change_1d, score_change_7d, technical_score, fundamental_score, insider_score, institutional_score, rank, percentile, stocks!inner(name, sector, market_cap)')
    .not('sentinel_score', 'is', null);

  if (!scores) return alerts;

  // 24h cooldown per symbol+type
  const recentAlerts = new Set<string>();
  const { data: history } = await db
    .from('alert_history')
    .select('symbol, alert_type')
    .gte('created_at', new Date(Date.now() - 24 * 3600_000).toISOString());

  for (const h of history ?? []) {
    recentAlerts.add(`${h.symbol}:${h.alert_type}`);
  }

  for (const row of scores) {
    const stock = row.stocks as unknown as { name: string; sector: string | null; market_cap: number | null };
    const score = row as unknown as SentinelScore;
    const sym = row.symbol as string;
    const ss = score.sentinel_score ?? 0;
    const tech = score.technical_score ?? 0;
    const fund = score.fundamental_score ?? 0;
    const ins = score.insider_score ?? 0;
    const inst = score.institutional_score ?? 0;

    if (ss >= 75 && !recentAlerts.has(`${sym}:score_threshold`)) {
      const change1d = score.score_change_1d != null ? ` (${score.score_change_1d > 0 ? '+' : ''}${score.score_change_1d} today)` : '';
      const topStr = score.percentile != null ? ` · Top ${score.percentile}%` : '';
      alerts.push({
        symbol: sym,
        name: stock.name,
        sector: stock.sector,
        alert_type: 'score_threshold',
        sentinel_score: ss,
        detail: `Score hit **${ss}**/100${change1d}${topStr}\nTechnical ${tech} · Fundamental ${fund} · Insider ${ins} · Institutional ${inst}\n_${today()}_`,
        channel_env: 'DISCORD_CHANNEL_ALERTS',
      });
    }

    if ((score.score_change_1d ?? 0) <= -10 && ss >= 60 && !recentAlerts.has(`${sym}:score_drop`)) {
      const prev = ss - (score.score_change_1d ?? 0);
      alerts.push({
        symbol: sym,
        name: stock.name,
        sector: stock.sector,
        alert_type: 'score_drop',
        sentinel_score: ss,
        detail: `Score dropped **${prev} → ${ss}** (${score.score_change_1d} points) in 1 day\nTechnical ${tech} · Fundamental ${fund} · Insider ${ins}\n_Was ranked in the top stocks yesterday — investigate what changed_\n_${today()}_`,
        channel_env: 'DISCORD_CHANNEL_ALERTS',
      });
    }

    if (tech >= 70 && ins >= 70 && inst >= 70 && !recentAlerts.has(`${sym}:triple_confirmation`)) {
      alerts.push({
        symbol: sym,
        name: stock.name,
        sector: stock.sector,
        alert_type: 'triple_confirmation',
        sentinel_score: ss,
        detail: `Three independent signal categories are aligned bullish:\n• Technical: **${tech}** (price trend + momentum)\n• Insider: **${ins}** (insider buying activity)\n• Institutional: **${inst}** (fund flows)\nComposite score: **${ss}**/100\n_${today()}_`,
        channel_env: 'DISCORD_CHANNEL_ALERTS',
      });
    }
  }

  // RSI Oversold Bounce
  const { data: rsiSignals } = await db
    .from('signal_snapshots')
    .select('symbol, trigger_detail, price_at_signal, snapshot_date')
    .eq('trigger_type', 'rsi_oversold_bounce')
    .gte('snapshot_date', new Date(Date.now() - 2 * 86_400_000).toISOString().split('T')[0])
    .order('created_at', { ascending: false });

  if (rsiSignals) {
    for (const sig of rsiSignals) {
      const sym = sig.symbol as string;
      if (recentAlerts.has(`${sym}:rsi_oversold_bounce`)) continue;
      const scoreRow = scores.find((s) => s.symbol === sym);
      if (!scoreRow) continue;
      const stock = scoreRow.stocks as unknown as { name: string; sector: string | null };
      const price = sig.price_at_signal != null ? `$${Number(sig.price_at_signal).toFixed(2)}` : 'N/A';
      alerts.push({
        symbol: sym,
        name: stock.name,
        sector: stock.sector,
        alert_type: 'rsi_oversold_bounce',
        sentinel_score: (scoreRow as unknown as SentinelScore).sentinel_score ?? 0,
        detail: `${(sig.trigger_detail as string) ?? 'RSI crossed above 30 from oversold'}\nPrice at signal: **${price}** · Date: ${sig.snapshot_date}\nSentinel Score: **${(scoreRow as unknown as SentinelScore).sentinel_score ?? 0}**/100\n_Oversold bounce — selling may be exhausted, watch for follow-through_`,
        channel_env: 'DISCORD_CHANNEL_ALERTS',
      });
    }
  }

  // Insider trades
  const { data: insiderTrades } = await db
    .from('insider_trades')
    .select('symbol, insider_name, insider_title, transaction_type, transaction_value, transaction_date, shares, price_per_share')
    .gte('transaction_date', new Date(Date.now() - 30 * 86_400_000).toISOString().split('T')[0])
    .order('transaction_date', { ascending: false });

  if (insiderTrades) {
    const buysBySymbol = new Map<string, InsiderTrade[]>();
    for (const t of insiderTrades) {
      const type = (t.transaction_type as string).toLowerCase();
      if (!type.includes('buy') && !type.includes('purchase')) continue;
      const sym = t.symbol as string;
      if (!buysBySymbol.has(sym)) buysBySymbol.set(sym, []);
      buysBySymbol.get(sym)!.push(t as unknown as InsiderTrade);
    }

    for (const [sym, buys] of Array.from(buysBySymbol.entries())) {
      if (buys.length >= 2 && !recentAlerts.has(`${sym}:insider_cluster_buy`)) {
        const scoreRow = scores.find((s) => s.symbol === sym);
        if (!scoreRow) continue;
        const stock = scoreRow.stocks as unknown as { name: string; sector: string | null };
        const totalValue = buys.reduce((sum, b) => sum + Math.abs(b.transaction_value ?? 0), 0);
        const buyerDetails = buys.slice(0, 4).map((b) => {
          const val = b.transaction_value != null ? ` (${fmtDollars(Math.abs(b.transaction_value))})` : '';
          return `• ${b.insider_name}${b.insider_title ? ` — ${b.insider_title}` : ''}${val} on ${b.transaction_date}`;
        }).join('\n');

        alerts.push({
          symbol: sym,
          name: stock.name,
          sector: stock.sector,
          alert_type: 'insider_cluster_buy',
          sentinel_score: (scoreRow as unknown as SentinelScore).sentinel_score ?? 0,
          detail: `**${buys.length} insiders** bought in the last 30 days — total ${fmtDollars(totalValue)}\n${buyerDetails}\n_Multiple insiders buying at once is historically one of the strongest signals_`,
          channel_env: 'DISCORD_CHANNEL_INSIDERS',
        });
      }

      for (const buy of buys) {
        const title = (buy.insider_title ?? '').toLowerCase();
        if ((title.includes('ceo') || title.includes('chief executive')) && !recentAlerts.has(`${sym}:insider_ceo_buy`)) {
          const scoreRow = scores.find((s) => s.symbol === sym);
          if (!scoreRow) continue;
          const stock = scoreRow.stocks as unknown as { name: string; sector: string | null };
          const val = buy.transaction_value != null ? fmtDollars(Math.abs(buy.transaction_value)) : 'undisclosed';
          const shares = buy.shares != null ? `${buy.shares.toLocaleString()} shares` : '';
          const price = buy.price_per_share != null ? ` @ $${buy.price_per_share.toFixed(2)}` : '';
          alerts.push({
            symbol: sym,
            name: stock.name,
            sector: stock.sector,
            alert_type: 'insider_ceo_buy',
            sentinel_score: (scoreRow as unknown as SentinelScore).sentinel_score ?? 0,
            detail: `CEO **${buy.insider_name}** purchased ${shares}${price} — **${val}**\nFiled: ${buy.transaction_date}\n_CEO open-market purchases are the highest-conviction insider signal_`,
            channel_env: 'DISCORD_CHANNEL_INSIDERS',
          });
          break;
        }
      }
    }
  }

  // Signal-based alerts: volume spikes, SEC filings, price spike reversals
  await detectSignalAlerts(scores, recentAlerts, alerts);

  return alerts;
}

async function detectSignalAlerts(
  scores: Array<Record<string, unknown>>,
  recentAlerts: Set<string>,
  alerts: Alert[],
): Promise<void> {
  const db = getSupabaseServerClient();

  for (const row of scores) {
    const sym = row.symbol as string;
    const stock = row.stocks as unknown as { name: string; sector: string | null; market_cap: number | null };
    const ss = (row as unknown as SentinelScore).sentinel_score ?? 0;

    // Volume anomaly detection
    if (!recentAlerts.has(`${sym}:volume_spike`)) {
      const { data: pricesData } = await db
        .from('daily_prices')
        .select('date, open, high, low, close, volume')
        .eq('symbol', sym)
        .order('date', { ascending: true })
        .limit(100);

      if (pricesData && pricesData.length >= 51) {
        const prices: PriceBar[] = pricesData.map((p) => ({
          date: p.date as string,
          open: Number(p.open),
          high: Number(p.high),
          low: Number(p.low),
          close: Number(p.close),
          volume: Number(p.volume),
        }));

        const anomalies = detectVolumeAnomalies(prices, sym);
        const recentAnomaly = anomalies.find((a) => {
          const daysAgo = (Date.now() - new Date(a.date).getTime()) / 86_400_000;
          return daysAgo <= 3 && (a.anomaly_severity === 'extreme' || a.anomaly_severity === 'high');
        });

        if (recentAnomaly) {
          const ratioStr = recentAnomaly.volume_ratio >= 1000
            ? `${Math.round(recentAnomaly.volume_ratio / 100) * 100}x`
            : `${Math.round(recentAnomaly.volume_ratio)}x`;

          alerts.push({
            symbol: sym,
            name: stock.name,
            sector: stock.sector,
            alert_type: 'volume_spike',
            sentinel_score: ss,
            detail: `**${formatVolume(recentAnomaly.volume)}** shares traded on ${recentAnomaly.date} — **${ratioStr}** the 50-day average (${formatVolume(recentAnomaly.avg_volume_50d)}/day)\nSeverity: **${recentAnomaly.anomaly_severity.toUpperCase()}** · Sentinel Score: ${ss}\n_Extreme volume precedes major moves — investigate what's driving the activity_`,
            channel_env: 'DISCORD_CHANNEL_ALERTS',
          });
        }

        // Price spike + reversal
        if (!recentAlerts.has(`${sym}:price_spike_reversal`)) {
          const spike = detectPriceSpikeReversal(prices);
          if (spike) {
            alerts.push({
              symbol: sym,
              name: stock.name,
              sector: stock.sector,
              alert_type: 'price_spike_reversal',
              sentinel_score: ss,
              detail: `Stock spiked **+${spike.spike_pct}%** in ${spike.days_to_peak} days ($${spike.spike_start_price.toFixed(2)} → $${spike.spike_peak_price.toFixed(2)}), now reversed **-${spike.reversal_pct}%** from peak\nPeak: ${spike.spike_peak_date} · Current: $${spike.current_price.toFixed(2)}\n_Spike-and-fade pattern — often a speculative blow-off top, not a sustainable move_`,
              channel_env: 'DISCORD_CHANNEL_ALERTS',
            });
          }
        }
      }
    }

    // SEC filing flags (only check stocks that had recent score changes or high scores)
    const scoreChange = (row as unknown as SentinelScore).score_change_1d;
    const shouldCheckFilings = ss >= 60 || (scoreChange != null && Math.abs(scoreChange) >= 5);
    if (shouldCheckFilings && !recentAlerts.has(`${sym}:dilution_filing`)) {
      try {
        const filings = await getSECFilings(sym, { limit: 10 });
        const flags = detectFilingFlags(filings);

        for (const flag of flags) {
          const alertType = flag.type === 'DILUTION_FILING' ? 'dilution_filing' : flag.type === '13D_AMENDMENT' ? '13d_amendment' : 'insider_form4';
          if (recentAlerts.has(`${sym}:${alertType}`)) continue;

          const configs: Record<string, { channel: string; desc: string }> = {
            DILUTION_FILING: {
              channel: 'DISCORD_CHANNEL_ALERTS',
              desc: `**${flag.filing.filing_type}** filed on ${flag.filing.filing_date}\n_Dilution filing — stock offering or prospectus supplement, typically bearish for shareholders_`,
            },
            '13D_AMENDMENT': {
              channel: 'DISCORD_CHANNEL_ALERTS',
              desc: `**Schedule 13D** filed on ${flag.filing.filing_date}\n_Major shareholder (5%+) is changing their position — watch for activist activity_`,
            },
            INSIDER_FORM4: {
              channel: 'DISCORD_CHANNEL_INSIDERS',
              desc: `**Form 4** insider ownership change on ${flag.filing.filing_date}\n_Check whether this is a buy, sell, or grant exercise_`,
            },
          };

          const cfg = configs[flag.type];
          if (!cfg) continue;

          alerts.push({
            symbol: sym,
            name: stock.name,
            sector: stock.sector,
            alert_type: alertType,
            sentinel_score: ss,
            detail: `${cfg.desc}\nSentinel Score: **${ss}**/100`,
            channel_env: cfg.channel,
          });
          break;
        }
      } catch {
        // SEC filings are supplemental — skip on API failure
      }
    }
  }
}

export async function recordAlert(alert: Alert, discordMessageId?: string): Promise<void> {
  const db = getSupabaseServerClient();
  await db.from('alert_history').insert({
    symbol: alert.symbol,
    alert_type: alert.alert_type,
    message: alert.detail,
    sentinel_score: alert.sentinel_score,
    discord_message_id: discordMessageId ?? null,
  });
}

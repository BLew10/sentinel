import { getSupabaseServerClient } from './db';
import type { SentinelScore, InsiderTrade } from './utils/types';

export interface Alert {
  symbol: string;
  name: string;
  sector: string | null;
  alert_type: string;
  sentinel_score: number;
  detail: string;
  channel_env: string;
}

export async function detectAlerts(): Promise<Alert[]> {
  const db = getSupabaseServerClient();
  const alerts: Alert[] = [];

  const { data: scores } = await db
    .from('sentinel_scores')
    .select('symbol, sentinel_score, score_change_1d, technical_score, insider_score, institutional_score, stocks!inner(name, sector)')
    .not('sentinel_score', 'is', null);

  if (!scores) return alerts;

  const recentAlerts = new Set<string>();
  const { data: history } = await db
    .from('alert_history')
    .select('symbol, alert_type')
    .gte('created_at', new Date(Date.now() - 24 * 3600_000).toISOString());

  for (const h of history ?? []) {
    recentAlerts.add(`${h.symbol}:${h.alert_type}`);
  }

  for (const row of scores) {
    const stock = row.stocks as unknown as { name: string; sector: string | null };
    const score = row as unknown as SentinelScore;
    const sym = row.symbol as string;

    if ((score.sentinel_score ?? 0) >= 75 && !recentAlerts.has(`${sym}:score_threshold`)) {
      alerts.push({
        symbol: sym,
        name: stock.name,
        sector: stock.sector,
        alert_type: 'score_threshold',
        sentinel_score: score.sentinel_score ?? 0,
        detail: `Sentinel Score crossed 75 threshold (now ${score.sentinel_score})`,
        channel_env: 'DISCORD_CHANNEL_ALERTS',
      });
    }

    if ((score.score_change_1d ?? 0) <= -10 && (score.sentinel_score ?? 0) >= 60 && !recentAlerts.has(`${sym}:score_drop`)) {
      alerts.push({
        symbol: sym,
        name: stock.name,
        sector: stock.sector,
        alert_type: 'score_drop',
        sentinel_score: score.sentinel_score ?? 0,
        detail: `Score dropped ${score.score_change_1d} points in 1 day`,
        channel_env: 'DISCORD_CHANNEL_ALERTS',
      });
    }

    const tech = score.technical_score ?? 0;
    const ins = score.insider_score ?? 0;
    const inst = score.institutional_score ?? 0;
    if (tech >= 70 && ins >= 70 && inst >= 70 && !recentAlerts.has(`${sym}:triple_confirmation`)) {
      alerts.push({
        symbol: sym,
        name: stock.name,
        sector: stock.sector,
        alert_type: 'triple_confirmation',
        sentinel_score: score.sentinel_score ?? 0,
        detail: `Technical (${tech}), Insider (${ins}), and Institutional (${inst}) all above 70`,
        channel_env: 'DISCORD_CHANNEL_ALERTS',
      });
    }
  }

  // RSI Oversold Bounce: check for stocks that just crossed RSI 30 from below
  const { data: rsiSignals } = await db
    .from('signal_snapshots')
    .select('symbol, trigger_detail')
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
      alerts.push({
        symbol: sym,
        name: stock.name,
        sector: stock.sector,
        alert_type: 'rsi_oversold_bounce',
        sentinel_score: (scoreRow as unknown as SentinelScore).sentinel_score ?? 0,
        detail: (sig.trigger_detail as string) ?? 'RSI bounced above 30 from oversold territory',
        channel_env: 'DISCORD_CHANNEL_ALERTS',
      });
    }
  }

  const { data: insiderTrades } = await db
    .from('insider_trades')
    .select('symbol, insider_name, insider_title, transaction_type, transaction_value, transaction_date')
    .gte('transaction_date', new Date(Date.now() - 30 * 86_400_000).toISOString().split('T')[0])
    .order('transaction_date', { ascending: false });

  if (insiderTrades) {
    const buysBySymbol = new Map<string, Array<InsiderTrade & { transaction_date: string }>>();
    for (const t of insiderTrades) {
      const type = (t.transaction_type as string).toLowerCase();
      if (!type.includes('buy') && !type.includes('purchase')) continue;
      const sym = t.symbol as string;
      if (!buysBySymbol.has(sym)) buysBySymbol.set(sym, []);
      buysBySymbol.get(sym)!.push(t as unknown as InsiderTrade & { transaction_date: string });
    }

    for (const [sym, buys] of buysBySymbol) {
      if (buys.length >= 2 && !recentAlerts.has(`${sym}:insider_cluster_buy`)) {
        const scoreRow = scores.find((s) => s.symbol === sym);
        if (!scoreRow) continue;
        const stock = scoreRow.stocks as unknown as { name: string; sector: string | null };
        alerts.push({
          symbol: sym,
          name: stock.name,
          sector: stock.sector,
          alert_type: 'insider_cluster_buy',
          sentinel_score: (scoreRow as unknown as SentinelScore).sentinel_score ?? 0,
          detail: `${buys.length} insider buys in the last 30 days (${buys.map((b) => b.insider_name).join(', ')})`,
          channel_env: 'DISCORD_CHANNEL_INSIDERS',
        });
      }

      for (const buy of buys) {
        const title = (buy.insider_title ?? '').toLowerCase();
        if ((title.includes('ceo') || title.includes('chief executive')) && !recentAlerts.has(`${sym}:insider_ceo_buy`)) {
          const scoreRow = scores.find((s) => s.symbol === sym);
          if (!scoreRow) continue;
          const stock = scoreRow.stocks as unknown as { name: string; sector: string | null };
          alerts.push({
            symbol: sym,
            name: stock.name,
            sector: stock.sector,
            alert_type: 'insider_ceo_buy',
            sentinel_score: (scoreRow as unknown as SentinelScore).sentinel_score ?? 0,
            detail: `CEO ${buy.insider_name} purchased shares (${buy.transaction_date})`,
            channel_env: 'DISCORD_CHANNEL_INSIDERS',
          });
          break;
        }
      }
    }
  }

  return alerts;
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

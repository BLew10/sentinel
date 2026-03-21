import { getSupabaseServerClient } from './db';
import type { Alert } from './alerts';

const DISCORD_API = 'https://discord.com/api/v10';

function getToken(): string | null {
  return process.env.DISCORD_BOT_TOKEN ?? null;
}

interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields?: EmbedField[];
  footer?: { text: string };
  timestamp?: string;
  url?: string;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

const ALERT_CONFIG: Record<string, { emoji: string; label: string; bullish: boolean }> = {
  score_threshold: { emoji: '⬆️', label: 'Score Spike', bullish: true },
  score_drop: { emoji: '⬇️', label: 'Score Drop', bullish: false },
  triple_confirmation: { emoji: '✅', label: 'Triple Confirmation', bullish: true },
  rsi_oversold_bounce: { emoji: '📈', label: 'RSI Oversold Bounce', bullish: true },
  insider_cluster_buy: { emoji: '🏦', label: 'Insider Cluster Buy', bullish: true },
  insider_ceo_buy: { emoji: '👔', label: 'CEO Purchase', bullish: true },
  volume_spike: { emoji: '⚡', label: 'Volume Spike', bullish: false },
  price_spike_reversal: { emoji: '📉', label: 'Price Spike Reversal', bullish: false },
  dilution_filing: { emoji: '📄', label: 'Dilution Filing', bullish: false },
  '13d_amendment': { emoji: '📄', label: '13D Amendment', bullish: false },
  insider_form4: { emoji: '👔', label: 'Insider Form 4', bullish: false },
};

// Maps alert_type to the trigger_type used in signal_performance
const ALERT_TO_SIGNAL_TYPE: Record<string, string> = {
  score_threshold: 'score_threshold',
  score_drop: 'score_drop',
  triple_confirmation: 'triple_confirmation',
  rsi_oversold_bounce: 'rsi_oversold_bounce',
  insider_cluster_buy: 'insider_cluster_buy',
  insider_ceo_buy: 'insider_ceo_buy',
  volume_spike: 'volume_breakout',
};

interface PeriodStats {
  avg_return: number;
  win_rate: number;
  total: number;
}

type PerfCache = Map<string, Map<string, PeriodStats>>;

let perfCache: PerfCache | null = null;

async function loadSignalPerformance(): Promise<PerfCache> {
  if (perfCache) return perfCache;

  const db = getSupabaseServerClient();
  const { data } = await db
    .from('signal_performance')
    .select('signal_type, period, avg_return, win_rate, total_signals')
    .in('period', ['30d', '60d', '90d'])
    .order('computed_date', { ascending: false })
    .limit(100);

  const cache: PerfCache = new Map();
  if (data) {
    for (const row of data) {
      const type = row.signal_type as string;
      const period = row.period as string;
      if (!cache.has(type)) cache.set(type, new Map());
      const typeMap = cache.get(type)!;
      if (typeMap.has(period)) continue;
      typeMap.set(period, {
        avg_return: row.avg_return != null ? Number(row.avg_return) : 0,
        win_rate: row.win_rate != null ? Number(row.win_rate) : 0,
        total: Number(row.total_signals),
      });
    }
  }

  perfCache = cache;
  return cache;
}

function formatEdgeLine(stats: PeriodStats, period: string): string {
  const ret = stats.avg_return >= 0
    ? `+${(stats.avg_return * 100).toFixed(1)}%`
    : `${(stats.avg_return * 100).toFixed(1)}%`;
  return `**${period}**: ${ret} avg (${stats.win_rate.toFixed(0)}% win)`;
}

function buildHistoricalEdge(alertType: string, perf: PerfCache): string | null {
  const signalType = ALERT_TO_SIGNAL_TYPE[alertType] ?? alertType;
  const stats = perf.get(signalType);
  if (!stats || stats.size === 0) return null;

  const parts: string[] = [];
  for (const period of ['30d', '60d', '90d']) {
    const s = stats.get(period);
    if (s && s.total >= 5) parts.push(formatEdgeLine(s, period));
  }

  if (parts.length === 0) return null;

  const sample = stats.get('30d')?.total ?? stats.get('60d')?.total ?? 0;
  return `${parts.join(' · ')}\n_Based on ${sample} historical signals_`;
}

function buildEmbed(alert: Alert, perf: PerfCache): DiscordEmbed {
  const cfg = ALERT_CONFIG[alert.alert_type] ?? { emoji: '🔔', label: alert.alert_type, bullish: false };
  const color = cfg.bullish ? 0x00d4aa : alert.alert_type === 'score_drop' ? 0xff4757 : 0xffa502;

  const fields: EmbedField[] = [];
  const edge = buildHistoricalEdge(alert.alert_type, perf);
  if (edge) {
    fields.push({ name: '📊 Historical Edge', value: edge });
  }

  return {
    title: `${cfg.emoji} ${cfg.label} — ${alert.symbol}`,
    description: `**${alert.name}**${alert.sector ? ` · ${alert.sector}` : ''}\n\n${alert.detail}`,
    color,
    fields: fields.length > 0 ? fields : undefined,
    url: `${APP_URL}/stock/${alert.symbol}`,
    timestamp: new Date().toISOString(),
    footer: { text: `Sentinel Score: ${alert.sentinel_score} · ${APP_URL}` },
  };
}

/**
 * Send an alert to a Discord channel using the bot token REST API.
 * Returns the message ID on success, null on failure.
 * Does not require the Discord bot process to be running.
 */
export async function sendAlertToDiscord(alert: Alert): Promise<string | null> {
  const token = getToken();
  if (!token) return null;

  const channelId = process.env[alert.channel_env];
  if (!channelId) return null;

  const perf = await loadSignalPerformance();
  const embed = buildEmbed(alert, perf);

  try {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`Discord API error ${res.status} for ${alert.symbol}: ${body}`);
      return null;
    }

    const data = await res.json() as { id: string };
    return data.id;
  } catch (err) {
    console.error(`Failed to send Discord alert for ${alert.symbol}:`, err);
    return null;
  }
}

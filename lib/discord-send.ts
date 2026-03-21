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

function buildEmbed(alert: Alert): DiscordEmbed {
  const cfg = ALERT_CONFIG[alert.alert_type] ?? { emoji: '🔔', label: alert.alert_type, bullish: false };
  const color = cfg.bullish ? 0x00d4aa : alert.alert_type === 'score_drop' ? 0xff4757 : 0xffa502;

  return {
    title: `${cfg.emoji} ${cfg.label} — ${alert.symbol}`,
    description: `**${alert.name}**${alert.sector ? ` · ${alert.sector}` : ''}\n\n${alert.detail}`,
    color,
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

  const embed = buildEmbed(alert);

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

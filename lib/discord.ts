import { EmbedBuilder } from 'discord.js';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export function scoreEmoji(score: number): string {
  if (score >= 80) return '🟢';
  if (score >= 60) return '🟡';
  if (score >= 40) return '🟠';
  return '🔴';
}

function scoreBar(score: number): string {
  const filled = Math.round(score / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

interface StockScoreData {
  symbol: string;
  name: string;
  sentinel_score: number;
  technical_score: number | null;
  fundamental_score: number | null;
  earnings_ai_score: number | null;
  insider_score: number | null;
  institutional_score: number | null;
  rank: number | null;
  score_change_1d: number | null;
  sector: string | null;
}

export function buildScoreEmbed(stock: StockScoreData): EmbedBuilder {
  const color = stock.sentinel_score >= 75 ? 0x00d4aa
    : stock.sentinel_score >= 50 ? 0xffa502
    : 0xff4757;

  const changeStr = stock.score_change_1d != null
    ? ` (${stock.score_change_1d > 0 ? '+' : ''}${stock.score_change_1d})`
    : '';

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${scoreEmoji(stock.sentinel_score)} ${stock.symbol} — Sentinel Score: ${stock.sentinel_score}${changeStr}`)
    .setURL(`${APP_URL}/stock/${stock.symbol}`)
    .setDescription(stock.name + (stock.sector ? ` · ${stock.sector}` : ''));

  const scores = [
    `Technical:      \`${scoreBar(stock.technical_score ?? 50)}\` ${stock.technical_score ?? '—'}`,
    `Fundamental:    \`${scoreBar(stock.fundamental_score ?? 50)}\` ${stock.fundamental_score ?? '—'}`,
    `Earnings AI:    \`${scoreBar(stock.earnings_ai_score ?? 50)}\` ${stock.earnings_ai_score ?? '—'}`,
    `Insider:        \`${scoreBar(stock.insider_score ?? 50)}\` ${stock.insider_score ?? '—'}`,
    `Institutional:  \`${scoreBar(stock.institutional_score ?? 50)}\` ${stock.institutional_score ?? '—'}`,
  ].join('\n');

  embed.addFields({ name: 'Score Breakdown', value: scores });

  if (stock.rank != null) {
    embed.setFooter({ text: `Rank #${stock.rank} · ${APP_URL}` });
  }

  return embed;
}

export function buildTop10Embed(stocks: StockScoreData[]): EmbedBuilder {
  const lines = stocks.slice(0, 10).map((s, i) => {
    const change = s.score_change_1d != null
      ? ` (${s.score_change_1d > 0 ? '+' : ''}${s.score_change_1d})`
      : '';
    return `**${i + 1}.** ${scoreEmoji(s.sentinel_score)} [${s.symbol}](${APP_URL}/stock/${s.symbol}) — **${s.sentinel_score}**${change} · ${s.name}`;
  });

  return new EmbedBuilder()
    .setColor(0x00d4aa)
    .setTitle('📊 Sentinel Top 10')
    .setDescription(lines.join('\n'))
    .setFooter({ text: `${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} · ${APP_URL}` })
    .setTimestamp();
}

interface AlertData {
  symbol: string;
  name: string;
  alert_type: string;
  sentinel_score: number;
  detail: string;
  sector?: string | null;
}

const ALERT_LABELS: Record<string, { emoji: string; label: string; bullish: boolean }> = {
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

export function buildAlertEmbed(alert: AlertData): EmbedBuilder {
  const cfg = ALERT_LABELS[alert.alert_type] ?? { emoji: '🔔', label: alert.alert_type, bullish: false };
  const color = cfg.bullish ? 0x00d4aa : alert.alert_type === 'score_drop' ? 0xff4757 : 0xffa502;

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`${cfg.emoji} ${cfg.label} — ${alert.symbol}`)
    .setURL(`${APP_URL}/stock/${alert.symbol}`)
    .setDescription(`**${alert.name}**${alert.sector ? ` · ${alert.sector}` : ''}\n\n${alert.detail}`)
    .setFooter({ text: `Sentinel Score: ${alert.sentinel_score} · ${APP_URL}` })
    .setTimestamp();
}

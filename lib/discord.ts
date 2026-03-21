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

export function buildAlertEmbed(alert: AlertData): EmbedBuilder {
  const isBullish = ['score_threshold', 'insider_cluster_buy', 'insider_ceo_buy', 'triple_confirmation'].includes(alert.alert_type);
  const color = isBullish ? 0x00d4aa : 0xff4757;

  const typeLabels: Record<string, string> = {
    score_threshold: '⬆️ Score Spike',
    score_drop: '⬇️ Score Drop',
    insider_cluster_buy: '🏦 Insider Cluster Buy',
    insider_ceo_buy: '👔 CEO Buy',
    triple_confirmation: '✅ Triple Confirmation',
  };

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`${typeLabels[alert.alert_type] ?? alert.alert_type} — ${alert.symbol}`)
    .setURL(`${APP_URL}/stock/${alert.symbol}`)
    .setDescription(`**${alert.name}**${alert.sector ? ` · ${alert.sector}` : ''}\nSentinel Score: **${alert.sentinel_score}**`)
    .addFields({ name: 'Detail', value: alert.detail })
    .setTimestamp();
}

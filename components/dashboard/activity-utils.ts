import { formatCurrency } from '@/lib/utils/format';

export type ActivityCategory = 'insider' | 'filing' | 'institutional';

export interface ActivityItem {
  id: string;
  date: string;
  category: ActivityCategory;
  symbol: string;
  headline: string;
  detail: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
}

export function buildActivityItems(
  insiderTrades: Array<{
    symbol: string;
    insider_name: string;
    insider_title: string | null;
    transaction_date: string;
    transaction_type: string;
    shares: number;
    price_per_share: number | null;
    transaction_value: number | null;
  }>,
  filings: Array<{
    ticker: string;
    filing_type: string;
    filing_date: string;
  }>,
  institutionalChanges: Array<{
    symbol: string;
    institution_name: string;
    change_shares: number | null;
    change_pct: number | null;
    value: number | null;
    filing_date: string | null;
  }>,
): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (let i = 0; i < insiderTrades.length; i++) {
    const t = insiderTrades[i];
    const isBuy = t.transaction_type.toLowerCase().includes('buy') || t.transaction_type.toLowerCase().includes('purchase');
    const valueStr = t.transaction_value ? ` (${formatCurrency(t.transaction_value, { compact: true })})` : '';
    items.push({
      id: `ins-${t.symbol}-${t.transaction_date}-${t.insider_name}-${i}`,
      date: t.transaction_date,
      category: 'insider',
      symbol: t.symbol,
      headline: isBuy ? 'Buy' : 'Sale',
      detail: `${t.insider_name}${t.insider_title ? ` (${t.insider_title})` : ''} — ${t.transaction_type} ${t.shares.toLocaleString()} shares${valueStr}`,
      sentiment: isBuy ? 'bullish' : 'bearish',
    });
  }

  for (let i = 0; i < filings.length; i++) {
    const f = filings[i];
    const bearishTypes = ['S-3', 'S-1', 'SC 13D/A'];
    const isBearish = bearishTypes.some((bt) => f.filing_type.includes(bt));
    items.push({
      id: `fil-${f.ticker}-${f.filing_date}-${f.filing_type}-${i}`,
      date: f.filing_date,
      category: 'filing',
      symbol: f.ticker,
      headline: f.filing_type,
      detail: `SEC ${f.filing_type} filed`,
      sentiment: isBearish ? 'bearish' : 'neutral',
    });
  }

  for (let i = 0; i < institutionalChanges.length; i++) {
    const h = institutionalChanges[i];
    if (!h.filing_date) continue;
    const isIncrease = (h.change_shares ?? 0) > 0;
    const pctStr = h.change_pct != null ? ` (${h.change_pct > 0 ? '+' : ''}${(h.change_pct * 100).toFixed(1)}%)` : '';
    const valStr = h.value ? ` · ${formatCurrency(h.value, { compact: true })}` : '';
    items.push({
      id: `inst-${h.symbol}-${h.filing_date}-${h.institution_name}-${i}`,
      date: h.filing_date,
      category: 'institutional',
      symbol: h.symbol,
      headline: isIncrease ? 'Increased' : 'Decreased',
      detail: `${h.institution_name}${pctStr}${valStr}`,
      sentiment: isIncrease ? 'bullish' : 'bearish',
    });
  }

  items.sort((a, b) => b.date.localeCompare(a.date));
  return items.slice(0, 20);
}

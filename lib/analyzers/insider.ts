import type { InsiderSignals, InsiderTrade, InsiderFlag, PriceBar } from '../utils/types';

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function computeInsiderScore(signals: InsiderSignals | null): number {
  if (!signals) return 50;

  const { num_buyers_30d, num_sellers_30d, net_buy_value_30d, largest_transaction_value } = signals;
  const scores: number[] = [];

  // Net buyer/seller ratio
  const totalTransactions = num_buyers_30d + num_sellers_30d;
  if (totalTransactions > 0) {
    const buyRatio = num_buyers_30d / totalTransactions;
    scores.push(clamp(buyRatio * 100));
  }

  // Net buy value direction and magnitude
  if (net_buy_value_30d != null) {
    if (net_buy_value_30d > 0) {
      const magnitude = Math.min(net_buy_value_30d / 5_000_000, 1);
      scores.push(clamp(55 + magnitude * 35));
    } else if (net_buy_value_30d < 0) {
      const magnitude = Math.min(Math.abs(net_buy_value_30d) / 10_000_000, 1);
      scores.push(clamp(45 - magnitude * 30));
    } else {
      scores.push(50);
    }
  }

  // Cluster buying bonus: 3+ buyers in 30 days is very bullish
  if (num_buyers_30d >= 3) {
    scores.push(85);
  } else if (num_buyers_30d >= 2) {
    scores.push(70);
  }

  // Large transaction bonus
  if (largest_transaction_value != null && largest_transaction_value > 1_000_000) {
    const isNetBuy = net_buy_value_30d != null && net_buy_value_30d > 0;
    scores.push(isNetBuy ? 80 : 30);
  }

  if (scores.length === 0) return 50;
  return clamp(scores.reduce((a, b) => a + b, 0) / scores.length);
}

export function computeInstitutionalScore(signals: {
  num_new_positions: number;
  num_increased: number;
  num_decreased: number;
  num_closed: number;
  net_institutional_flow: number | null;
} | null): number {
  if (!signals) return 50;

  const scores: number[] = [];

  const totalActivity = signals.num_new_positions + signals.num_increased +
    signals.num_decreased + signals.num_closed;

  if (totalActivity > 0) {
    const bullishRatio = (signals.num_new_positions + signals.num_increased) / totalActivity;
    scores.push(clamp(bullishRatio * 100));
  }

  if (signals.net_institutional_flow != null) {
    if (signals.net_institutional_flow > 0) {
      scores.push(65);
    } else if (signals.net_institutional_flow < 0) {
      scores.push(35);
    } else {
      scores.push(50);
    }
  }

  if (scores.length === 0) return 50;
  return clamp(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function isBuyTransaction(type: string): boolean {
  const t = type.toLowerCase();
  return t.includes('buy') || t.includes('purchase') || (t.includes('acquisition') && !t.includes('disposition'));
}

function isCeoOrEquivalent(title: string | null): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  return t.includes('ceo') || t.includes('chief executive');
}

/**
 * Detect insider activity flags from raw trade data.
 * Optional prices param enables contrarian buy detection (buying while stock falls).
 */
export function detectInsiderFlags(
  trades: InsiderTrade[],
  prices?: PriceBar[],
): InsiderFlag[] {
  if (trades.length === 0) return [];

  const flags = new Set<InsiderFlag>();
  const now = Date.now();
  const thirtyDaysMs = 30 * 86_400_000;

  const recentTrades = trades.filter(
    (t) => now - new Date(t.transaction_date).getTime() < thirtyDaysMs,
  );

  const recentBuyers = new Set<string>();
  const recentSellers = new Set<string>();

  for (const t of recentTrades) {
    const buy = isBuyTransaction(t.transaction_type);
    if (buy) {
      recentBuyers.add(t.insider_name);
    } else {
      recentSellers.add(t.insider_name);
    }

    if (isCeoOrEquivalent(t.insider_title)) {
      flags.add(buy ? 'CEO_BUY' : 'CEO_SELL');
    }

    const value = Math.abs(t.transaction_value ?? 0);
    if (buy && value >= 1_000_000) flags.add('MEGA_BUY');
    else if (buy && value >= 500_000) flags.add('LARGE_BUY');
  }

  if (recentBuyers.size >= 2) flags.add('CLUSTER_BUY');
  if (recentSellers.size >= 2) flags.add('CLUSTER_SELL');

  // Insider buying while stock is down >15% over 30 days
  if (recentBuyers.size > 0 && prices && prices.length >= 30) {
    const currentPrice = prices[prices.length - 1].close;
    const priceThirtyDaysAgo = prices[Math.max(0, prices.length - 30)].close;
    if (priceThirtyDaysAgo > 0) {
      const priceChange = (currentPrice - priceThirtyDaysAgo) / priceThirtyDaysAgo;
      if (priceChange < -0.15) flags.add('CONTRARIAN_BUY');
    }
  }

  // Recent buy exists but no buys older than 30 days in the data set
  if (recentBuyers.size > 0) {
    const olderBuys = trades.filter(
      (t) =>
        isBuyTransaction(t.transaction_type) &&
        now - new Date(t.transaction_date).getTime() >= thirtyDaysMs,
    );
    if (olderBuys.length === 0) flags.add('FIRST_BUY_12MO');
  }

  // More distinct sellers in last 15 days than prior 15 days
  const fifteenDaysMs = 15 * 86_400_000;
  const recentSells = recentTrades.filter(
    (t) =>
      !isBuyTransaction(t.transaction_type) &&
      now - new Date(t.transaction_date).getTime() < fifteenDaysMs,
  );
  const priorSells = recentTrades.filter(
    (t) =>
      !isBuyTransaction(t.transaction_type) &&
      now - new Date(t.transaction_date).getTime() >= fifteenDaysMs,
  );
  if (recentSells.length > priorSells.length && recentSells.length >= 2) {
    flags.add('ACCELERATING_SELLS');
  }

  return [...flags];
}

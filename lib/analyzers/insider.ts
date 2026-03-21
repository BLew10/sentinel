import type { InsiderSignals } from '../utils/types';

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

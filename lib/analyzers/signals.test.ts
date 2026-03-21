import { describe, it, expect } from 'vitest';
import { detectVolumeAnomalies, detectPriceSpikeReversal } from '../indicators';
import { detectFilingFlags } from './sec-filings';
import { detectInsiderFlags } from './insider';
import { detectAllSignals } from './signals';
import type { PriceBar, FDSECFiling, InsiderTrade } from '../utils/types';

// ── Helpers ─────────────────────────────────────────────────

function makeBar(date: string, close: number, volume: number, overrides?: Partial<PriceBar>): PriceBar {
  return {
    date,
    open: close * 0.99,
    high: close * 1.01,
    low: close * 0.98,
    close,
    volume,
    ...overrides,
  };
}

function makeBars(count: number, baseVolume = 50_000, basePrice = 10): PriceBar[] {
  const bars: PriceBar[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(2025, 0, 2 + i);
    bars.push(makeBar(d.toISOString().split('T')[0], basePrice, baseVolume));
  }
  return bars;
}

function recentDate(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  return d.toISOString().split('T')[0];
}

function makeFiling(type: string, daysAgo: number): FDSECFiling {
  return {
    ticker: 'TEST',
    filing_type: type,
    filing_date: recentDate(daysAgo),
    report_date: null,
    url: 'https://sec.gov/test',
  };
}

function makeTrade(overrides: Partial<InsiderTrade> = {}): InsiderTrade {
  return {
    id: 1,
    symbol: 'TEST',
    insider_name: 'John Doe',
    insider_title: 'CFO',
    is_board_director: false,
    transaction_date: recentDate(5),
    transaction_type: 'Purchase',
    shares: 1000,
    price_per_share: 10,
    transaction_value: 10_000,
    shares_owned_after: 5000,
    filing_date: recentDate(4),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── detectVolumeAnomalies ───────────────────────────────────

describe('detectVolumeAnomalies', () => {
  it('returns empty array for insufficient history', () => {
    const bars = makeBars(30);
    expect(detectVolumeAnomalies(bars, 'TEST')).toEqual([]);
  });

  it('returns empty array for normal volume', () => {
    const bars = makeBars(60);
    expect(detectVolumeAnomalies(bars, 'TEST')).toEqual([]);
  });

  it('detects moderate anomaly (5x-10x)', () => {
    const bars = makeBars(60);
    bars[55] = makeBar(bars[55].date, 10, 350_000);
    const anomalies = detectVolumeAnomalies(bars, 'TEST');
    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies[0].anomaly_severity).toBe('moderate');
    expect(anomalies[0].is_anomaly).toBe(true);
  });

  it('detects high anomaly (10x-50x)', () => {
    const bars = makeBars(60);
    bars[55] = makeBar(bars[55].date, 10, 750_000);
    const anomalies = detectVolumeAnomalies(bars, 'TEST');
    expect(anomalies.some((a) => a.anomaly_severity === 'high')).toBe(true);
  });

  it('detects extreme anomaly (>50x)', () => {
    const bars = makeBars(60);
    bars[55] = makeBar(bars[55].date, 10, 5_000_000);
    const anomalies = detectVolumeAnomalies(bars, 'TEST');
    expect(anomalies[0].anomaly_severity).toBe('extreme');
  });

  it('sorts by severity descending', () => {
    const bars = makeBars(60);
    bars[52] = makeBar(bars[52].date, 10, 350_000);
    bars[55] = makeBar(bars[55].date, 10, 5_000_000);
    const anomalies = detectVolumeAnomalies(bars, 'TEST');
    expect(anomalies.length).toBeGreaterThanOrEqual(2);
    expect(anomalies[0].anomaly_severity).toBe('extreme');
  });
});

// ── detectPriceSpikeReversal ────────────────────────────────

describe('detectPriceSpikeReversal', () => {
  it('returns null for insufficient data', () => {
    expect(detectPriceSpikeReversal(makeBars(5))).toBeNull();
  });

  it('returns null when no spike exists', () => {
    expect(detectPriceSpikeReversal(makeBars(30))).toBeNull();
  });

  it('returns null for spike without reversal', () => {
    const bars = makeBars(20);
    bars[10] = makeBar(bars[10].date, 5, 50_000);
    for (let i = 11; i < 15; i++) {
      bars[i] = makeBar(bars[i].date, 5 + (i - 10) * 3, 50_000);
    }
    for (let i = 15; i < 20; i++) {
      bars[i] = makeBar(bars[i].date, 17, 50_000);
    }
    expect(detectPriceSpikeReversal(bars)).toBeNull();
  });

  it('detects spike + reversal pattern', () => {
    const bars: PriceBar[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(2025, 2, 1 + i);
      let price = 1;
      if (i >= 5 && i <= 10) price = 1 + (i - 5) * 0.5;
      if (i === 10) price = 3.5;
      if (i > 10) price = 2;
      bars.push(makeBar(d.toISOString().split('T')[0], price, 50_000, { high: price * 1.05 }));
    }
    const result = detectPriceSpikeReversal(bars);
    expect(result).not.toBeNull();
    expect(result!.spike_pct).toBeGreaterThan(100);
    expect(result!.reversal_pct).toBeGreaterThan(20);
  });
});

// ── detectFilingFlags ───────────────────────────────────────

describe('detectFilingFlags', () => {
  it('returns empty array for no filings', () => {
    expect(detectFilingFlags([])).toEqual([]);
  });

  it('returns empty array for old filings', () => {
    const flags = detectFilingFlags([makeFiling('424B5', 60)]);
    expect(flags).toEqual([]);
  });

  it('detects dilution filings (424B5)', () => {
    const flags = detectFilingFlags([makeFiling('424B5', 5)]);
    expect(flags).toHaveLength(1);
    expect(flags[0].type).toBe('DILUTION_FILING');
  });

  it('detects S-3 as dilution', () => {
    const flags = detectFilingFlags([makeFiling('S-3', 10)]);
    expect(flags).toHaveLength(1);
    expect(flags[0].type).toBe('DILUTION_FILING');
  });

  it('detects 13D filings', () => {
    const flags = detectFilingFlags([makeFiling('SCHEDULE 13D/A', 5)]);
    expect(flags).toHaveLength(1);
    expect(flags[0].type).toBe('13D_AMENDMENT');
  });

  it('detects Form 4 (insider)', () => {
    const flags = detectFilingFlags([makeFiling('4', 3)]);
    expect(flags).toHaveLength(1);
    expect(flags[0].type).toBe('INSIDER_FORM4');
  });

  it('handles multiple filing types', () => {
    const flags = detectFilingFlags([
      makeFiling('424B5', 5),
      makeFiling('4', 3),
      makeFiling('SCHEDULE 13D', 10),
    ]);
    expect(flags).toHaveLength(3);
    const types = flags.map((f) => f.type);
    expect(types).toContain('DILUTION_FILING');
    expect(types).toContain('INSIDER_FORM4');
    expect(types).toContain('13D_AMENDMENT');
  });
});

// ── detectInsiderFlags ──────────────────────────────────────

describe('detectInsiderFlags', () => {
  it('returns empty array for no trades', () => {
    expect(detectInsiderFlags([])).toEqual([]);
  });

  it('detects cluster buy (2+ distinct buyers)', () => {
    const trades = [
      makeTrade({ insider_name: 'Alice', transaction_type: 'Purchase' }),
      makeTrade({ insider_name: 'Bob', transaction_type: 'Purchase' }),
    ];
    const flags = detectInsiderFlags(trades);
    expect(flags).toContain('CLUSTER_BUY');
  });

  it('detects cluster sell (2+ distinct sellers)', () => {
    const trades = [
      makeTrade({ insider_name: 'Alice', transaction_type: 'Sale' }),
      makeTrade({ insider_name: 'Bob', transaction_type: 'Disposition' }),
    ];
    const flags = detectInsiderFlags(trades);
    expect(flags).toContain('CLUSTER_SELL');
  });

  it('detects CEO buy', () => {
    const flags = detectInsiderFlags([
      makeTrade({ insider_title: 'CEO', transaction_type: 'Purchase' }),
    ]);
    expect(flags).toContain('CEO_BUY');
  });

  it('detects CEO sell', () => {
    const flags = detectInsiderFlags([
      makeTrade({ insider_title: 'Chief Executive Officer', transaction_type: 'Sale' }),
    ]);
    expect(flags).toContain('CEO_SELL');
  });

  it('detects mega buy (>$1M)', () => {
    const flags = detectInsiderFlags([
      makeTrade({ transaction_value: 2_000_000, transaction_type: 'Purchase' }),
    ]);
    expect(flags).toContain('MEGA_BUY');
  });

  it('detects large buy ($500K-$1M)', () => {
    const flags = detectInsiderFlags([
      makeTrade({ transaction_value: 750_000, transaction_type: 'Purchase' }),
    ]);
    expect(flags).toContain('LARGE_BUY');
  });

  it('detects contrarian buy when stock is down >15%', () => {
    const prices = makeBars(40, 50_000, 10);
    for (let i = 30; i < 40; i++) {
      prices[i] = makeBar(prices[i].date, 8, 50_000);
    }
    const flags = detectInsiderFlags(
      [makeTrade({ transaction_type: 'Purchase' })],
      prices,
    );
    expect(flags).toContain('CONTRARIAN_BUY');
  });

  it('does not flag contrarian buy when stock is flat', () => {
    const prices = makeBars(40);
    const flags = detectInsiderFlags(
      [makeTrade({ transaction_type: 'Purchase' })],
      prices,
    );
    expect(flags).not.toContain('CONTRARIAN_BUY');
  });

  it('detects first buy in 12 months', () => {
    const flags = detectInsiderFlags([
      makeTrade({ transaction_type: 'Purchase', transaction_date: recentDate(5) }),
    ]);
    expect(flags).toContain('FIRST_BUY_12MO');
  });

  it('does not flag first buy when older buys exist', () => {
    const flags = detectInsiderFlags([
      makeTrade({ transaction_type: 'Purchase', transaction_date: recentDate(5) }),
      makeTrade({ insider_name: 'Old Buyer', transaction_type: 'Purchase', transaction_date: recentDate(60) }),
    ]);
    expect(flags).not.toContain('FIRST_BUY_12MO');
  });

  it('ignores trades older than 30 days for cluster detection', () => {
    const trades = [
      makeTrade({ insider_name: 'Alice', transaction_type: 'Purchase', transaction_date: recentDate(5) }),
      makeTrade({ insider_name: 'Bob', transaction_type: 'Purchase', transaction_date: recentDate(60) }),
    ];
    const flags = detectInsiderFlags(trades);
    expect(flags).not.toContain('CLUSTER_BUY');
  });
});

// ── detectAllSignals ────────────────────────────────────────

describe('detectAllSignals', () => {
  it('returns empty array when no signals are detected', () => {
    const signals = detectAllSignals({
      symbol: 'TEST',
      prices: makeBars(60),
      filings: [],
      insiderTrades: [],
      marketCap: 1_000_000_000,
    });
    expect(signals).toEqual([]);
  });

  it('detects penny stock warning', () => {
    const prices = makeBars(60, 50_000, 3);
    const signals = detectAllSignals({
      symbol: 'TEST',
      prices,
      filings: [],
      insiderTrades: [],
      marketCap: 50_000_000,
    });
    expect(signals.some((s) => s.type === 'PENNY_STOCK_WARNING')).toBe(true);
  });

  it('does not flag penny stock for large market cap', () => {
    const prices = makeBars(60, 50_000, 3);
    const signals = detectAllSignals({
      symbol: 'TEST',
      prices,
      filings: [],
      insiderTrades: [],
      marketCap: 500_000_000,
    });
    expect(signals.some((s) => s.type === 'PENNY_STOCK_WARNING')).toBe(false);
  });

  it('detects cross-signal: insider form 4 near volume spike', () => {
    const bars = makeBars(60);
    const spikeDate = recentDate(5);
    bars[54] = makeBar(spikeDate, 10, 5_000_000);

    const filingDate = recentDate(4);
    const filings: FDSECFiling[] = [{
      ticker: 'TEST',
      filing_type: '4',
      filing_date: filingDate,
      report_date: null,
      url: 'https://sec.gov/test',
    }];

    const signals = detectAllSignals({
      symbol: 'TEST',
      prices: bars,
      filings,
      insiderTrades: [],
      marketCap: 1_000_000_000,
    });

    expect(signals.some((s) => s.type === 'INSIDER_FILING_NEAR_SPIKE')).toBe(true);
  });

  it('sorts by severity then date', () => {
    const bars = makeBars(60);
    bars[54] = makeBar(recentDate(5), 10, 5_000_000);

    const signals = detectAllSignals({
      symbol: 'TEST',
      prices: bars,
      filings: [makeFiling('424B5', 10)],
      insiderTrades: [],
      marketCap: 50_000_000,
    });

    if (signals.length >= 2) {
      const severityOrder = { HIGH: 0, INVESTIGATE: 1, CAUTION: 2, RISK: 3, WATCH: 4 };
      for (let i = 1; i < signals.length; i++) {
        const prev = severityOrder[signals[i - 1].severity];
        const curr = severityOrder[signals[i].severity];
        expect(curr).toBeGreaterThanOrEqual(prev);
      }
    }
  });

  it('includes insider flags in signals', () => {
    const signals = detectAllSignals({
      symbol: 'TEST',
      prices: makeBars(60),
      filings: [],
      insiderTrades: [
        makeTrade({ insider_name: 'Alice', transaction_type: 'Purchase', insider_title: 'CEO' }),
      ],
      marketCap: 1_000_000_000,
    });
    expect(signals.some((s) => s.type === 'CEO_BUY')).toBe(true);
  });
});

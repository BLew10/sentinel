import 'dotenv/config';
import Database from 'better-sqlite3';

const DB_PATH = '/Users/brandonlewis/Documents/kalshi-bot/crypto-15-min/data/kalshi-algo.sqlite';

type Regime = 'trending' | 'choppy_dangerous' | 'choppy_boring' | 'dead';
type Direction = 'YES' | 'NO' | 'SKIP';

interface DecisionOutcome {
  decision_id: number;
  direction: Direction;
  confidence: number;
  composite_score: number;
  regime: Regime | null;
  conviction: string | null;
  timeframe: string;
  was_correct: number;
  actual_result: string;
  decision_timestamp: string;
  asset: string;
  theoretical_pnl: number;
  net_edge_after_fees: number | null;
  price_change_pct: number | null;
  is_second_pass: number;
}

interface SignalRow {
  decision_id: number;
  signal_name: string;
  signal_value: number;
  signal_confidence: number;
  signal_direction: Direction;
}

function wilsonCI(wins: number, n: number, z = 1.96): { lower: number; upper: number } {
  if (n === 0) return { lower: 0, upper: 0 };
  const p = wins / n;
  const denom = 1 + z * z / n;
  const center = p + z * z / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n);
  return {
    lower: Math.max(0, (center - spread) / denom),
    upper: Math.min(1, (center + spread) / denom),
  };
}

function main(): void {
  console.log('=== Sentinel: Kalshi Bot Historical Analysis ===\n');
  console.log(`Reading: ${DB_PATH}\n`);

  const db = new Database(DB_PATH, { readonly: true });
  db.pragma('journal_mode = DELETE');

  // 1. Overview
  printOverview(db);

  // 2. Per-signal hit rate
  printPerSignalAnalysis(db);

  // 3. Signal contribution analysis
  printSignalContribution(db);

  // 4. Score threshold sweep
  printThresholdSweep(db);

  // 5. Regime breakdown
  printRegimeBreakdown(db);

  // 6. Time-of-day analysis
  printTimeOfDay(db);

  // 7. Asset comparison
  printAssetComparison(db);

  // 8. Weight optimization
  printWeightOptimization(db);

  // 9. Conviction tier analysis
  printConvictionAnalysis(db);

  // 10. Second pass analysis
  printSecondPassAnalysis(db);

  db.close();
  console.log('\n=== Analysis Complete ===');
}

function getDecisionOutcomes(db: Database.Database): DecisionOutcome[] {
  return db.prepare(`
    SELECT 
      d.id as decision_id,
      d.direction,
      d.confidence,
      d.composite_score,
      d.regime,
      d.conviction,
      d.timeframe,
      d.decision_timestamp,
      d.net_edge_after_fees,
      d.price_change_pct,
      d.is_second_pass,
      o.was_correct,
      o.actual_result,
      o.theoretical_pnl,
      w.asset
    FROM decisions d
    JOIN outcomes o ON o.decision_id = d.id
    JOIN windows w ON d.window_id = w.id
    WHERE d.direction != 'SKIP'
  `).all() as DecisionOutcome[];
}

function printOverview(db: Database.Database): void {
  console.log('='.repeat(100));
  console.log('OVERVIEW');
  console.log('='.repeat(100) + '\n');

  const windowCount = (db.prepare('SELECT COUNT(*) as c FROM windows').get() as { c: number }).c;
  const decisionCount = (db.prepare('SELECT COUNT(*) as c FROM decisions').get() as { c: number }).c;
  const nonSkipCount = (db.prepare("SELECT COUNT(*) as c FROM decisions WHERE direction != 'SKIP'").get() as { c: number }).c;
  const outcomeCount = (db.prepare('SELECT COUNT(*) as c FROM outcomes').get() as { c: number }).c;
  const tradeCount = (db.prepare('SELECT COUNT(*) as c FROM trades').get() as { c: number }).c;
  const snapshotCount = (db.prepare('SELECT COUNT(*) as c FROM signal_snapshots').get() as { c: number }).c;

  const correctCount = (db.prepare('SELECT COUNT(*) as c FROM outcomes WHERE was_correct = 1').get() as { c: number }).c;
  const hitRate = outcomeCount > 0 ? correctCount / outcomeCount : 0;

  const totalPnl = (db.prepare('SELECT COALESCE(SUM(theoretical_pnl), 0) as s FROM outcomes').get() as { s: number }).s;

  const dateRange = db.prepare(`
    SELECT MIN(d.decision_timestamp) as first_dt, MAX(d.decision_timestamp) as last_dt
    FROM decisions d
    JOIN outcomes o ON o.decision_id = d.id
  `).get() as { first_dt: string; last_dt: string };

  console.log(`  Windows:           ${windowCount.toLocaleString()}`);
  console.log(`  Decisions:         ${decisionCount.toLocaleString()} (${nonSkipCount.toLocaleString()} non-SKIP)`);
  console.log(`  Outcomes:          ${outcomeCount.toLocaleString()}`);
  console.log(`  Trades:            ${tradeCount.toLocaleString()}`);
  console.log(`  Signal snapshots:  ${snapshotCount.toLocaleString()}`);
  console.log(`  Overall hit rate:  ${(hitRate * 100).toFixed(1)}% (${correctCount}/${outcomeCount})`);
  console.log(`  Total theo P&L:    $${totalPnl.toFixed(2)}`);
  console.log(`  Date range:        ${dateRange.first_dt ?? 'N/A'} to ${dateRange.last_dt ?? 'N/A'}`);

  const wilson = wilsonCI(correctCount, outcomeCount);
  console.log(`  Wilson 95% CI:     [${(wilson.lower * 100).toFixed(1)}% - ${(wilson.upper * 100).toFixed(1)}%]`);
}

function printPerSignalAnalysis(db: Database.Database): void {
  console.log('\n' + '='.repeat(100));
  console.log('PER-SIGNAL HIT RATE');
  console.log('='.repeat(100) + '\n');

  const rows = db.prepare(`
    SELECT 
      ss.signal_name,
      ss.signal_direction,
      ss.signal_value,
      ss.signal_confidence,
      d.direction as decision_direction,
      o.was_correct,
      o.actual_result
    FROM signal_snapshots ss
    JOIN decisions d ON ss.decision_id = d.id
    JOIN outcomes o ON o.decision_id = d.id
    WHERE d.direction != 'SKIP'
      AND ss.signal_value > 0
  `).all() as Array<{
    signal_name: string;
    signal_direction: Direction;
    signal_value: number;
    signal_confidence: number;
    decision_direction: Direction;
    was_correct: number;
    actual_result: string;
  }>;

  // Group by signal name
  const bySignal = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!bySignal.has(row.signal_name)) bySignal.set(row.signal_name, []);
    bySignal.get(row.signal_name)!.push(row);
  }

  console.log(
    'Signal'.padEnd(20) +
    'N'.padStart(6) +
    'Agreed'.padStart(8) +
    'AgreeHit'.padStart(10) +
    'DisagHit'.padStart(10) +
    'OwnHit'.padStart(9) +
    'AvgStr'.padStart(9) +
    'AvgConf'.padStart(9) +
    'Wilson95'.padStart(14),
  );
  console.log('-'.repeat(95));

  const signalResults: Array<{
    name: string;
    n: number;
    agreedN: number;
    agreedHits: number;
    disagreedN: number;
    disagreedHits: number;
    ownHitRate: number;
  }> = [];

  for (const [name, signalRows] of bySignal) {
    let agreed = 0;
    let agreedCorrect = 0;
    let disagreed = 0;
    let disagreedCorrect = 0;
    let ownCorrect = 0;
    let totalStr = 0;
    let totalConf = 0;

    for (const row of signalRows) {
      const signalAgreed = row.signal_direction === row.decision_direction;
      const signalMatchedOutcome = row.signal_direction === row.actual_result;

      if (signalAgreed) {
        agreed++;
        if (row.was_correct) agreedCorrect++;
      } else {
        disagreed++;
        if (row.was_correct) disagreedCorrect++;
      }

      if (signalMatchedOutcome) ownCorrect++;
      totalStr += row.signal_value;
      totalConf += row.signal_confidence;
    }

    const n = signalRows.length;
    const ownHitRate = n > 0 ? ownCorrect / n : 0;
    const agreeHitRate = agreed > 0 ? agreedCorrect / agreed : 0;
    const disagreeHitRate = disagreed > 0 ? disagreedCorrect / disagreed : 0;
    const wilson = wilsonCI(ownCorrect, n);

    signalResults.push({
      name,
      n,
      agreedN: agreed,
      agreedHits: agreedCorrect,
      disagreedN: disagreed,
      disagreedHits: disagreedCorrect,
      ownHitRate,
    });

    console.log(
      name.padEnd(20) +
      String(n).padStart(6) +
      `${agreed}/${n}`.padStart(8) +
      `${(agreeHitRate * 100).toFixed(1)}%`.padStart(10) +
      `${(disagreeHitRate * 100).toFixed(1)}%`.padStart(10) +
      `${(ownHitRate * 100).toFixed(1)}%`.padStart(9) +
      (totalStr / n).toFixed(3).padStart(9) +
      (totalConf / n).toFixed(3).padStart(9) +
      `[${(wilson.lower * 100).toFixed(0)}-${(wilson.upper * 100).toFixed(0)}%]`.padStart(14),
    );
  }

  // Strength bucket analysis for each signal
  console.log('\n--- Hit Rate by Strength Bucket ---\n');

  for (const [name, signalRows] of bySignal) {
    const buckets: Record<string, { n: number; correct: number }> = {
      'strong (>0.7)': { n: 0, correct: 0 },
      'medium (0.3-0.7)': { n: 0, correct: 0 },
      'weak (<0.3)': { n: 0, correct: 0 },
    };

    for (const row of signalRows) {
      const signalMatchedOutcome = row.signal_direction === row.actual_result;
      const bucket = row.signal_value >= 0.7 ? 'strong (>0.7)' :
        row.signal_value >= 0.3 ? 'medium (0.3-0.7)' : 'weak (<0.3)';
      buckets[bucket].n++;
      if (signalMatchedOutcome) buckets[bucket].correct++;
    }

    const parts: string[] = [];
    for (const [bucket, data] of Object.entries(buckets)) {
      if (data.n >= 5) {
        parts.push(`${bucket}: ${((data.correct / data.n) * 100).toFixed(1)}% (n=${data.n})`);
      }
    }
    if (parts.length > 0) {
      console.log(`  ${name}: ${parts.join(' | ')}`);
    }
  }
}

function printSignalContribution(db: Database.Database): void {
  console.log('\n' + '='.repeat(100));
  console.log('SIGNAL CONTRIBUTION ANALYSIS');
  console.log('='.repeat(100));
  console.log('(Positive = signal helped, Negative = signal hurt)\n');

  const outcomes = getDecisionOutcomes(db);

  const signalContrib = new Map<string, { helped: number; hurt: number; neutral: number }>();

  for (const outcome of outcomes) {
    const signals = db.prepare(`
      SELECT signal_name, signal_direction, signal_value
      FROM signal_snapshots
      WHERE decision_id = ? AND signal_value > 0
    `).all(outcome.decision_id) as SignalRow[];

    for (const sig of signals) {
      const entry = signalContrib.get(sig.signal_name) ?? { helped: 0, hurt: 0, neutral: 0 };
      const signalWasRight = sig.signal_direction === outcome.actual_result;
      const decisionWasRight = outcome.was_correct === 1;

      if (signalWasRight && decisionWasRight) {
        entry.helped++;
      } else if (!signalWasRight && !decisionWasRight) {
        entry.hurt++;
      } else if (signalWasRight && !decisionWasRight) {
        entry.neutral++;
      } else {
        entry.neutral++;
      }

      signalContrib.set(sig.signal_name, entry);
    }
  }

  console.log(
    'Signal'.padEnd(20) +
    'Helped'.padStart(8) +
    'Hurt'.padStart(8) +
    'Mixed'.padStart(8) +
    'NetContrib'.padStart(12) +
    '  Assessment',
  );
  console.log('-'.repeat(70));

  for (const [name, data] of signalContrib) {
    const total = data.helped + data.hurt + data.neutral;
    const net = data.helped - data.hurt;
    const netPct = total > 0 ? net / total : 0;
    let assessment = '';
    if (netPct > 0.1) assessment = 'POSITIVE contributor';
    else if (netPct < -0.1) assessment = 'NEGATIVE — consider reducing weight';
    else assessment = 'Marginal impact';

    console.log(
      name.padEnd(20) +
      String(data.helped).padStart(8) +
      String(data.hurt).padStart(8) +
      String(data.neutral).padStart(8) +
      `${net >= 0 ? '+' : ''}${net} (${(netPct * 100).toFixed(1)}%)`.padStart(12) +
      `  ${assessment}`,
    );
  }
}

function printThresholdSweep(db: Database.Database): void {
  console.log('\n' + '='.repeat(100));
  console.log('COMPOSITE SCORE THRESHOLD SWEEP');
  console.log('='.repeat(100) + '\n');

  const outcomes = getDecisionOutcomes(db);

  const thresholds = [0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40];

  console.log(
    'Threshold'.padEnd(14) +
    'N'.padStart(6) +
    'Correct'.padStart(9) +
    'HitRate'.padStart(9) +
    'AvgPnL'.padStart(9) +
    'TotalPnL'.padStart(10) +
    'Wilson95'.padStart(14),
  );
  console.log('-'.repeat(71));

  for (const threshold of thresholds) {
    const filtered = outcomes.filter((o) => Math.abs(o.composite_score) >= threshold);
    if (filtered.length === 0) continue;

    const correct = filtered.filter((o) => o.was_correct === 1).length;
    const hitRate = correct / filtered.length;
    const totalPnl = filtered.reduce((s, o) => s + o.theoretical_pnl, 0);
    const avgPnl = totalPnl / filtered.length;
    const wilson = wilsonCI(correct, filtered.length);

    console.log(
      `|score| >= ${threshold.toFixed(2)}`.padEnd(14) +
      String(filtered.length).padStart(6) +
      String(correct).padStart(9) +
      `${(hitRate * 100).toFixed(1)}%`.padStart(9) +
      `$${avgPnl.toFixed(3)}`.padStart(9) +
      `$${totalPnl.toFixed(2)}`.padStart(10) +
      `[${(wilson.lower * 100).toFixed(0)}-${(wilson.upper * 100).toFixed(0)}%]`.padStart(14),
    );
  }
}

function printRegimeBreakdown(db: Database.Database): void {
  console.log('\n' + '='.repeat(100));
  console.log('REGIME BREAKDOWN');
  console.log('='.repeat(100) + '\n');

  const outcomes = getDecisionOutcomes(db);
  const regimes: Array<Regime | null> = ['trending', 'choppy_dangerous', 'choppy_boring', 'dead', null];

  console.log(
    'Regime'.padEnd(22) +
    'N'.padStart(6) +
    'Correct'.padStart(9) +
    'HitRate'.padStart(9) +
    'AvgPnL'.padStart(9) +
    'Wilson95'.padStart(14),
  );
  console.log('-'.repeat(69));

  for (const regime of regimes) {
    const filtered = regime === null
      ? outcomes.filter((o) => o.regime === null)
      : outcomes.filter((o) => o.regime === regime);

    if (filtered.length === 0) continue;

    const correct = filtered.filter((o) => o.was_correct === 1).length;
    const hitRate = correct / filtered.length;
    const avgPnl = filtered.reduce((s, o) => s + o.theoretical_pnl, 0) / filtered.length;
    const wilson = wilsonCI(correct, filtered.length);

    console.log(
      (regime ?? 'unknown').padEnd(22) +
      String(filtered.length).padStart(6) +
      String(correct).padStart(9) +
      `${(hitRate * 100).toFixed(1)}%`.padStart(9) +
      `$${avgPnl.toFixed(3)}`.padStart(9) +
      `[${(wilson.lower * 100).toFixed(0)}-${(wilson.upper * 100).toFixed(0)}%]`.padStart(14),
    );
  }
}

function printTimeOfDay(db: Database.Database): void {
  console.log('\n' + '='.repeat(100));
  console.log('TIME-OF-DAY ANALYSIS');
  console.log('='.repeat(100) + '\n');

  const outcomes = getDecisionOutcomes(db);

  const byHour = new Map<number, { total: number; correct: number; pnl: number }>();

  for (const o of outcomes) {
    const dt = o.decision_timestamp.endsWith('Z') ? o.decision_timestamp : o.decision_timestamp + 'Z';
    const hour = new Date(dt).getUTCHours();
    const entry = byHour.get(hour) ?? { total: 0, correct: 0, pnl: 0 };
    entry.total++;
    if (o.was_correct === 1) entry.correct++;
    entry.pnl += o.theoretical_pnl;
    byHour.set(hour, entry);
  }

  const sortedHours = Array.from(byHour.entries()).sort((a, b) => a[0] - b[0]);

  console.log('Hour(UTC)'.padEnd(12) + 'N'.padStart(6) + 'HitRate'.padStart(9) + 'PnL'.padStart(9) + '  Bar');
  console.log('-'.repeat(65));

  for (const [hour, data] of sortedHours) {
    if (data.total < 3) continue;
    const hitRate = data.correct / data.total;
    const barLength = Math.round(hitRate * 30);
    const bar = '#'.repeat(barLength) + ' '.repeat(30 - barLength);
    console.log(
      `${String(hour).padStart(2)}:00`.padEnd(12) +
      String(data.total).padStart(6) +
      `${(hitRate * 100).toFixed(1)}%`.padStart(9) +
      `$${data.pnl.toFixed(2)}`.padStart(9) +
      `  |${bar}|`,
    );
  }
}

function printAssetComparison(db: Database.Database): void {
  console.log('\n' + '='.repeat(100));
  console.log('ASSET COMPARISON');
  console.log('='.repeat(100) + '\n');

  const outcomes = getDecisionOutcomes(db);
  const assets = new Set(outcomes.map((o) => o.asset));

  console.log(
    'Asset'.padEnd(8) +
    'N'.padStart(6) +
    'Correct'.padStart(9) +
    'HitRate'.padStart(9) +
    'TotalPnL'.padStart(10) +
    'AvgPnL'.padStart(9) +
    'Wilson95'.padStart(14),
  );
  console.log('-'.repeat(65));

  for (const asset of assets) {
    const filtered = outcomes.filter((o) => o.asset === asset);
    const correct = filtered.filter((o) => o.was_correct === 1).length;
    const hitRate = correct / filtered.length;
    const totalPnl = filtered.reduce((s, o) => s + o.theoretical_pnl, 0);
    const avgPnl = totalPnl / filtered.length;
    const wilson = wilsonCI(correct, filtered.length);

    console.log(
      asset.padEnd(8) +
      String(filtered.length).padStart(6) +
      String(correct).padStart(9) +
      `${(hitRate * 100).toFixed(1)}%`.padStart(9) +
      `$${totalPnl.toFixed(2)}`.padStart(10) +
      `$${avgPnl.toFixed(3)}`.padStart(9) +
      `[${(wilson.lower * 100).toFixed(0)}-${(wilson.upper * 100).toFixed(0)}%]`.padStart(14),
    );
  }
}

function printWeightOptimization(db: Database.Database): void {
  console.log('\n' + '='.repeat(100));
  console.log('WEIGHT OPTIMIZATION SUGGESTIONS');
  console.log('='.repeat(100) + '\n');

  const outcomes = getDecisionOutcomes(db);

  // Current weights from bot config
  const currentWeights: Record<string, number> = {
    momentum: 0.30,
    'order-flow': 0.25,
    'cross-asset-lag': 0.15,
    'funding-rate': 0.10,
    'mean-reversion': 0.10,
  };

  const signalStats = new Map<string, { total: number; correct: number; totalConfidence: number }>();

  for (const outcome of outcomes) {
    const signals = db.prepare(`
      SELECT signal_name, signal_direction, signal_value, signal_confidence
      FROM signal_snapshots
      WHERE decision_id = ? AND signal_value > 0
    `).all(outcome.decision_id) as SignalRow[];

    for (const sig of signals) {
      const entry = signalStats.get(sig.signal_name) ?? { total: 0, correct: 0, totalConfidence: 0 };
      entry.total++;
      if (sig.signal_direction === outcome.actual_result) entry.correct++;
      entry.totalConfidence += sig.signal_confidence;
      signalStats.set(sig.signal_name, entry);
    }
  }

  console.log(
    'Signal'.padEnd(20) +
    'CurWeight'.padStart(10) +
    'N'.padStart(6) +
    'OwnHit'.padStart(9) +
    'Edge'.padStart(8) +
    'SugWeight'.padStart(11) +
    '  Action',
  );
  console.log('-'.repeat(80));

  const edges: Array<{ name: string; edge: number }> = [];

  for (const [name, data] of signalStats) {
    const hitRate = data.total > 0 ? data.correct / data.total : 0;
    const edge = hitRate - 0.5;
    const curWeight = currentWeights[name] ?? 0;

    edges.push({ name, edge: Math.max(0, edge) });

    let action = '';
    if (hitRate < 0.48) action = 'DISABLE — anti-predictive';
    else if (hitRate < 0.52 && data.total >= 30) action = 'REDUCE — noise';
    else if (hitRate > 0.55 && curWeight < 0.20) action = 'INCREASE — underweight';
    else if (hitRate > 0.55) action = 'Keep or increase';
    else action = data.total < 30 ? 'Insufficient data' : 'Keep current';

    console.log(
      name.padEnd(20) +
      (curWeight > 0 ? curWeight.toFixed(2) : 'N/A').padStart(10) +
      String(data.total).padStart(6) +
      `${(hitRate * 100).toFixed(1)}%`.padStart(9) +
      `${(edge * 100).toFixed(1)}%`.padStart(8) +
      ''.padStart(11) +
      `  ${action}`,
    );
  }

  // Compute suggested weights proportional to edge
  const positiveEdges = edges.filter((e) => e.edge > 0);
  const totalEdge = positiveEdges.reduce((s, e) => s + e.edge, 0);

  if (totalEdge > 0 && positiveEdges.length > 0) {
    console.log('\nSuggested weights (edge-proportional):\n');
    for (const e of positiveEdges.sort((a, b) => b.edge - a.edge)) {
      const suggested = e.edge / totalEdge;
      const current = currentWeights[e.name] ?? 0;
      const delta = suggested - current;
      console.log(
        `  ${e.name}: ${(suggested * 100).toFixed(1)}% ` +
        `(was ${(current * 100).toFixed(1)}%, ` +
        `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}pp)`,
      );
    }
  }
}

function printConvictionAnalysis(db: Database.Database): void {
  console.log('\n' + '='.repeat(100));
  console.log('CONVICTION TIER ANALYSIS');
  console.log('='.repeat(100) + '\n');

  const outcomes = getDecisionOutcomes(db);
  const tiers = ['HIGH', 'MODERATE', 'LOW', null];

  console.log(
    'Tier'.padEnd(12) +
    'N'.padStart(6) +
    'Correct'.padStart(9) +
    'HitRate'.padStart(9) +
    'AvgPnL'.padStart(9) +
    'TotalPnL'.padStart(10) +
    'Wilson95'.padStart(14),
  );
  console.log('-'.repeat(69));

  for (const tier of tiers) {
    const filtered = outcomes.filter((o) => o.conviction === tier);
    if (filtered.length === 0) continue;

    const correct = filtered.filter((o) => o.was_correct === 1).length;
    const hitRate = correct / filtered.length;
    const totalPnl = filtered.reduce((s, o) => s + o.theoretical_pnl, 0);
    const avgPnl = totalPnl / filtered.length;
    const wilson = wilsonCI(correct, filtered.length);

    console.log(
      (tier ?? 'unknown').padEnd(12) +
      String(filtered.length).padStart(6) +
      String(correct).padStart(9) +
      `${(hitRate * 100).toFixed(1)}%`.padStart(9) +
      `$${avgPnl.toFixed(3)}`.padStart(9) +
      `$${totalPnl.toFixed(2)}`.padStart(10) +
      `[${(wilson.lower * 100).toFixed(0)}-${(wilson.upper * 100).toFixed(0)}%]`.padStart(14),
    );
  }
}

function printSecondPassAnalysis(db: Database.Database): void {
  console.log('\n' + '='.repeat(100));
  console.log('FIRST PASS vs SECOND PASS');
  console.log('='.repeat(100) + '\n');

  const outcomes = getDecisionOutcomes(db);

  for (const pass of [0, 1]) {
    const filtered = outcomes.filter((o) => o.is_second_pass === pass);
    if (filtered.length === 0) continue;

    const correct = filtered.filter((o) => o.was_correct === 1).length;
    const hitRate = correct / filtered.length;
    const totalPnl = filtered.reduce((s, o) => s + o.theoretical_pnl, 0);
    const wilson = wilsonCI(correct, filtered.length);

    console.log(
      `  ${pass === 0 ? 'First pass' : 'Second pass'}: ` +
      `${correct}/${filtered.length} correct (${(hitRate * 100).toFixed(1)}%), ` +
      `PnL $${totalPnl.toFixed(2)}, ` +
      `95% CI [${(wilson.lower * 100).toFixed(0)}-${(wilson.upper * 100).toFixed(0)}%]`,
    );
  }
}

main();

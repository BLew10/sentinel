import 'dotenv/config';
import { getSupabaseServerClient } from '../lib/db';
import { SCORE_WEIGHTS } from '../lib/utils/constants';
import * as fs from 'fs';
import * as path from 'path';

function pearsonCorrelation(x: number[], y: number[]): number | null {
  if (x.length !== y.length || x.length < 5) return null;
  const n = x.length;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  if (den === 0) return null;
  return num / den;
}

async function main() {
  console.log('=== Sentinel: Weight Optimization Analysis ===\n');

  const db = getSupabaseServerClient();

  const { data: snapshots } = await db
    .from('signal_snapshots')
    .select('technical_score, fundamental_score, earnings_ai_score, insider_score, institutional_score, news_sentiment_score, options_flow_score, sentinel_score, return_30d, alpha_30d')
    .not('return_30d', 'is', null)
    .not('technical_score', 'is', null);

  if (!snapshots || snapshots.length < 20) {
    console.log(`Insufficient data: ${snapshots?.length ?? 0} snapshots with scores and returns.`);
    console.log('Run backtest + backfill-returns first to populate scored snapshots.');
    return;
  }

  console.log(`Analyzing ${snapshots.length} snapshots with complete data\n`);

  const SUB_SCORES = [
    { key: 'technical_score', label: 'Technical', currentWeight: SCORE_WEIGHTS.technical },
    { key: 'fundamental_score', label: 'Fundamental', currentWeight: SCORE_WEIGHTS.fundamental },
    { key: 'earnings_ai_score', label: 'Earnings AI', currentWeight: SCORE_WEIGHTS.earnings_ai },
    { key: 'insider_score', label: 'Insider', currentWeight: SCORE_WEIGHTS.insider },
    { key: 'institutional_score', label: 'Institutional', currentWeight: SCORE_WEIGHTS.institutional },
    { key: 'news_sentiment_score', label: 'News Sentiment', currentWeight: SCORE_WEIGHTS.news_sentiment },
    { key: 'options_flow_score', label: 'Estimate Revision', currentWeight: SCORE_WEIGHTS.estimate_revision },
  ] as const;

  const results: Array<{
    label: string;
    currentWeight: number;
    correlationReturn: number | null;
    correlationAlpha: number | null;
    avgReturnHigh: number | null;
    avgReturnLow: number | null;
    predictivePower: number;
    suggestedWeight: number;
  }> = [];

  for (const sub of SUB_SCORES) {
    const paired = snapshots
      .filter((s) => (s as Record<string, unknown>)[sub.key] != null && s.return_30d != null)
      .map((s) => ({
        score: Number((s as Record<string, unknown>)[sub.key]),
        return30d: Number(s.return_30d),
        alpha30d: s.alpha_30d != null ? Number(s.alpha_30d) : null,
      }));

    if (paired.length < 10) {
      results.push({
        label: sub.label,
        currentWeight: sub.currentWeight,
        correlationReturn: null,
        correlationAlpha: null,
        avgReturnHigh: null,
        avgReturnLow: null,
        predictivePower: 0,
        suggestedWeight: sub.currentWeight,
      });
      continue;
    }

    const scores = paired.map((p) => p.score);
    const returns = paired.map((p) => p.return30d);
    const alphas = paired.filter((p) => p.alpha30d != null).map((p) => p.alpha30d!);
    const alphaScores = paired.filter((p) => p.alpha30d != null).map((p) => p.score);

    const corrReturn = pearsonCorrelation(scores, returns);
    const corrAlpha = alphaScores.length >= 10 ? pearsonCorrelation(alphaScores, alphas) : null;

    // Split into high-score (top 25%) and low-score (bottom 25%) groups
    const sorted = [...paired].sort((a, b) => a.score - b.score);
    const q1 = Math.floor(sorted.length * 0.25);
    const q3 = Math.floor(sorted.length * 0.75);
    const lowGroup = sorted.slice(0, q1);
    const highGroup = sorted.slice(q3);

    const avgReturnHigh = highGroup.length > 0 ? highGroup.reduce((a, b) => a + b.return30d, 0) / highGroup.length : null;
    const avgReturnLow = lowGroup.length > 0 ? lowGroup.reduce((a, b) => a + b.return30d, 0) / lowGroup.length : null;

    // Predictive power: combination of correlation and high-low spread
    const spread = avgReturnHigh != null && avgReturnLow != null ? avgReturnHigh - avgReturnLow : 0;
    const corrStrength = Math.abs(corrReturn ?? 0);
    const predictivePower = corrStrength * 0.6 + Math.min(Math.abs(spread) * 10, 1) * 0.4;

    results.push({
      label: sub.label,
      currentWeight: sub.currentWeight,
      correlationReturn: corrReturn,
      correlationAlpha: corrAlpha,
      avgReturnHigh,
      avgReturnLow,
      predictivePower,
      suggestedWeight: sub.currentWeight,
    });
  }

  // Compute suggested weights proportional to predictive power
  const totalPredictive = results.reduce((a, b) => a + b.predictivePower, 0);
  if (totalPredictive > 0) {
    const totalOriginalWeight = results.reduce((a, b) => a + b.currentWeight, 0);
    for (const r of results) {
      r.suggestedWeight = Math.round((r.predictivePower / totalPredictive) * totalOriginalWeight);
    }
    // Ensure sum = 100
    const suggestedTotal = results.reduce((a, b) => a + b.suggestedWeight, 0);
    if (suggestedTotal !== 100) {
      results.sort((a, b) => b.suggestedWeight - a.suggestedWeight);
      results[0].suggestedWeight += 100 - suggestedTotal;
    }
  }

  // --- Print Report ---
  console.log('Sub-Score Analysis (30-day forward returns):\n');
  console.log(`${'Score'.padEnd(18)} | ${'Weight'.padStart(6)} | ${'Corr(r)'.padStart(8)} | ${'Corr(α)'.padStart(8)} | ${'High Q'.padStart(8)} | ${'Low Q'.padStart(8)} | ${'Power'.padStart(6)} | ${'Suggested'.padStart(9)}`);
  console.log('-'.repeat(95));

  for (const r of results) {
    const corrR = r.correlationReturn != null ? r.correlationReturn.toFixed(3) : '   N/A';
    const corrA = r.correlationAlpha != null ? r.correlationAlpha.toFixed(3) : '   N/A';
    const highQ = r.avgReturnHigh != null ? `${(r.avgReturnHigh * 100).toFixed(1)}%` : '  N/A';
    const lowQ = r.avgReturnLow != null ? `${(r.avgReturnLow * 100).toFixed(1)}%` : '  N/A';

    console.log(
      `${r.label.padEnd(18)} | ${String(r.currentWeight).padStart(5)}% | ${corrR.padStart(8)} | ${corrA.padStart(8)} | ${highQ.padStart(8)} | ${lowQ.padStart(8)} | ${r.predictivePower.toFixed(3).padStart(6)} | ${String(r.suggestedWeight).padStart(8)}%`
    );
  }

  // Composite score correlation
  const compositePaired = snapshots
    .filter((s) => s.sentinel_score != null)
    .map((s) => ({
      score: Number(s.sentinel_score),
      return30d: Number(s.return_30d),
    }));

  if (compositePaired.length >= 10) {
    const corrComposite = pearsonCorrelation(
      compositePaired.map((p) => p.score),
      compositePaired.map((p) => p.return30d),
    );
    console.log(`\nComposite Sentinel Score correlation with 30d return: ${corrComposite?.toFixed(3) ?? 'N/A'}`);
  }

  // --- Write report to file ---
  const reportLines = [
    `# Sentinel Weight Optimization Report`,
    ``,
    `Generated: ${new Date().toISOString()}`,
    `Snapshots analyzed: ${snapshots.length}`,
    ``,
    `## Current vs Suggested Weights`,
    ``,
    `| Sub-Score | Current | Corr(return) | Corr(alpha) | High Q Avg | Low Q Avg | Predictive Power | Suggested |`,
    `|-----------|---------|-------------|-------------|-----------|----------|-----------------|-----------|`,
    ...results.map((r) => {
      const corrR = r.correlationReturn != null ? r.correlationReturn.toFixed(3) : 'N/A';
      const corrA = r.correlationAlpha != null ? r.correlationAlpha.toFixed(3) : 'N/A';
      const highQ = r.avgReturnHigh != null ? `${(r.avgReturnHigh * 100).toFixed(2)}%` : 'N/A';
      const lowQ = r.avgReturnLow != null ? `${(r.avgReturnLow * 100).toFixed(2)}%` : 'N/A';
      return `| ${r.label} | ${r.currentWeight}% | ${corrR} | ${corrA} | ${highQ} | ${lowQ} | ${r.predictivePower.toFixed(3)} | ${r.suggestedWeight}% |`;
    }),
    ``,
    `## Interpretation`,
    ``,
    `- **Corr(return)**: Pearson correlation between sub-score and 30-day forward return. Positive = higher score predicts higher returns.`,
    `- **Corr(alpha)**: Same but against alpha (excess return vs SPY). More meaningful since it isolates stock-specific signal from market beta.`,
    `- **High/Low Q**: Average 30-day return for top-25% vs bottom-25% scored stocks. Larger spread = more discriminating signal.`,
    `- **Predictive Power**: Combined metric (60% correlation strength + 40% quartile spread). Used to derive suggested weights.`,
    ``,
    `## Notes`,
    ``,
    `- Stubbed sub-scores (options_flow at 50 for all) will show zero predictive power — expected.`,
    `- Small sample sizes reduce correlation reliability. Minimum 20 snapshots recommended per sub-score.`,
    `- These are suggestions, not prescriptions. Market regime changes can invalidate historical correlations.`,
  ];

  const reportPath = path.join(process.cwd(), 'docs', 'weight-optimization-report.md');
  fs.writeFileSync(reportPath, reportLines.join('\n'));
  console.log(`\nReport written to ${reportPath}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

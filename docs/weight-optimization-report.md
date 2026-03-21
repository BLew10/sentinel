# Sentinel Weight Optimization Report

Generated: 2026-03-21T03:51:39.494Z
Snapshots analyzed: 193

## Current vs Suggested Weights

| Sub-Score | Current | Corr(return) | Corr(alpha) | High Q Avg | Low Q Avg | Predictive Power | Suggested |
|-----------|---------|-------------|-------------|-----------|----------|-----------------|-----------|
| Technical | 28% | 0.090 | 0.095 | 3.50% | -2.47% | 0.293 | 100% |
| Fundamental | 15% | N/A | N/A | N/A | N/A | 0.000 | 0% |
| Earnings AI | 22% | N/A | N/A | N/A | N/A | 0.000 | 0% |
| Insider | 15% | N/A | N/A | N/A | N/A | 0.000 | 0% |
| Institutional | 10% | N/A | N/A | N/A | N/A | 0.000 | 0% |
| News Sentiment | 5% | N/A | N/A | N/A | N/A | 0.000 | 0% |
| Options Flow | 5% | N/A | N/A | N/A | N/A | 0.000 | 0% |

## Interpretation

- **Corr(return)**: Pearson correlation between sub-score and 30-day forward return. Positive = higher score predicts higher returns.
- **Corr(alpha)**: Same but against alpha (excess return vs SPY). More meaningful since it isolates stock-specific signal from market beta.
- **High/Low Q**: Average 30-day return for top-25% vs bottom-25% scored stocks. Larger spread = more discriminating signal.
- **Predictive Power**: Combined metric (60% correlation strength + 40% quartile spread). Used to derive suggested weights.

## Notes

- Stubbed sub-scores (options_flow at 50 for all) will show zero predictive power — expected.
- Small sample sizes reduce correlation reliability. Minimum 20 snapshots recommended per sub-score.
- These are suggestions, not prescriptions. Market regime changes can invalidate historical correlations.
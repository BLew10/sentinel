# /backtest-signal

For the signal type I specify:

1. Read the signal's scoring function and flag detection logic
2. Write a backtest script in scripts/ that:
   - Pulls historical data from Financial Datasets API (specify date range)
   - At each historical point, computes what flags would have fired
   - Looks up forward returns at 7d, 14d, 30d, 60d, 90d
   - Compares to SPY return over the same period (alpha calculation)
   - Stores results in signal_snapshots table with trigger_type='backtest'
3. After running the backtest, call computeSignalPerformance() to aggregate stats
4. Display results: win rate, avg return, avg alpha, sample size, best/worst

Reference the "Historical Backtesting" section of SENTINEL_PROJECT_PLAN.md.

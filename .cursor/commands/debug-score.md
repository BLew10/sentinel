# /debug-score

I'm investigating why a stock has an unexpected Sentinel Score.

For the symbol I provide:
1. Query sentinel_scores table for the current composite and component scores
2. For any component score that seems off, query the underlying signal table
3. Trace through the scoring function logic to explain why the score is what it is
4. If there's a bug in the scoring logic, fix it
5. If the data is stale or missing, identify which cron job should have updated it

Show me the full score breakdown and explain each component.

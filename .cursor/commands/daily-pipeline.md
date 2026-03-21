# /daily-pipeline

Walk me through the entire daily data pipeline, step by step:

1. Check each cron job in order (6:00 AM → 7:30 AM)
2. For each cron job:
   - Verify the route file exists in app/api/cron/
   - Verify it calls the correct lib/ functions
   - Verify the database tables are being populated
   - Check for any broken dependencies
3. Identify any gaps: data that should flow from one step to the next but doesn't
4. Suggest fixes for any issues found

Reference the "Cron Job Schedule" section of SENTINEL_PROJECT_PLAN.md.

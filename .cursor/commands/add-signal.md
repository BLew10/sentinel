# /add-signal

I want to add a new signal to the Sentinel scoring system.

For the signal I describe, follow this exact checklist:

1. **Database**: Add the necessary columns/table to store the raw signal data
   and the AI-analyzed output. Follow the patterns in the existing schema.

2. **Data Ingestion**: Create or update the API wrapper function in lib/ to
   pull the raw data. Add caching to avoid redundant API calls.

3. **Analyzer**: Create lib/analyzers/{signal-name}.ts with:
   - A scoring function that returns 0-100
   - A flag detection function that returns typed flag enums
   - An AI analysis prompt (if applicable)
   - Export TypeScript types for the signal data

4. **Integration**: Wire the new signal into lib/scoring.ts:
   - Add the score to the composite Sentinel Score calculation
   - Update weight allocation (must still sum to 100)

5. **Performance Tracking**: Ensure the new signal type is included in:
   - signal_snapshots (the trigger_detail should capture the new flags)
   - computeSignalPerformance() signal types list

6. **UI**: Add a display component for the stock detail page

7. **Discord**: Add alert triggers for notable occurrences of this signal

8. **Tests**: Write tests for the scoring function and flag detection

Always reference SENTINEL_PROJECT_PLAN.md for the existing patterns.

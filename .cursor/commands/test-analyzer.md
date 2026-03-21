# /test-analyzer

For the analyzer file I specify, do the following:

1. Read the analyzer's scoring function and flag detection function
2. Create a comprehensive test file at the corresponding path in tests/
3. Test cases must include:
   - Neutral baseline (no signals → score should be ~50)
   - Maximum bullish scenario (all positive signals → score should be 90+)
   - Maximum bearish scenario (all negative signals → score should be <20)
   - Each individual flag triggers correctly in isolation
   - Combinations of flags
   - Edge cases: missing data fields, null values, empty arrays
   - Score clamping: output never exceeds 0-100 range
4. Use vitest. Mock any external API calls.
5. Run the tests and show me results.

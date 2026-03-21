import 'dotenv/config';
import { computeAndStoreScores } from '../lib/scoring';

async function main() {
  console.log('=== Sentinel: Compute Scores ===\n');
  const start = Date.now();

  const { computed, errors } = await computeAndStoreScores();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n=== Complete in ${elapsed}s ===`);
  console.log(`Scored: ${computed}`);
  console.log(`Errors: ${errors}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

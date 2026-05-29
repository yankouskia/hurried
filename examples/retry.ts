/**
 * Retry — automatically re-run a flaky task with exponential backoff.
 *
 *   npm run example:retry
 */
import { Thread } from '../src/index.js';

// A task that "fails" its first two attempts, then succeeds. Per-worker
// globalThis state survives across retries because they reuse the same worker.
const flaky = (n: number) => {
  const g = globalThis as unknown as Record<string, number>;
  g.__attempts = (g.__attempts || 0) + 1;
  if (g.__attempts <= 2) throw new Error(`transient failure on attempt ${g.__attempts}`);
  return n * 10;
};

const thread = Thread.fromFunction(flaky);

const result = await thread.run(21, {
  retry: {
    retries: 3,
    minDelay: 50,
    factor: 2,
    onRetry: (error, attempt) =>
      console.log(`  ↻ attempt ${attempt} failed (${(error as Error).message}) — retrying…`),
  },
});

console.log('result =', result); // 210, after two retries

await thread.terminate();

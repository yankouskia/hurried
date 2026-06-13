/**
 * Settled — fault-tolerant batch: one bad item doesn't sink the whole run.
 *
 *   npm run example:settled
 */
import { mapParallelSettled } from '../src/index.js';

// Throws on multiples of 3; otherwise doubles. A normal mapParallel would reject
// the whole batch on the first failure — mapParallelSettled records each outcome.
const flaky = (n: number) => {
  if (n % 3 === 0) throw new Error(`cannot process ${n}`);
  return n * 2;
};

const results = await mapParallelSettled([1, 2, 3, 4, 5, 6], flaky, { concurrency: 3 });

const values: number[] = [];
let failed = 0;
for (const r of results) {
  if (r.status === 'fulfilled') values.push(r.value);
  else failed++;
}

console.log('statuses =', results.map((r) => r.status).join(', '));
console.log('values   =', values); // [2, 4, 8, 10]
console.log(`succeeded: ${values.length}, failed: ${failed}`);

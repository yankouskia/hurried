/**
 * Streaming — consume parallel results as an async iterator, as they complete.
 *
 *   npm run example:stream
 */
import { mapParallelStream } from '../src/index.js';

// A lazy source — pulled on demand, so it could just as easily be infinite.
function* jobs(): Generator<number> {
  for (let i = 1; i <= 12; i++) yield i;
}

// Each job does a little CPU work; bigger inputs take longer.
const work = (n: number) => {
  let total = 0;
  for (let i = 0; i < n * 5_000_000; i++) total += i;
  return { n, total };
};

console.log('as-completed (lowest latency to first result):');
for await (const { n } of mapParallelStream(jobs(), work, { concurrency: 4, ordered: false })) {
  console.log(`  ✓ job ${n} done`);
}

console.log('\nordered (input order, streamed):');
for await (const { n } of mapParallelStream(jobs(), work, { concurrency: 4 })) {
  console.log(`  ✓ job ${n} done`);
}

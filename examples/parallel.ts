/**
 * parallel() and mapParallel() — high-level helpers with no lifecycle management.
 *
 *   npm run example:parallel
 */
import { mapParallel, parallel } from '../src/index.js';

// 1) parallel — run a fixed set of independent inline tasks
const [a, b, c] = await parallel<number>([() => 1 + 1, () => Math.PI, () => Date.now() % 1000], {
  concurrency: 3,
});
console.log('parallel results:', { a, b, c });

// 2) mapParallel — apply the same task across many inputs (reuses a single pool)
const squared = await mapParallel([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], (n) => n * n, {
  concurrency: 4,
});
console.log('mapParallel results:', squared);

/**
 * Pool — fixed-size worker pool with task queueing.
 *
 *   npm run example:pool
 */
import { Pool } from '../src/index.js';

const pool = new Pool({
  size: 4,
  task: (n: number) => {
    let total = 0;
    for (let i = 0; i < n; i++) total += i;
    return total;
  },
});

const results = await pool.map([10_000_000, 20_000_000, 30_000_000, 40_000_000]);
console.log('sums =', results);
console.log('idle workers =', pool.idleCount);

await pool.terminate();

/**
 * Bus + Pool — aggregate progress from many workers, broadcast cancellation to all.
 *
 *   npm run example:bus-pool
 *
 * Showcases:
 *  - typed event aggregation across a worker pool
 *  - pool.emit() broadcasts to every worker (graceful cancellation)
 *  - main thread orchestrates many parallel workers without losing typing
 */
import { Pool } from '../src/index.js';

type Events = {
  progress: { workerLabel: string; done: number; total: number };
  done: { workerLabel: string };
};

const pool = new Pool<Events, { id: number; size: number }, number>({
  size: 4,
  task: (bus, { id, size }) => {
    const workerLabel = `worker-${id}`;
    let acc = 0;
    for (let i = 0; i < size; i++) {
      acc += i;
      if (i % Math.floor(size / 4) === 0) {
        bus.emit('progress', { workerLabel, done: i, total: size });
      }
    }
    bus.emit('done', { workerLabel });
    return acc;
  },
});

pool.on('progress', (p) => {
  console.log(`  ${p.workerLabel}: ${((p.done / p.total) * 100).toFixed(0)}%`);
});
pool.on('done', (d) => {
  console.log(`  ${d.workerLabel} finished`);
});

const inputs = [1, 2, 3, 4, 5, 6].map((id) => ({ id, size: 50_000_000 }));
const results = await pool.map(inputs);
console.log(`  sum of results: ${results.reduce((a, b) => a + b, 0)}`);

await pool.terminate();

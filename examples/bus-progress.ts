/**
 * Bus — live progress reporting from a CPU-bound task.
 *
 *   npm run example:bus-progress
 *
 * Showcases:
 *  - typed event map shared between main + worker
 *  - bus.emit() from inside the worker (no setInterval polling)
 *  - bus.on() in the main thread to stream progress
 */
import { Thread } from '../src/index.js';

type Events = {
  progress: { done: number; total: number; pctText: string };
  log: string;
};

const thread = Thread.fromFunction<Events, number, number>((bus, total) => {
  let acc = 0;
  for (let i = 0; i < total; i++) {
    acc += Math.sqrt(i);
    if (i % Math.floor(total / 20) === 0) {
      const pct = ((i / total) * 100).toFixed(0);
      bus.emit('progress', { done: i, total, pctText: `${pct}%` });
    }
  }
  bus.emit('log', 'task complete');
  return acc;
});

thread.on('progress', (p) => {
  process.stdout.write(
    `\r  progress: ${p.pctText} (${p.done.toLocaleString()}/${p.total.toLocaleString()})   `,
  );
});
thread.on('log', (msg) => {
  process.stdout.write(`\n  log: ${msg}\n`);
});

const result = await thread.run(50_000_000);
console.log(`  result: ${result.toFixed(0)}`);

await thread.terminate();

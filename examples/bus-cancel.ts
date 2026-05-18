/**
 * Bus — cooperative cancellation from the main thread to a long-running worker.
 *
 *   npm run example:bus-cancel
 *
 * Showcases:
 *  - bus.on() inside the worker for incoming control messages
 *  - void-payload events for signals like cancel/stop
 *  - graceful shutdown that lets the worker decide when to bail out
 */
import { Thread } from '../src/index.js';

type Events = {
  progress: { done: number };
  cancel: void;
  cancelled: { atIteration: number };
};

const thread = Thread.fromFunction<Events, number, 'completed' | 'cancelled'>(async (bus, n) => {
  let stop = false;
  bus.on('cancel', () => {
    stop = true;
  });

  // Yield to the event loop every chunk so incoming bus messages can be processed.
  const chunk = 5_000_000;
  for (let i = 0; i < n; i += chunk) {
    if (stop) {
      bus.emit('cancelled', { atIteration: i });
      return 'cancelled';
    }
    for (let j = 0; j < chunk && i + j < n; j++) {
      // pretend we're doing real work
      Math.sqrt(i + j);
    }
    bus.emit('progress', { done: i + chunk });
    await new Promise((r) => setImmediate(r));
  }
  return 'completed';
});

thread.on('progress', (p) => {
  console.log(`  progress: ${p.done.toLocaleString()}`);
});
thread.on('cancelled', (c) => {
  console.log(`  cancelled at iteration ${c.atIteration.toLocaleString()}`);
});

setTimeout(() => {
  console.log('  → main thread sending cancel');
  thread.emit('cancel');
}, 150);

const status = await thread.run(2_000_000_000);
console.log(`  status: ${status}`);

await thread.terminate();

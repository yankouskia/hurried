/**
 * Worker module for {@link ./typed-worker.ts}.
 *
 * Defines a typed event map AND a typed handler map. Both are shared with the main
 * thread for full type safety on either side of the worker boundary.
 */
import { createHash } from 'node:crypto';
import { defineWorker, workerBus } from '../src/index.js';

export type Events = {
  progress: { label: string; done: number; total: number };
  log: string;
};

const bus = workerBus<Events>();

export default defineWorker({
  hash(input: string): string {
    bus.emit('log', `hashing ${input.length} bytes`);
    return createHash('sha256').update(input).digest('hex');
  },

  countItems(items: string[]): number {
    items.forEach((item, i) => {
      bus.emit('progress', { label: 'countItems', done: i + 1, total: items.length });
    });
    return items.length;
  },
});

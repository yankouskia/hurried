import { isMainThread, parentPort } from 'node:worker_threads';
import { Bus, type EventMap } from './bus.js';
import { createBusMessage, isBusMessage } from './protocol.js';

let cachedBus: Bus<EventMap> | null = null;

/**
 * Obtain the worker-side {@link Bus} for a file-based worker module.
 *
 * Call this from inside your worker file (alongside {@link defineWorker} or
 * {@link makeExecutable}) to send events back to the main thread and listen for events
 * sent down from it. When called outside a worker it returns an inert bus — handy for
 * sharing the same worker module between tests and runtime.
 *
 * @example
 * ```ts
 * // worker.ts
 * import { defineWorker, workerBus } from 'hurried';
 *
 * type Events = {
 *   progress: { done: number; total: number };
 *   log: string;
 * };
 *
 * const bus = workerBus<Events>();
 *
 * export default defineWorker({
 *   process(items: string[]) {
 *     items.forEach((item, i) => {
 *       bus.emit('progress', { done: i + 1, total: items.length });
 *       bus.emit('log', `done: ${item}`);
 *     });
 *     return items.length;
 *   },
 * });
 * ```
 */
export function workerBus<TEvents extends EventMap = EventMap>(): Bus<TEvents> {
  if (cachedBus) return cachedBus as Bus<TEvents>;

  if (isMainThread || !parentPort) {
    cachedBus = new Bus<EventMap>();
    return cachedBus as Bus<TEvents>;
  }

  const port = parentPort;
  const bus = new Bus<TEvents>((event, payload) => {
    port.postMessage(createBusMessage(event, payload));
  });

  port.on('message', (msg: unknown) => {
    if (isBusMessage(msg)) bus.__publish(msg.event, msg.payload);
  });

  cachedBus = bus as Bus<EventMap>;
  return bus;
}

/** Test-only: reset the cached worker-side bus singleton. */
export function __resetWorkerBus(): void {
  cachedBus = null;
}

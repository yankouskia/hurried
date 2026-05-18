import { isMainThread, parentPort } from 'node:worker_threads';
import { createResponse, isRequestMessage, serializeError } from './protocol.js';
import type { HandlerMap } from './types.js';

/**
 * Register a single function as a named handler callable from the parent thread.
 *
 * When invoked from the main thread it is a no-op, making it safe to import a worker
 * module from regular code without side effects.
 *
 * @example
 * ```ts
 * // worker.ts
 * import { makeExecutable } from 'hurried';
 *
 * export function slow(n: number) { return n * 2; }
 * makeExecutable(slow, 'slow');
 *
 * // main.ts
 * const thread = Thread.fromFile(new URL('./worker.js', import.meta.url));
 * await thread.run('slow', 21); // 42
 * ```
 */
export function makeExecutable<TFn extends (...args: any[]) => any>(fn: TFn, name: string): void {
  if (isMainThread || !parentPort) return;

  parentPort.on('message', async (msg: unknown) => {
    if (!isRequestMessage(msg) || msg.name !== name) return;
    try {
      const result = await fn(...(msg.args as Parameters<TFn>));
      parentPort!.postMessage(createResponse(msg.id, true, result));
    } catch (e) {
      parentPort!.postMessage(createResponse(msg.id, false, undefined, serializeError(e)));
    }
  });
}

/**
 * Register a typed map of handlers in one call — a modern, ergonomic alternative to
 * calling {@link makeExecutable} for every function.
 *
 * @example
 * ```ts
 * // worker.ts
 * import { defineWorker } from 'hurried';
 *
 * export const handlers = defineWorker({
 *   double: (n: number) => n * 2,
 *   greet: (name: string) => `Hello, ${name}!`,
 * });
 *
 * export type Handlers = typeof handlers;
 *
 * // main.ts
 * const thread = Thread.fromFile<unknown, number>(new URL('./worker.js', import.meta.url));
 * await thread.run('double', 21); // 42
 * ```
 */
export function defineWorker<T extends HandlerMap>(handlers: T): T {
  if (isMainThread || !parentPort) return handlers;

  parentPort.on('message', async (msg: unknown) => {
    if (!isRequestMessage(msg)) return;
    const handler = handlers[msg.name];
    if (typeof handler !== 'function') return;
    try {
      const result = await handler(...msg.args);
      parentPort!.postMessage(createResponse(msg.id, true, result));
    } catch (e) {
      parentPort!.postMessage(createResponse(msg.id, false, undefined, serializeError(e)));
    }
  });

  return handlers;
}

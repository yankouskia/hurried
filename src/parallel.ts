import type { EventMap } from './bus.js';
import { TaskAbortedError } from './errors.js';
import { Pool } from './pool.js';
import { Thread } from './thread.js';
import type { ParallelOptions, Task } from './types.js';

/**
 * Run an array of inline functions in parallel, capping concurrency.
 *
 * Each function must be self-contained (no closure variables) — it's serialized into a
 * worker. Results come back in the same order as the inputs.
 *
 * @example
 * ```ts
 * const [a, b, c] = await parallel([
 *   () => heavyA(),
 *   () => heavyB(),
 *   () => heavyC(),
 * ]);
 * ```
 */
export async function parallel<T>(
  tasks: ReadonlyArray<() => T | Promise<T>>,
  options: ParallelOptions = {},
): Promise<T[]> {
  if (tasks.length === 0) return [];
  const { concurrency, signal, timeout } = options;

  const results = new Array<T>(tasks.length);
  const limit = Math.max(1, Math.min(concurrency ?? tasks.length, tasks.length));
  let cursor = 0;

  async function runOne(i: number): Promise<void> {
    if (signal?.aborted) throw new TaskAbortedError();
    const thread = Thread.fromFunction(tasks[i]! as Task<void, T>, { timeout });
    try {
      const callOpts = signal || timeout ? { signal, timeout } : undefined;
      results[i] = (await thread.run(undefined as unknown as void, callOpts)) as T;
    } finally {
      await thread.terminate();
    }
  }

  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (cursor < tasks.length) {
        const i = cursor++;
        if (i < tasks.length) await runOne(i);
      }
    }),
  );

  return results;
}

/**
 * Parallel-map an iterable through a single task using a worker pool.
 *
 * Much more efficient than {@link parallel} when running the same operation across many
 * inputs — the worker pool is reused for every element.
 *
 * @example
 * ```ts
 * const squared = await mapParallel(
 *   [1, 2, 3, 4, 5, 6, 7, 8],
 *   (n) => n * n,
 *   { concurrency: 4 },
 * );
 * ```
 */
export async function mapParallel<TArg, TResult>(
  items: ReadonlyArray<TArg>,
  task: Task<TArg, TResult>,
  options: ParallelOptions = {},
): Promise<TResult[]> {
  if (items.length === 0) return [];
  const { concurrency, signal, timeout } = options;
  const size = Math.max(1, Math.min(concurrency ?? items.length, items.length));

  const pool = new Pool<EventMap, TArg, TResult>({ task, size, timeout });
  try {
    const callOpts = signal || timeout ? { signal, timeout } : undefined;
    return (await pool.map(items, callOpts)) as TResult[];
  } finally {
    await pool.terminate();
  }
}

import type { EventMap } from './bus.js';
import { Pool } from './pool.js';
import type { ParallelOptions, Task } from './types.js';

/**
 * Run an array of inline functions in parallel, capping concurrency.
 *
 * Each function must be self-contained (no closure variables), since it is serialized
 * into a worker. Returns results in the same order as the inputs.
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

  // Each task is unique source, so we spin up a tiny pool per task. For high-throughput
  // identical workloads, prefer `mapParallel` which reuses a single pool.
  const results = new Array<T>(tasks.length);
  let cursor = 0;
  const limit = Math.max(1, Math.min(concurrency ?? tasks.length, tasks.length));

  const workers = Array.from({ length: limit }, async () => {
    while (true) {
      if (signal?.aborted) throw new Error('parallel: aborted');
      const i = cursor++;
      if (i >= tasks.length) return;
      const task = tasks[i]!;
      const pool = new Pool<EventMap, void, T>({
        size: 1,
        task: task as Task<void, T>,
        timeout,
      });
      try {
        results[i] = (await pool.run(undefined as unknown as void, { signal, timeout })) as T;
      } finally {
        await pool.terminate();
      }
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Parallel-map an iterable through a single task using a worker pool.
 *
 * Far more efficient than {@link parallel} when running the same operation across many
 * inputs — the pool of workers is reused for every element.
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
    return (await pool.map(
      items,
      signal ? { signal, timeout } : timeout ? { timeout } : undefined,
    )) as TResult[];
  } finally {
    await pool.terminate();
  }
}

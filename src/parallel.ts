import type { EventMap } from './bus.js';
import { TaskAbortedError } from './errors.js';
import { Pool } from './pool.js';
import type { StreamInput } from './stream.js';
import { Thread } from './thread.js';
import type { ParallelOptions, StreamOptions, Task } from './types.js';

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

/**
 * Streaming counterpart to {@link mapParallel}: parallel-map a source through a
 * single task and get the results back as an async iterator, yielded as they're
 * ready instead of buffered into one big array.
 *
 * The pool is created and torn down for you — including when you `break` out of
 * the loop early. The source is pulled lazily (it may be a generator, an async
 * iterable, or infinite) and at most `concurrency` items are outstanding at once,
 * so memory stays flat. Results come back in input order by default, or
 * as-completed with `{ ordered: false }` for the lowest latency to the first
 * result.
 *
 * @example
 * ```ts
 * for await (const parsed of mapParallelStream(readLines(file), parseLine, {
 *   concurrency: 8,
 *   ordered: false,
 * })) {
 *   save(parsed);
 * }
 * ```
 */
export async function* mapParallelStream<TArg, TResult>(
  items: StreamInput<TArg>,
  task: Task<TArg, TResult>,
  options: StreamOptions = {},
): AsyncGenerator<TResult, void, void> {
  const { concurrency, ordered, signal, timeout } = options;
  // The pool is spawned here, on first iteration — never on the bare call — so a
  // stream that's built but never consumed leaks no workers, and the try/finally
  // always tears the pool down once any work has started.
  const size =
    concurrency != null && Number.isFinite(concurrency)
      ? Math.max(1, Math.floor(concurrency))
      : undefined;
  const pool = new Pool<EventMap, TArg, TResult>(
    size ? { task, size, timeout } : { task, timeout },
  );
  try {
    yield* pool.stream(items, { ordered, signal, timeout });
  } finally {
    await pool.terminate();
  }
}

import { availableParallelism } from 'node:os';
import { Bus, type EmitArgs, type EventMap, type Unsubscribe } from './bus.js';
import { HurriedError, TaskAbortedError, TerminatedError } from './errors.js';
import { normalizeRetry, withRetry } from './retry.js';
import { streamResults, type StreamInput } from './stream.js';
import { Thread } from './thread.js';
import type { PoolOptions, RunOptions, StreamOptions } from './types.js';

interface QueueItem<TArg, TResult> {
  arg: TArg;
  options?: RunOptions;
  resolve: (value: TResult) => void;
  reject: (err: unknown) => void;
  /** Detaches the abort listener; called once the task settles, however it settles. */
  cleanup?: () => void;
}

/**
 * A fixed-size pool of worker threads that all execute the same inline task.
 *
 * Tasks are queued and dispatched to whichever worker is idle next — giving you
 * painless parallel CPU-bound work with bounded resource use, plus an aggregated
 * {@link Bus} for typed pub/sub with every worker.
 *
 * @example
 * ```ts
 * type Events = { progress: { done: number; total: number } };
 *
 * const pool = new Pool<Events, number, number>({
 *   size: 4,
 *   task: (bus, n) => {
 *     bus.emit('progress', { done: 0, total: n });
 *     return n * 2;
 *   },
 * });
 *
 * pool.on('progress', (p) => console.log(p));
 * await pool.map([1, 2, 3, 4]);
 * await pool.terminate();
 * ```
 */
export class Pool<TEvents extends EventMap = EventMap, TArg = unknown, TResult = unknown> {
  private readonly workers: Thread<TEvents, TArg, TResult>[];
  private readonly idle: Thread<TEvents, TArg, TResult>[];
  private readonly queue: QueueItem<TArg, TResult>[] = [];
  private readonly maxQueue: number;
  private readonly defaultTimeout: number | undefined;
  private readonly _bus: Bus<TEvents>;
  private terminated = false;

  constructor(options: PoolOptions<TEvents, TArg, TResult>) {
    const { task, size, maxQueue, timeout, ...threadOptions } = options;

    if (typeof task !== 'function') {
      throw new HurriedError('Pool requires a `task` function');
    }

    const requestedSize = Math.max(1, size ?? safeParallelism());
    this.maxQueue = maxQueue ?? Number.POSITIVE_INFINITY;
    this.defaultTimeout = timeout;

    const spawn = Thread.fromFunction as (
      fn: typeof task,
      opts?: typeof threadOptions & { timeout?: number },
    ) => Thread<TEvents, TArg, TResult>;

    this.workers = Array.from({ length: requestedSize }, () =>
      spawn(task, { ...threadOptions, timeout }),
    );
    this.idle = [...this.workers];

    this._bus = new Bus<TEvents>((event, payload) => {
      for (const worker of this.workers) {
        (worker.bus().emit as (e: string, p: unknown) => void)(event, payload);
      }
    });

    for (const worker of this.workers) {
      worker.bus().__forwardTo(this._bus as Bus<EventMap>);
    }
  }

  /** Number of worker threads in the pool. */
  get size(): number {
    return this.workers.length;
  }

  /** Number of workers currently idle (not running a task). */
  get idleCount(): number {
    return this.idle.length;
  }

  /** Number of tasks currently waiting in the queue. */
  get queueLength(): number {
    return this.queue.length;
  }

  /** True once {@link Pool.terminate} has been called. */
  get isTerminated(): boolean {
    return this.terminated;
  }

  /** Aggregated {@link Bus} for events from any worker; `emit` broadcasts to all. */
  bus(): Bus<TEvents> {
    return this._bus;
  }

  /** Listen for an event emitted by any worker. */
  on<K extends keyof TEvents & string>(
    event: K,
    listener: (payload: TEvents[K]) => void,
  ): Unsubscribe {
    return this._bus.on(event, listener);
  }

  /** One-shot listener for an event emitted by any worker. */
  once<K extends keyof TEvents & string>(
    event: K,
    listener: (payload: TEvents[K]) => void,
  ): Unsubscribe {
    return this._bus.once(event, listener);
  }

  /** Remove a listener. */
  off<K extends keyof TEvents & string>(event: K, listener: (payload: TEvents[K]) => void): void {
    this._bus.off(event, listener);
  }

  /** Broadcast an event to every worker in the pool. */
  emit<K extends keyof TEvents & string>(event: K, ...args: EmitArgs<TEvents[K]>): void {
    (this._bus.emit as (e: K, ...a: EmitArgs<TEvents[K]>) => void)(event, ...args);
  }

  /** Execute the pool's task once with the given argument. */
  run(arg: TArg, options?: RunOptions): Promise<TResult> {
    const retry = normalizeRetry(options?.retry);
    if (!retry) return this.runOnce(arg, options);
    if (options?.transferList && options.transferList.length > 0) {
      return Promise.reject(
        new HurriedError(
          '`retry` cannot be combined with `transferList`: transferred objects are detached after the first attempt and cannot be re-sent',
        ),
      );
    }
    // The pool owns retrying — strip `retry` from the per-attempt options so the
    // worker thread doesn't retry again (which would multiply attempts). Each
    // retry re-enqueues, so a transient worker failure can land on a healthy one.
    const { retry: _retry, ...perAttempt } = options ?? {};
    return withRetry(() => this.runOnce(arg, perAttempt), retry, options?.signal);
  }

  private runOnce(arg: TArg, options?: RunOptions): Promise<TResult> {
    if (this.terminated) return Promise.reject(new TerminatedError());

    if (options?.signal?.aborted) {
      return Promise.reject(new TaskAbortedError());
    }

    if (this.queue.length >= this.maxQueue) {
      return Promise.reject(new HurriedError(`Pool queue is full (max ${this.maxQueue})`));
    }

    return new Promise<TResult>((resolve, reject) => {
      const item: QueueItem<TArg, TResult> = { arg, options, resolve, reject };
      if (options?.signal) {
        const signal = options.signal;
        const onAbort = () => {
          const idx = this.queue.indexOf(item);
          if (idx !== -1) {
            this.queue.splice(idx, 1);
            item.cleanup?.();
            reject(new TaskAbortedError());
          }
        };
        signal.addEventListener('abort', onAbort, { once: true });
        // Removed on settle so streaming a long/infinite source with a shared
        // signal doesn't accumulate one listener per item.
        item.cleanup = () => signal.removeEventListener('abort', onAbort);
      }
      this.queue.push(item);
      this.drain();
    });
  }

  /** Map a list of inputs through the pool. Preserves input order in the output. */
  map(args: ReadonlyArray<TArg>, options?: RunOptions): Promise<TResult[]> {
    return Promise.all(args.map((arg) => this.run(arg, options)));
  }

  /**
   * Stream inputs through the pool as an async iterator, yielding each result as
   * it's ready instead of buffering them all.
   *
   * Unlike {@link Pool.map}, the source is pulled **lazily** — only when a worker
   * frees up — so it can be a generator, an async iterable, or even infinite, and
   * memory stays flat regardless of input size. Results are emitted in input
   * order by default, or as-completed (lowest latency) with `{ ordered: false }`.
   * `concurrency` is capped at the pool size to preserve backpressure. The pool is
   * left running and reusable after the stream ends; breaking out of the loop
   * early stops pulling the source.
   *
   * @example
   * ```ts
   * for await (const result of pool.stream(urls, { ordered: false })) {
   *   handle(result);   // arrives as soon as any worker finishes
   * }
   * ```
   */
  stream(
    items: StreamInput<TArg>,
    options: StreamOptions = {},
  ): AsyncGenerator<TResult, void, void> {
    const concurrency = Math.max(1, Math.min(options.concurrency ?? this.size, this.size));
    const ordered = options.ordered ?? true;
    const { signal, timeout, retry } = options;
    const callOptions = signal || timeout || retry ? { signal, timeout, retry } : undefined;
    return streamResults<TArg, TResult>(items, (arg) => this.run(arg, callOptions), {
      concurrency,
      ordered,
      signal,
    });
  }

  /** Terminate every worker. Pending tasks are rejected with a {@link TerminatedError}. */
  async terminate(): Promise<void> {
    if (this.terminated) return;
    this.terminated = true;
    const pending = this.queue.splice(0);
    for (const item of pending) {
      item.cleanup?.();
      item.reject(new TerminatedError());
    }
    this._bus.clear();
    await Promise.all(this.workers.map((w) => w.terminate()));
  }

  private drain(): void {
    while (this.idle.length > 0 && this.queue.length > 0) {
      const worker = this.idle.shift()!;
      const item = this.queue.shift()!;
      const callOptions =
        item.options ?? (this.defaultTimeout ? { timeout: this.defaultTimeout } : undefined);

      worker
        .run(item.arg, callOptions)
        .then(
          (res) => {
            item.cleanup?.();
            item.resolve(res);
          },
          (err) => {
            item.cleanup?.();
            item.reject(err);
          },
        )
        .finally(() => {
          if (!this.terminated) {
            this.idle.push(worker);
            this.drain();
          }
        });
    }
  }
}

function safeParallelism(): number {
  try {
    return availableParallelism();
  } catch {
    return 4;
  }
}

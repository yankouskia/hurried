import type { TransferListItem, WorkerOptions as NodeWorkerOptions } from 'node:worker_threads';
import type { Bus, EventMap } from './bus.js';
import type { RetryInput } from './retry.js';

/** Subset of Node's WorkerOptions safe to expose, plus our own additions. */
export interface ThreadOptions extends Pick<
  NodeWorkerOptions,
  'env' | 'execArgv' | 'stdin' | 'stdout' | 'stderr' | 'workerData' | 'resourceLimits' | 'name'
> {
  /** Optional default timeout (ms) for `run()` calls. */
  timeout?: number;
}

export interface RunOptions {
  /** Per-call timeout (ms). Overrides the thread/pool default. */
  timeout?: number;
  /** AbortSignal to cancel the call. */
  signal?: AbortSignal;
  /** Transferable objects passed via structured clone fast-path. */
  transferList?: ReadonlyArray<TransferListItem>;
  /**
   * Retry the call on failure. A number is the count of extra attempts; an
   * object configures backoff. Cancellation and teardown errors are never
   * retried. The per-call `timeout` applies to each attempt.
   */
  retry?: RetryInput;
}

export interface PoolOptions<
  TEvents extends EventMap = EventMap,
  TArg = unknown,
  TResult = unknown,
> extends ThreadOptions {
  /**
   * Inline task function executed inside each worker. Must be self-contained.
   * Declare two parameters to receive a {@link Bus} as the first argument.
   */
  task:
    | ((arg: TArg) => TResult | Promise<TResult>)
    | ((bus: Bus<TEvents>, arg: TArg) => TResult | Promise<TResult>);
  /** Number of worker threads. Default: number of CPU cores. */
  size?: number;
  /** Maximum tasks queued before backpressure rejection. Default: unbounded. */
  maxQueue?: number;
}

export interface ParallelOptions {
  /** Concurrency cap. Default: number of CPU cores. */
  concurrency?: number;
  /** Per-task timeout (ms). */
  timeout?: number;
  /** AbortSignal to cancel all pending tasks. */
  signal?: AbortSignal;
  /** Retry each task on failure. A number of extra attempts, or a backoff config. */
  retry?: RetryInput;
}

export interface StreamOptions extends ParallelOptions {
  /**
   * Emit results in input order (`true`, the default) or as soon as each task
   * settles (`false`). As-completed minimizes latency to the first result and
   * needs no reorder buffer; ordered mirrors `map()` semantics.
   */
  ordered?: boolean;
}

/** Signature of a "function as task" — must be pure / self-contained. */
export type Task<TArg, TResult> = (arg: TArg) => TResult | Promise<TResult>;

/** A handler map for {@link defineWorker} / {@link makeExecutable}-style modules. */
export type HandlerMap = Record<string, (...args: any[]) => any>;

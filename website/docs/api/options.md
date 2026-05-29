---
id: options
title: Options
sidebar_position: 7
description: ThreadOptions, PoolOptions, RunOptions, ParallelOptions.
---

# Options

## `RunOptions`

Passed to `thread.run(arg, options)` and `pool.run(arg, options)`.

```ts
interface RunOptions {
  /** Per-call timeout in milliseconds. Rejects with TaskTimeoutError. */
  timeout?: number;

  /** AbortSignal. Rejects with TaskAbortedError when fired. */
  signal?: AbortSignal;

  /** Transferable objects passed via structured-clone fast path. */
  transferList?: ReadonlyArray<TransferListItem>;

  /** Retry on failure — a count of extra attempts, or a backoff config. */
  retry?: RetryInput;
}
```

### `transferList` — zero-copy

Move `ArrayBuffer`, `MessagePort`, etc. to the worker without copying:

```ts
const buf = new ArrayBuffer(16 * 1024 * 1024);
await thread.run(buf, { transferList: [buf] });
// buf is now detached on the main thread
```

## `ThreadOptions`

Passed to `Thread.fromFunction / fromFile / fromScript`.

```ts
interface ThreadOptions {
  /** Default per-call timeout (ms). Overridable per call via RunOptions. */
  timeout?: number;

  /** Subset of Node's WorkerOptions, all optional: */
  env?: NodeJS.ProcessEnv;
  execArgv?: string[];
  stdin?: boolean;
  stdout?: boolean;
  stderr?: boolean;
  workerData?: any;
  resourceLimits?: {
    maxOldGenerationSizeMb?: number;
    maxYoungGenerationSizeMb?: number;
    codeRangeSizeMb?: number;
    stackSizeMb?: number;
  };
  name?: string;
}
```

See [Node.js Worker Threads docs](https://nodejs.org/api/worker_threads.html#new-workerfilename-options) for the full semantics of the inherited fields.

## `PoolOptions`

Extends `ThreadOptions`, plus:

```ts
interface PoolOptions<TEvents, TArg, TResult> extends ThreadOptions {
  /** The task each worker runs. Two-parameter form receives a Bus. */
  task: ((arg: TArg) => TResult | Promise<TResult>)
      | ((bus: Bus<TEvents>, arg: TArg) => TResult | Promise<TResult>);

  /** Number of workers. Default: availableParallelism(). */
  size?: number;

  /** Reject new tasks once the queue is at this length. Default: unbounded. */
  maxQueue?: number;
}
```

## `ParallelOptions`

Passed to `parallel()` and `mapParallel()`.

```ts
interface ParallelOptions {
  /** Worker count cap. Default: availableParallelism(). */
  concurrency?: number;

  /** Per-task timeout (ms). */
  timeout?: number;

  /** AbortSignal for the whole batch. */
  signal?: AbortSignal;

  /** Retry each task on failure — a count of extra attempts, or a backoff config. */
  retry?: RetryInput;
}
```

## `RetryOptions`

The shape behind `retry`. A bare `number` is shorthand for `{ retries: number }`.

```ts
type RetryInput = number | RetryOptions;

interface RetryOptions {
  /** Extra attempts after the first. `retries: 2` → up to 3 tries. Default 0. */
  retries?: number;
  /** Base delay (ms) before the first retry. Default 0. */
  minDelay?: number;
  /** Cap on any single backoff delay (ms). Default unbounded. */
  maxDelay?: number;
  /** Exponential multiplier: delay = minDelay * factor^(n-1). Default 2. */
  factor?: number;
  /** Full jitter — random value in [0, delay]. Default false. */
  jitter?: boolean;
  /** Decide whether to retry a given error (default: all but abort/teardown). */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Called after a failed attempt, before the backoff delay. */
  onRetry?: (error: unknown, attempt: number) => void;
}
```

The per-call `timeout` applies to **each** attempt. `TaskAbortedError` and `TerminatedError` are never retried. `retry` cannot be combined with `transferList` — a transferred object is detached after the first attempt and can't be re-sent, so that combination is rejected. See the [Retry guide](../guides/retry).

## `StreamOptions`

Passed to `mapParallelStream()` and `pool.stream()`. Extends `ParallelOptions`:

```ts
interface StreamOptions extends ParallelOptions {
  /**
   * Emit results in input order (`true`, the default) or as soon as each task
   * settles (`false`). As-completed minimizes latency to the first result and
   * needs no reorder buffer.
   */
  ordered?: boolean;
}
```

For `pool.stream()`, `concurrency` is capped at the pool size. See the [Streaming guide](../guides/streaming).

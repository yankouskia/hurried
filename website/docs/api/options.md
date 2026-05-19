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
}
```

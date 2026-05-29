---
id: pool
title: Pool
sidebar_position: 2
description: API reference for the Pool class.
---

# `Pool<TEvents, TArg, TResult>`

A fixed-size pool of workers running the same inline task, with a queue, optional backpressure, and an aggregated Bus.

## Constructor

```ts
new Pool({
  task: (arg: TArg) => TResult | Promise<TResult>
       | (bus: Bus<TEvents>, arg: TArg) => TResult | Promise<TResult>,
  size?: number,                  // default: availableParallelism()
  maxQueue?: number,              // default: unbounded
  timeout?: number,               // default per-call timeout
  ...threadOptions,               // env / execArgv / workerData / ...
});
```

## Instance API

### `pool.run(arg, options?)`

Run the task once.

```ts
run(arg: TArg, options?: RunOptions): Promise<TResult>;
```

### `pool.map(args, options?)`

Run the task across every input. Inputs preserve order in the output.

```ts
map(args: ReadonlyArray<TArg>, options?: RunOptions): Promise<TResult[]>;
```

### `pool.stream(items, options?)`

Stream inputs through the pool as an async iterator, yielding each result as it's ready instead of buffering them all.

```ts
stream(
  items: Iterable<TArg> | AsyncIterable<TArg>,
  options?: StreamOptions,
): AsyncGenerator<TResult, void, void>;
```

The source is pulled **lazily** (it may be a generator, an async iterable, or infinite) and at most `concurrency` items are outstanding at once, so memory stays flat. Results are emitted in input order by default, or as-completed with `{ ordered: false }`. `concurrency` is capped at the pool size. The pool is left running and reusable after the stream ends; an early `break` stops pulling the source.

```ts
for await (const result of pool.stream(urls, { ordered: false })) {
  handle(result); // arrives the moment any worker finishes
}
```

See the [Streaming guide](../guides/streaming) for ordered vs as-completed, backpressure, and cancellation.

### `pool.on / once / off / emit / bus()`

Aggregated typed event API. Events from any worker fire `pool.on(...)` listeners; `pool.emit(...)` broadcasts to every worker. See [Bus](./bus).

### `pool.terminate()`

```ts
await pool.terminate(): Promise<void>;
```

Tears down every worker and rejects any queued tasks with `TerminatedError`.

### Inspection

```ts
pool.size            // number of workers
pool.idleCount       // workers not running a task
pool.queueLength     // tasks waiting
pool.isTerminated    // boolean
```

## Backpressure

Set `maxQueue` to reject incoming tasks once the queue is at capacity:

```ts
const pool = new Pool({ size: 4, maxQueue: 1000, task });

try {
  await pool.run(input);
} catch (e) {
  if (e instanceof HurriedError) throttle();    // queue full
}
```

This is useful for producer pipelines where the source can outpace the worker pool.

## Errors

Same as [`Thread`](./thread#errors): `TaskError`, `TaskTimeoutError`, `TaskAbortedError`, `TerminatedError`. Plus a plain `HurriedError` when the queue is full.

---
id: parallel
title: parallel & mapParallel
sidebar_position: 4
description: API reference for the high-level parallel helpers.
---

# `parallel(tasks, options?)`

Run an array of inline functions concurrently. Returns results in input order.

```ts
function parallel<T>(
  tasks: ReadonlyArray<() => T | Promise<T>>,
  options?: ParallelOptions,
): Promise<T[]>;
```

Each function runs in its own isolated worker. Tasks must be self-contained.

```ts
const [a, b] = await parallel([() => doA(), () => doB()], { concurrency: 2 });
```

# `mapParallel(items, task, options?)`

Parallel-map an iterable through a single task using a worker pool that's set up and torn down for you.

```ts
function mapParallel<TArg, TResult>(
  items: ReadonlyArray<TArg>,
  task: (arg: TArg) => TResult | Promise<TResult>,
  options?: ParallelOptions,
): Promise<TResult[]>;
```

Far more efficient than `parallel` when running the same operation across many inputs — the pool is reused for every element.

```ts
const out = await mapParallel(urls, fetchAndParse, { concurrency: 8 });
```

# `mapParallelStream(items, task, options?)`

Streaming counterpart to `mapParallel`: parallel-map a source and get results back as an **async iterator**, yielded as they're ready instead of buffered into one array.

```ts
function mapParallelStream<TArg, TResult>(
  items: Iterable<TArg> | AsyncIterable<TArg>,
  task: (arg: TArg) => TResult | Promise<TResult>,
  options?: StreamOptions,
): AsyncGenerator<TResult, void, void>;
```

The pool is created and torn down for you — including on an early `break`. The source is pulled lazily (it may be a generator, an async iterable, or infinite) and at most `concurrency` items are outstanding at once, so memory stays flat.

```ts
for await (const parsed of mapParallelStream(readLines(file), parseLine, {
  concurrency: 8,
  ordered: false, // emit as-completed for the lowest latency to the first result
})) {
  save(parsed);
}
```

See the [Streaming guide](../guides/streaming) for the full picture.

## `ParallelOptions`

```ts
interface ParallelOptions {
  concurrency?: number;        // worker count; default: availableParallelism()
  timeout?: number;            // per-task timeout (ms)
  signal?: AbortSignal;        // cancellation
}
```

## `StreamOptions`

`mapParallelStream` and `pool.stream` take `ParallelOptions` plus:

```ts
interface StreamOptions extends ParallelOptions {
  /** Emit in input order (default) or as soon as each task settles. */
  ordered?: boolean;           // default: true
}
```

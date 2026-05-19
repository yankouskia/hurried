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

## `ParallelOptions`

```ts
interface ParallelOptions {
  concurrency?: number;        // worker count; default: availableParallelism()
  timeout?: number;            // per-task timeout (ms)
  signal?: AbortSignal;        // cancellation
}
```

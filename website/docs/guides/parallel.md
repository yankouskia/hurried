---
id: parallel
title: parallel & mapParallel
sidebar_position: 4
description: High-level helpers for fire-and-forget parallel execution.
---

# `parallel` and `mapParallel`

When you don't even want to manage the lifecycle, reach for the high-level helpers.

## `parallel(tasks, options?)`

Run an array of independent inline functions concurrently:

```ts
import { parallel } from 'hurried';

const [a, b, c] = await parallel<number>(
  [
    () => heavyA(),
    () => heavyB(),
    () => heavyC(),
  ],
  { concurrency: 3 },
);
```

Each function is fully isolated in its own worker. Tasks must be self-contained (no closure references). Results are returned in input order.

:::tip When to use it
`parallel` is best for a small, fixed list of *different* tasks. For the same task across many inputs, `mapParallel` reuses a single worker pool and is far more efficient.
:::

## `mapParallel(items, task, options?)`

Parallel map an iterable through a single task using a worker pool that's set up and torn down for you:

```ts
import { mapParallel } from 'hurried';

const squares = await mapParallel(
  [1, 2, 3, 4, 5, 6, 7, 8],
  (n) => n * n,
  { concurrency: 4 },
);
```

Internally this spins up a `Pool` sized to your `concurrency`, dispatches the inputs, collects results in input order, and tears the pool down.

## Options

```ts
interface ParallelOptions {
  concurrency?: number;       // worker count; defaults to availableParallelism()
  timeout?: number;           // per-task timeout (ms)
  signal?: AbortSignal;       // cancellation
}
```

## When to drop down to `Pool`

Reach for `new Pool(...)` directly when you need:

- the bus (`parallel` / `mapParallel` don't expose one),
- a long-lived pool reused across many `run()` calls,
- `maxQueue` backpressure,
- inspection of `idleCount` / `queueLength`.

Otherwise the helpers are usually exactly what you want.

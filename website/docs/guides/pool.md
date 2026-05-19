---
id: pool
title: Pool
sidebar_position: 3
description: A fixed-size pool of worker threads with task queue, backpressure, and aggregated event bus.
---

# Pool

A `Pool` runs the same task across N worker threads. It queues additional tasks beyond pool size, supports backpressure via `maxQueue`, and exposes the same typed Bus surface — events aggregate from any worker, broadcasts go to all.

```ts
import { Pool } from 'hurried';

const pool = new Pool({
  size: 4,
  task: (n: number) => {
    let total = 0;
    for (let i = 0; i < n; i++) total += i;
    return total;
  },
});

const sums = await pool.map([1e6, 2e6, 3e6, 4e6]);
await pool.terminate();
```

## With a typed bus

```ts
type Events = { progress: { done: number; total: number } };

const pool = new Pool<Events, number, number>({
  size: 4,
  task: (bus, n) => {
    bus.emit('progress', { done: n, total: n });
    return n;
  },
});

pool.on('progress', (p) => render(p));    // any worker
pool.emit('cancel' as any);               // all workers
```

## Sizing

```ts
new Pool({ task, size: 4 });            // explicit
new Pool({ task });                     // defaults to availableParallelism()
```

If you don't pass `size`, the pool sizes to the machine's logical core count. Override if your task is memory-heavy or I/O-bound.

## Queue and backpressure

```ts
const pool = new Pool({
  size: 2,
  maxQueue: 100,           // reject new tasks beyond this many queued
  task: heavyJob,
});

try {
  await pool.run(input);
} catch (e) {
  if (e instanceof HurriedError) console.error('queue is full');
}
```

Without `maxQueue` the queue is unbounded. Set it when running on producer pipelines that could overwhelm the pool.

## Inspection

```ts
pool.size            // number of workers
pool.idleCount       // workers not currently running a task
pool.queueLength     // tasks waiting
pool.isTerminated    // true after terminate()
```

## Map vs run

- `pool.run(arg, options?)` — single task; returns a `Promise<TResult>`.
- `pool.map(args, options?)` — array of tasks; returns `Promise<TResult[]>` **in input order**, even though workers complete out of order.

## Lifecycle

```ts
await pool.terminate();    // tears down every worker; rejects queued tasks
```

Always `await` `terminate()` — workers are real OS-level resources and should be released before the process exits.

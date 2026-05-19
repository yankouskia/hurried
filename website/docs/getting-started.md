---
id: getting-started
title: Getting started
sidebar_position: 2
description: Install hurried and run your first parallel task in under five minutes.
---

# Getting started

## Install

```bash
npm  install hurried
pnpm add     hurried
yarn add     hurried
bun  add     hurried
```

:::tip Requirements
**Node.js 18.17+**. hurried ships **ESM + CJS** with full `.d.ts` types — no build configuration on your end.
:::

## Your first thread

```ts
import { Thread } from 'hurried';

const thread = Thread.fromFunction((n: number) => {
  let total = 0;
  for (let i = 0; i < n; i++) total += i;
  return total;
});

const sum = await thread.run(1_000_000);   // typed Promise<number>
console.log(sum);                          // 499999500000

await thread.terminate();
```

That's a fully isolated worker thread, doing CPU work off your event loop, with a typed return value. No worker file, no manual `postMessage`, no boilerplate.

## A pool when you have many inputs

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

The pool sizes to your task count and queues anything extra. Inputs map 1:1 to outputs in order.

## High-level helpers

When you don't even want to manage the lifecycle:

```ts
import { parallel, mapParallel } from 'hurried';

// independent inline tasks
const [a, b] = await parallel([
  () => heavyA(),
  () => heavyB(),
]);

// same task, many inputs
const squares = await mapParallel(
  [1, 2, 3, 4, 5],
  (n) => n * n,
  { concurrency: 4 },
);
```

## Next steps

- [The Bus](./guides/bus) — typed events across the worker boundary (this is what makes hurried special).
- [Patterns](./patterns) — progress reporting, cooperative cancellation, state machines.
- [API reference](./api/thread) — every method, every option.

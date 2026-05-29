---
id: streaming
title: Streaming results
sidebar_position: 4
description: Stream parallel results as an async iterator — in order or as-completed — with bounded memory and backpressure.
---

# Streaming results

`pool.map()` and `mapParallel()` are great when you have an array up front and want an array back. But sometimes you don't:

- The input is **huge** (millions of rows) or **infinite** (a queue, a socket) — you can't materialize it all.
- You want to **act on each result the moment it's ready** instead of waiting for the whole batch.
- You want **memory to stay flat** no matter how much data flows through.

That's what streaming is for. `mapParallelStream()` and `Pool.stream()` return an **async iterator** you consume with `for await`:

```ts
import { mapParallelStream } from 'hurried';

for await (const parsed of mapParallelStream(readLines('huge.log'), parseLine, {
  concurrency: 8,
})) {
  await save(parsed);     // each result, as soon as it's ready
}
```

The source is pulled **lazily** — a new item is only read when a worker frees up — and at most `concurrency` items are ever outstanding. The source can be an array, a generator, or any async iterable.

## Ordered vs as-completed

By default results come back **in input order**, exactly like `map()`:

```ts
// emits 0, 1, 2, 3 — even if 0 is the slowest
for await (const r of mapParallelStream(items, task)) { ... }
```

Pass `{ ordered: false }` to get results **as soon as each one settles** — the lowest possible latency to the first result, with no reorder buffer:

```ts
// emits whichever finishes first
for await (const r of mapParallelStream(items, task, { ordered: false })) { ... }
```

Use ordered when downstream cares about sequence (writing rows in order); use as-completed when you just want throughput and early results.

## Streaming over a reusable pool

`mapParallelStream()` spins up a pool and tears it down for you. When you already have a `Pool` — or want to reuse one across many streams — call `pool.stream()` instead:

```ts
import { Pool } from 'hurried';

const pool = new Pool({ size: 4, task: transcode });

for await (const clip of pool.stream(incomingClips, { ordered: false })) {
  upload(clip);
}

// pool is still alive and reusable here
await pool.run(oneMore);
await pool.terminate();
```

`Pool.stream()` does **not** terminate the pool when the stream ends — it's yours to manage. `concurrency` is capped at the pool size, so streaming never queues behind your workers.

## Backpressure and early exit

The iterator only advances the source when there's capacity, so a slow consumer naturally throttles the producer — you'll never buffer an unbounded backlog. And if you stop early, everything cleans up:

```ts
for await (const hit of mapParallelStream(scanFiles(dir), grep, { ordered: false })) {
  console.log(hit);
  if (hit.match) break;     // stops pulling files; closes the source; pool torn down
}
```

Breaking out of the loop closes the source iterator (so generators run their `finally`) and, for `mapParallelStream`, terminates the pool.

## Cancellation, timeouts, and errors

Streams honor the same options as the rest of hurried:

```ts
const controller = new AbortController();

for await (const r of mapParallelStream(items, task, {
  concurrency: 8,
  timeout: 5_000,            // per-task TaskTimeoutError
  signal: controller.signal, // abort the whole stream
})) { ... }
```

If any task rejects, the `for await` loop throws (a `TaskError`, `TaskTimeoutError`, or `TaskAbortedError`) and the stream shuts down — no further items are scheduled and the source is closed.

## When to use which

| You have…                                   | Reach for          |
| ------------------------------------------- | ------------------ |
| An array, want an array back                | `mapParallel`      |
| A large/infinite/async source, or want results streamed | `mapParallelStream` |
| An existing pool you want to stream through | `pool.stream`      |

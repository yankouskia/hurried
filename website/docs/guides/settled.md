---
id: settled
title: Fault tolerance
sidebar_position: 6
description: Process a whole batch even when some tasks fail — the Promise.allSettled analogue for worker threads.
---

# Fault tolerance

`mapParallel` and `pool.map` are **fail-fast**: the first task that throws rejects the whole batch, and you lose every other result. For batch jobs — scraping a thousand URLs, transcoding a folder of files — that's rarely what you want. You want *all* the results, with the failures clearly marked.

That's what the **`*Settled`** variants do. They're the worker-thread analogue of `Promise.allSettled`: every input produces a `SettledResult`, and one bad item never sinks the run.

```ts
import { mapParallelSettled } from 'hurried';

const results = await mapParallelSettled(urls, fetchAndParse, { concurrency: 8 });

for (const r of results) {
  if (r.status === 'fulfilled') save(r.value);
  else log.warn('failed:', r.reason);
}
```

## `SettledResult`

```ts
type SettledResult<T> =
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; reason: unknown };
```

Exactly the shape of `PromiseSettledResult`, so the discriminated-union narrowing you already know just works. Results stay in **input order**.

## The whole family

Every map/stream helper has a settled twin:

| Fail-fast            | Fault-tolerant                |
| -------------------- | ----------------------------- |
| `mapParallel`        | `mapParallelSettled`          |
| `mapParallelStream`  | `mapParallelStreamSettled`    |
| `pool.map`           | `pool.mapSettled`             |
| `pool.stream`        | `pool.streamSettled`          |

The streaming variants yield `SettledResult`s as they're ready — fault tolerance with the same lazy pull and bounded memory:

```ts
for await (const r of mapParallelStreamSettled(readLines(file), parseLine)) {
  if (r.status === 'fulfilled') write(r.value);
  else failures.push(r.reason);
}
```

## What counts as a failure

Anything that goes wrong with an **individual item** becomes a `rejected` entry — the batch keeps going:

- The task **threw** (`TaskError`) or **timed out** (`TaskTimeoutError`).
- The item's **worker crashed** — `process.exit()` in task code, an OOM, a fatal native error — surfaces as a `WorkerExitedError`. A dead worker is a per-item failure, not the end of the run.
- **Backpressure**: a `maxQueue`-full pool rejects the overflow item with a `HurriedError`.

Two things are different — they're *deliberate* "stop everything" signals, so they reject the whole `mapParallelSettled` / end the settled stream:

- An **`AbortSignal`** firing → `TaskAbortedError`.
- An explicit **`pool.terminate()`** → `TerminatedError`.

So "settled" means *resilient to per-item and infrastructure failures* (including a crashing worker), while you keep clean, prompt cancellation. The distinction between a worker that *died on its own* (`WorkerExitedError`, recorded) and one you *tore down* (`TerminatedError`, stops everything) is what makes that work.

## Composing with retry

Settled and [retry](./retry) stack naturally: each item is retried first, and only a **final**, post-retry failure is recorded as `rejected`.

```ts
const results = await mapParallelSettled(urls, fetchAndParse, {
  concurrency: 8,
  retry: { retries: 3, minDelay: 200 },
});
// Each URL gets 4 attempts; the SettledResult reflects the final outcome.
```

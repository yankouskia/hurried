---
id: retry
title: Retry & backoff
sidebar_position: 5
description: Automatically retry failed worker tasks with exponential backoff, jitter, and a custom retry predicate.
---

# Retry & backoff

Real work is flaky — a network blip, a transient lock, an occasional out-of-memory. hurried lets you retry any task with one option, on **every** primitive, with exponential backoff built in. No `p-retry`, no hand-rolled loops.

```ts
import { Thread } from 'hurried';

const t = Thread.fromFunction(fetchAndParse);

// Up to 3 extra attempts after the first.
await t.run(url, { retry: 3 });
```

`retry: 3` means **3 retries** — up to four total attempts. The shorthand uses sensible defaults (immediate retry, no delay). Pass an object to shape the backoff:

```ts
await t.run(url, {
  retry: {
    retries: 5,
    minDelay: 100,   // ms before the first retry
    factor: 2,       // exponential: 100, 200, 400, 800, …
    maxDelay: 5_000, // cap any single delay
    jitter: true,    // randomize within [0, delay] to avoid thundering herds
  },
});
```

## Where it works

`retry` lives on the call/option object for every entry point:

```ts
await thread.run(arg, { retry: 3 });
await pool.run(arg, { retry: { retries: 2, minDelay: 50 } });

await mapParallel(items, task, { retry: 3, concurrency: 8 });
await parallel(tasks, { retry: 2 });

for await (const r of pool.stream(items, { retry: 3 })) { /* … */ }
for await (const r of mapParallelStream(items, task, { retry: 3 })) { /* … */ }
```

For a `Pool`, each retry **re-queues** the task — so a retry can land on a different, healthy worker, not the one that just struggled. The per-call `timeout` applies to *each attempt*, not the whole sequence.

:::note
`retry` can't be combined with `transferList`. A transferred object (e.g. an `ArrayBuffer`) is *detached* after the first attempt, so it can't be re-sent — that combination is rejected up front.
:::

## What gets retried

By default every error is retried **except** cancellation and teardown:

- `TaskAbortedError` (you aborted) and `TerminatedError` (the worker is gone) are **never** retried — retrying them is pointless.
- Everything else — `TaskError` (the task threw), `TaskTimeoutError` — is retried until the budget runs out.

Narrow or widen that with `shouldRetry`:

```ts
await pool.run(arg, {
  retry: {
    retries: 4,
    shouldRetry: (error, attempt) =>
      error instanceof TaskError && /ECONNRESET/.test(String(error.cause)),
  },
});
```

Observe each retry with `onRetry` (great for logging/metrics):

```ts
await thread.run(arg, {
  retry: { retries: 3, onRetry: (err, attempt) => log.warn(`retry ${attempt}`, err) },
});
```

## Cancellation wins

A retry sequence respects your `AbortSignal` — including **during** a backoff delay. Abort and the whole sequence rejects promptly with `TaskAbortedError`; no further attempts are scheduled.

```ts
const controller = new AbortController();

const p = pool.run(arg, {
  retry: { retries: 10, minDelay: 1_000 },
  signal: controller.signal,
});

controller.abort();          // rejects now, even mid-backoff
```

## `RetryOptions`

```ts
type RetryInput = number | RetryOptions;

interface RetryOptions {
  retries?: number;     // extra attempts after the first (default 0)
  minDelay?: number;    // ms before the first retry (default 0)
  maxDelay?: number;    // cap on any single delay (default unbounded)
  factor?: number;      // exponential multiplier (default 2)
  jitter?: boolean;     // full jitter in [0, delay] (default false)
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number) => void;
}
```

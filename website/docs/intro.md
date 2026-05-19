---
id: intro
title: Introduction
sidebar_position: 1
description: hurried — modern, type-safe parallel execution for Node.js.
---

# Welcome to hurried

**hurried** is a tiny, modern, fully type-safe library for running CPU-bound JavaScript **off the event loop** using Node.js worker threads — with a developer experience that doesn't make you want to switch back to plain `worker_threads`.

```ts
import { Thread } from 'hurried';

const t = Thread.fromFunction((n: number) => n * 2);
await t.run(21);    // → 42
await t.terminate();
```

That's it. Type-safe `run()`, automatic worker lifecycle, real Promise.

## What you get

- **Inline-function workers** — no separate worker file needed for simple cases.
- **A typed event bus** — `thread.on('progress', payload => ...)` with full TypeScript inference both sides of the worker boundary.
- **Pools** with task queues, backpressure, and aggregated event streams.
- **Parallel helpers** — `parallel()` and `mapParallel()` for fire-and-forget concurrency.
- **AbortSignal + timeouts** on every primitive.
- **Structured errors** — `TaskError`, `TaskTimeoutError`, `TaskAbortedError`, `TerminatedError`.
- **Dual ESM + CJS** with generated `.d.ts`. Zero runtime dependencies.

## Why?

Raw `worker_threads` is powerful but ceremonial: separate files, untyped `postMessage`, no pools, no progress events. **hurried** wraps that primitive in an API real codebases actually want to use.

```mermaid
flowchart LR
    A[Main thread] -->|run('process', data)| B[Thread]
    B -->|emit progress| A
    A -.->|emit cancel| B
    B -->|Promise&lt;Result&gt;| A
```

Read on:

- [Getting started](./getting-started) — 5-minute setup
- [The Bus](./guides/bus) — typed pub/sub across threads
- [Patterns](./patterns) — five recipes you'll actually use
- [API reference](./api/thread) — full surface area

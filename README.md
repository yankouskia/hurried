<div align="center">

# hurried

### Modern, type-safe parallel execution for Node.js — with a typed event bus baked in.

Workers, pools, parallel iterators, and a `Bus<Events>` for pub/sub across the worker boundary —
all behind an API that fits on a sticky note.

[![CI](https://github.com/yankouskia/hurried/actions/workflows/ci.yml/badge.svg)](https://github.com/yankouskia/hurried/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/hurried.svg)](https://www.npmjs.com/package/hurried)
[![npm downloads](https://img.shields.io/npm/dm/hurried.svg)](https://www.npmjs.com/package/hurried)
[![types](https://img.shields.io/npm/types/hurried.svg)](https://www.npmjs.com/package/hurried)
[![license](https://img.shields.io/npm/l/hurried.svg)](https://github.com/yankouskia/hurried/blob/master/LICENSE)
[![coverage](https://img.shields.io/badge/coverage-97%25-brightgreen.svg)](#testing)

</div>

---

```ts
import { Thread } from 'hurried';

type Events = { progress: { done: number; total: number } };

const thread = Thread.fromFunction<Events, number, number>((bus, n) => {
  for (let i = 0; i < n; i++) {
    if (i % 1_000_000 === 0) bus.emit('progress', { done: i, total: n });
  }
  return n;
});

thread.on('progress', (p) => console.log(`${p.done}/${p.total}`));

await thread.run(50_000_000);
await thread.terminate();
```

That's it. CPU-bound work, off the event loop, with **live progress events** typed end-to-end.

---

## Table of contents

- [Why hurried?](#why-hurried)
- [Install](#install)
- [60-second tour](#60-second-tour)
- [The Bus — typed pub/sub across threads](#the-bus--typed-pub-sub-across-threads)
- [Pattern showcase: solving real TS pain points](#pattern-showcase-solving-real-ts-pain-points)
  - [Typed RPC across the worker boundary](#1-typed-rpc-across-the-worker-boundary)
  - [Streaming progress from CPU-bound work](#2-streaming-progress-from-cpu-bound-work)
  - [Cooperative cancellation (the bus way)](#3-cooperative-cancellation-the-bus-way)
  - [Aggregated events from many workers](#4-aggregated-events-from-many-workers)
  - [Worker as a finite state machine](#5-worker-as-a-finite-state-machine)
- [API reference](#api-reference)
- [Migration from v1](#migration-from-v1)
- [Examples](#examples)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

## Why hurried?

CPU-bound work in Node.js blocks the event loop. **hurried** makes it trivial to push that work onto worker threads — with a tiny, ergonomic API, zero runtime dependencies, and **end-to-end TypeScript types** that even travel across the worker boundary.

| Feature | hurried | `worker_threads` (raw) | Other libs |
| --- | --- | --- | --- |
| Inline-function workers | ✅ one call | ❌ separate file | partial |
| Typed RPC `await thread.run(arg)` | ✅ | ❌ build it yourself | partial |
| Typed event bus `thread.on('progress', ...)` | ✅ | ❌ untyped postMessage | rare |
| Worker pool with queue + backpressure | ✅ `Pool` | ❌ | ✅ |
| Parallel map / array helpers | ✅ `mapParallel` | ❌ | partial |
| `AbortSignal` + per-call `timeout` | ✅ | ❌ | partial |
| ESM + CJS, zero deps, Node 18+ | ✅ | n/a | varies |

## Install

```sh
npm  install hurried
pnpm add     hurried
yarn add     hurried
```

> Requires Node.js **18.17+**. No build step needed for consumers — ships compiled ESM + CJS + `.d.ts`.

## 60-second tour

### 1) Run an inline function in its own thread

```ts
import { Thread } from 'hurried';

const thread = Thread.fromFunction((n: number) => n * 2);
await thread.run(21);            // → 42
await thread.terminate();
```

### 2) Run the same task across a pool of workers

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

await pool.map([1e6, 2e6, 3e6, 4e6]);
await pool.terminate();
```

### 3) Skip lifecycle entirely with `mapParallel`

```ts
import { mapParallel } from 'hurried';

const squares = await mapParallel(
  [1, 2, 3, 4, 5, 6, 7, 8],
  (n) => n * n,
  { concurrency: 4 },
);
```

## The Bus — typed pub/sub across threads

> The feature you've always wished `worker_threads` had: send strongly-typed events both ways with one shared contract.

```ts
type Events = {
  progress: { done: number; total: number };
  log: string;
  cancel: void;
};

const thread = Thread.fromFunction<Events, number, number>((bus, n) => {
  bus.on('cancel', () => { /* stop early */ });

  for (let i = 0; i < n; i++) {
    bus.emit('progress', { done: i, total: n });
  }
  bus.emit('log', 'done');
  return n;
});

thread.on('progress', (p) => render(p.done / p.total));
thread.on('log',      (msg) => console.log(msg));

thread.emit('cancel');              // void event → no payload arg required
```

**One event map, two endpoints.** Both `thread.on` and `bus.on` (inside the worker) are typed against `Events` — payloads, event names, everything. Rename a field; both sides break at compile time.

**Just three methods.** `on(event, listener)` returns an `Unsubscribe` function; pair it with `emit()` and (optionally) `once()` and you have the entire API.

### File-based workers

```ts
// worker.ts
import { defineWorker, workerBus } from 'hurried';

type Events = { progress: { done: number; total: number } };
const bus = workerBus<Events>();

export default defineWorker({
  process(items: string[]) {
    items.forEach((item, i) => {
      bus.emit('progress', { done: i + 1, total: items.length });
    });
    return items.length;
  },
});

// main.ts
import { Thread } from 'hurried';
import type { Events } from './worker.ts';

const thread = Thread.fromFile<Events>(new URL('./worker.js', import.meta.url));
thread.on('progress', (p) => console.log(p));
const count = await thread.run('process', ['a', 'b', 'c']);
```

### Pools — aggregated, broadcast, still typed

```ts
const pool = new Pool<Events, number, number>({
  size: 4,
  task: (bus, n) => {
    bus.emit('progress', { done: n, total: n });
    return n;
  },
});

pool.on('progress', (p) => console.log(p));   // events from ANY worker
pool.emit('cancel');                           // broadcasts to ALL workers
```

## Pattern showcase: solving real TS pain points

Five patterns that are painful with raw `worker_threads` and one-liners with hurried.

### 1) Typed RPC across the worker boundary

**The problem.** `postMessage` accepts `any`. Type drift between the parent and the worker is a constant low-grade bug source.

**The hurried way.**

```ts
// worker.ts
import { defineWorker } from 'hurried';

export const handlers = defineWorker({
  add: (a: number, b: number) => a + b,
  greet: (name: string) => `Hello, ${name}!`,
  hash: async (input: string) => (await import('node:crypto'))
    .createHash('sha256').update(input).digest('hex'),
});

export type Handlers = typeof handlers;
```

```ts
// main.ts
import { Thread } from 'hurried';
import type { Handlers } from './worker.ts';

const thread = Thread.fromFile(new URL('./worker.js', import.meta.url));
const sum = await thread.run('add', 2, 5);                 // returns Promise<number>
const greeting = await thread.run('greet', 'world');       // typed return
```

One `defineWorker` call wires up a typed handler map, and the worker file becomes the single source of truth — its types are exported and imported back into the main thread.

### 2) Streaming progress from CPU-bound work

**The problem.** Tight loops block the event loop; you can't `await` your way out. Spinning up a worker just to be silent for 30 seconds isn't great UX either.

**The hurried way.**

```ts
type Events = { progress: { done: number; total: number; pctText: string } };

const thread = Thread.fromFunction<Events, number, number>((bus, total) => {
  for (let i = 0; i < total; i++) {
    if (i % Math.floor(total / 20) === 0) {
      bus.emit('progress', {
        done: i, total, pctText: `${((i / total) * 100).toFixed(0)}%`,
      });
    }
  }
  return total;
});

thread.on('progress', (p) =>
  process.stdout.write(`\rprogress: ${p.pctText}`),
);

await thread.run(50_000_000);
```

Live progress bar, fully typed, zero polling. See [`examples/bus-progress.ts`](./examples/bus-progress.ts).

### 3) Cooperative cancellation (the bus way)

**The problem.** A long-running worker can't react to messages while it's inside a synchronous loop — `parentPort.on('message', ...)` only fires when the event loop drains.

**The hurried way.** Use the bus to signal intent, and yield to the event loop on a coarse cadence:

```ts
type Events = {
  cancel: void;
  cancelled: { atIteration: number };
};

const thread = Thread.fromFunction<Events, number, 'completed' | 'cancelled'>(
  async (bus, n) => {
    let stop = false;
    bus.on('cancel', () => { stop = true; });

    const chunk = 5_000_000;
    for (let i = 0; i < n; i += chunk) {
      if (stop) {
        bus.emit('cancelled', { atIteration: i });
        return 'cancelled';
      }
      for (let j = 0; j < chunk && i + j < n; j++) Math.sqrt(i + j);
      await new Promise((r) => setImmediate(r)); // drain incoming messages
    }
    return 'completed';
  },
);

setTimeout(() => thread.emit('cancel'), 200);
const status = await thread.run(2_000_000_000);
```

The same pattern works for pause/resume, throttling, anything you'd usually reach for `AbortSignal` for. ([`examples/bus-cancel.ts`](./examples/bus-cancel.ts))

### 4) Aggregated events from many workers

**The problem.** You have N workers running the same task; you want a *single* event stream in the parent, with no manual fan-in code.

**The hurried way.** The `Pool` exposes the same `on / emit` surface as `Thread`, automatically aggregating events from every worker and broadcasting outgoing events to all:

```ts
type Events = {
  progress: { workerLabel: string; done: number; total: number };
  done: { workerLabel: string };
};

const pool = new Pool<Events, { id: number; size: number }, number>({
  size: 4,
  task: (bus, { id, size }) => {
    const workerLabel = `worker-${id}`;
    for (let i = 0; i < size; i++) {
      if (i % Math.floor(size / 4) === 0) {
        bus.emit('progress', { workerLabel, done: i, total: size });
      }
    }
    bus.emit('done', { workerLabel });
    return size;
  },
});

pool.on('progress', (p) => console.log(`${p.workerLabel}: ${p.done}/${p.total}`));
pool.on('done',     (d) => console.log(`${d.workerLabel} ✓`));

await pool.map([{ id: 1, size: 1e7 }, { id: 2, size: 1e7 }, /* ... */]);
```

See [`examples/bus-pool.ts`](./examples/bus-pool.ts).

### 5) Worker as a finite state machine

**The problem.** Workers that change phases — initializing, downloading, processing, finalizing — need a clean way to broadcast state transitions without baking custom protocols.

**The hurried way.** Define `state` as a discriminated union and let the bus carry it:

```ts
type WorkerState =
  | { phase: 'init' }
  | { phase: 'downloading'; url: string }
  | { phase: 'processing'; chunk: number }
  | { phase: 'done'; bytes: number }
  | { phase: 'error'; message: string };

type Events = { state: WorkerState };

const thread = Thread.fromFunction<Events, string, number>(async (bus, url) => {
  bus.emit('state', { phase: 'init' });
  bus.emit('state', { phase: 'downloading', url });

  // ... heavy work ...

  bus.emit('state', { phase: 'processing', chunk: 1 });
  bus.emit('state', { phase: 'done', bytes: 1234 });
  return 1234;
});

thread.on('state', (s) => {
  // TypeScript narrows the union per branch:
  switch (s.phase) {
    case 'downloading': console.log(`↓ ${s.url}`); break;
    case 'processing':  console.log(`⚙  chunk ${s.chunk}`); break;
    case 'done':        console.log(`✓ ${s.bytes} bytes`); break;
    case 'error':       console.error(s.message); break;
  }
});
```

## API reference

### `Thread`

| Method | Description |
| --- | --- |
| `Thread.fromFunction(task, options?)` | Spawn a worker around a self-contained inline function. Declare two parameters `(bus, arg)` to receive a typed {@link Bus}. |
| `Thread.fromFile(filename, options?)` | Spawn a worker from a module file (use `defineWorker` inside). |
| `Thread.fromScript(script, options?)` | Spawn a worker from a CommonJS code string. |
| `thread.run(arg, options?)` | Invoke the default inline task. |
| `thread.run(name, ...args)` | Invoke a named handler registered with `defineWorker` / `makeExecutable`. |
| `thread.on(event, listener)` | Listen for an event from the worker; returns an unsubscribe function. |
| `thread.once(event, listener)` | One-shot listener. |
| `thread.off(event, listener)` | Remove a listener. |
| `thread.emit(event, payload?)` | Send an event to the worker (`payload` omitted for `void` events). |
| `thread.bus()` | Direct access to the typed `Bus<TEvents>`. |
| `thread.terminate()` | Stop the worker; pending calls reject with `TerminatedError`. |
| `thread.isTerminated` / `thread.pendingCount` | Inspection. |

### `Pool`

| Method | Description |
| --- | --- |
| `new Pool({ task, size?, maxQueue?, timeout?, ...threadOptions })` | Fixed-size pool of workers running the same inline task. |
| `pool.run(arg, options?)` / `pool.map(args, options?)` | Run one or many tasks. |
| `pool.on/once/off/emit/bus` | Aggregated event bus (events from any worker; emit broadcasts to all). |
| `pool.size` / `pool.idleCount` / `pool.queueLength` / `pool.isTerminated` | Inspection. |
| `pool.terminate()` | Tear down workers; reject queued tasks. |

### `parallel(tasks, options?)` & `mapParallel(items, task, options?)`

Run an array of inline functions concurrently (`parallel`) or map an iterable through a single task using a pool (`mapParallel`). Both honor `{ concurrency, timeout, signal }`.

### `defineWorker` & `makeExecutable`

Register typed handlers inside a worker module. `defineWorker(map)` is the modern ergonomic form; `makeExecutable(fn, name)` is the v1-compatible single-handler version.

### `workerBus<TEvents>()`

Inside a worker module, returns the typed `Bus<TEvents>` for that worker. Call it once and share the result — it's a singleton per worker.

### `Bus<TEvents>`

The class behind every `on / emit` surface in hurried.

| Method | Description |
| --- | --- |
| `bus.emit(event, payload?)` | Send to the other side (no-op if standalone). |
| `bus.on(event, listener)` | Subscribe; returns an unsubscribe function. |
| `bus.once(event, listener)` | One-shot subscribe. |
| `bus.off(event, listener)` | Manually unsubscribe. |
| `bus.waitFor(event, { signal? })` | Resolves on the next event (or rejects on abort). |
| `bus.listenerCount(event?)` / `bus.clear()` | Inspection / teardown. |

### Options

```ts
interface RunOptions {
  timeout?: number;                 // per-call timeout (ms)
  signal?: AbortSignal;             // cancellation
  transferList?: TransferListItem[];// zero-copy transfers (ArrayBuffer, MessagePort, ...)
}
```

`ThreadOptions` extends Node's `WorkerOptions` (`env`, `execArgv`, `stdin`/`stdout`/`stderr`, `workerData`, `resourceLimits`, `name`) and adds a `timeout` default.

### Errors

All errors extend `HurriedError`:

| Class                | When                                                       |
| -------------------- | ---------------------------------------------------------- |
| `TaskError`          | Handler threw or rejected — original error in `.cause`     |
| `TaskTimeoutError`   | A `timeout` was reached                                    |
| `TaskAbortedError`   | An `AbortSignal` fired                                     |
| `TerminatedError`    | The worker was terminated while the call was in flight     |

## Migration from v1

```diff
- const { Thread, makeExecutable } = require('hurried');
+ import { Thread, defineWorker, workerBus } from 'hurried';

- module.exports.slow = slow;
- makeExecutable(slow, 'slow');
+ export default defineWorker({ slow });
```

**Highlights**

- ESM-first build; CJS still works via the `require` export.
- `Thread.fromFunction` replaces ad-hoc `fromScript` for inline tasks and is fully type-safe.
- `Pool`, `parallel`, `mapParallel` cover the common parallel-map case without lifecycle code.
- New `Bus<Events>` — typed pub/sub across the worker boundary.
- `AbortSignal` and per-call `timeout` are first-class.
- The legacy `makeExecutable` still works, so v1 worker files don't need to change.

## Examples

Every script is runnable with `npm run example:<name>`.

| Script | What it shows |
| --- | --- |
| [`basic`](./examples/basic.ts)             | Single `Thread.fromFunction` |
| [`pool`](./examples/pool.ts)               | `Pool.map` for parallel sums |
| [`parallel`](./examples/parallel.ts)       | `parallel()` and `mapParallel()` helpers |
| [`performance`](./examples/performance.ts) | Serial vs. parallel benchmark |
| [`bus-progress`](./examples/bus-progress.ts) | Streaming progress events with `bus` |
| [`bus-cancel`](./examples/bus-cancel.ts)   | Cooperative cancellation via the bus |
| [`bus-pool`](./examples/bus-pool.ts)       | Aggregated events from a worker pool |
| [`typed-worker`](./examples/typed-worker.ts) | `defineWorker` + `workerBus` for typed RPC + events |

## Testing

- **Vitest** with v8 coverage. CI enforces 50%+ thresholds; the suite ships at **~97% statements**.
- **95 tests** across 11 files cover the bus, runtime, protocol, thread, pool, parallel helpers, and the legacy handler API.

```sh
npm test               # run once
npm run test:watch     # watch mode
npm run test:coverage  # full coverage report
```

## Contributing

```sh
npm install
npm run lint        # eslint (flat config)
npm run typecheck   # tsc --noEmit
npm test            # vitest
npm run build       # tsup → dist/ (ESM + CJS + .d.ts)
```

CI runs lint, typecheck, format check, the full matrix (Node 18/20/22 × Ubuntu/macOS/Windows), coverage, build, and the example scripts. PRs welcome.

## License

[MIT](./LICENSE) © Aliaksandr Yankouski

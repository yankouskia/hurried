---
id: patterns
title: Patterns
sidebar_position: 3
description: Five real-world TypeScript pain points hurried solves with a one-liner each.
---

# Patterns

Five recipes that are painful with raw `worker_threads` and a one-liner with hurried.

## 1. Typed RPC across the worker boundary

**Problem.** `postMessage` accepts `any`. Type drift between parent and worker becomes a quiet source of bugs.

**Solution.** `defineWorker` lets the worker file export its handler-map type; the main thread imports it for end-to-end inference.

```ts
// worker.ts
import { defineWorker } from 'hurried';

export const handlers = defineWorker({
  add: (a: number, b: number) => a + b,
  greet: (name: string) => `Hello, ${name}!`,
});

export type Handlers = typeof handlers;
```

```ts
// main.ts
import { Thread } from 'hurried';
import type { Handlers } from './worker.js';

const thread = Thread.fromFile(new URL('./worker.js', import.meta.url));
const sum = await thread.run('add', 2, 5);             // Promise<number>
const hi  = await thread.run('greet', 'world');        // Promise<string>
```

The worker file is the single source of truth — its types travel back to the caller.

## 2. Streaming progress from CPU-bound work

**Problem.** Tight loops block the event loop. You can't `await` between iterations, and a silent 30-second worker is bad UX.

**Solution.** Use the bus to stream typed progress events:

```ts
type Events = {
  progress: { done: number; total: number; pctText: string };
};

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

See [`examples/bus-progress.ts`](https://github.com/yankouskia/hurried/blob/master/examples/bus-progress.ts).

## 3. Cooperative cancellation through the bus

**Problem.** A long-running worker can't react to messages while it's inside a sync loop — `parentPort.on('message')` only fires when the event loop drains.

**Solution.** Use the bus to signal intent, and yield to the event loop on a coarse cadence:

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
        return 'cancelled';
      }
      for (let j = 0; j < chunk && i + j < n; j++) Math.sqrt(i + j);
      await new Promise((r) => setImmediate(r));    // drain incoming messages
    }
    return 'completed';
  },
);

setTimeout(() => thread.emit('cancel'), 200);
const status = await thread.run(2_000_000_000);
```

The same pattern works for pause/resume, throttling, and anything you'd usually reach for `AbortSignal` for.

:::warning Always yield
Without the `setImmediate` yield, the cancel message will never be processed until the loop ends. This is a Node `worker_threads` constraint, not a hurried one.
:::

## 4. Aggregated events from many workers

**Problem.** You have N workers running the same task and want a *single* event stream in the parent.

**Solution.** `Pool` exposes the same `on / emit` surface as `Thread`, automatically aggregating events from every worker and broadcasting outgoing events to all:

```ts
type Events = {
  progress: { workerLabel: string; done: number; total: number };
  done:     { workerLabel: string };
};

const pool = new Pool<Events, { id: number; size: number }, number>({
  size: 4,
  task: (bus, { id, size }) => {
    const workerLabel = `worker-${id}`;
    for (let i = 0; i < size; i++) {
      if (i % Math.floor(size / 4) === 0)
        bus.emit('progress', { workerLabel, done: i, total: size });
    }
    bus.emit('done', { workerLabel });
    return size;
  },
});

pool.on('progress', (p) => console.log(`${p.workerLabel}: ${p.done}/${p.total}`));
pool.on('done',     (d) => console.log(`${d.workerLabel} ✓`));

await pool.map([
  { id: 1, size: 1e7 },
  { id: 2, size: 1e7 },
  { id: 3, size: 1e7 },
  { id: 4, size: 1e7 },
]);
```

See [`examples/bus-pool.ts`](https://github.com/yankouskia/hurried/blob/master/examples/bus-pool.ts).

## 5. Worker as a finite state machine

**Problem.** Workers that move through phases (initializing → downloading → processing → done) need a clean way to broadcast state transitions.

**Solution.** Define `state` as a discriminated union and let the bus carry it. TypeScript narrows the union per branch on the consumer:

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
  switch (s.phase) {
    case 'downloading': console.log(`↓ ${s.url}`); break;        // s narrows
    case 'processing':  console.log(`⚙ chunk ${s.chunk}`); break;
    case 'done':        console.log(`✓ ${s.bytes} bytes`); break;
    case 'error':       console.error(s.message); break;
  }
});
```

No `as any`, no manual type guards. The Bus carries the discriminated union, the switch narrows it.

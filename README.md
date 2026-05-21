<div align="center">

<a href="https://yankouskia.github.io/hurried/">
  <img src="https://raw.githubusercontent.com/yankouskia/hurried/master/website/static/img/hero.svg" alt="hurried — parallel execution for Node.js" width="640" />
</a>

# **`hurried`**

### Parallel execution for Node.js, done right.

#### Workers · Pools · Parallel iterators · A typed event bus across the worker boundary — all behind an API that fits on a sticky note.

<br />

[![npm version](https://img.shields.io/npm/v/hurried?color=cb3837&label=npm&logo=npm&style=flat-square)](https://www.npmjs.com/package/hurried)
[![CI](https://img.shields.io/github/actions/workflow/status/yankouskia/hurried/ci.yml?branch=master&label=CI&logo=github&style=flat-square)](https://github.com/yankouskia/hurried/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-95%25-brightgreen?style=flat-square&logo=vitest)](#testing)
[![Types](https://img.shields.io/npm/types/hurried?style=flat-square&logo=typescript)](https://www.npmjs.com/package/hurried)
[![Bundle](https://img.shields.io/bundlephobia/minzip/hurried?style=flat-square&label=size)](https://bundlephobia.com/package/hurried)
[![License](https://img.shields.io/npm/l/hurried?style=flat-square&color=blue)](LICENSE)
[![Docs](https://img.shields.io/badge/docs-yankouskia.github.io%2Fhurried-4f46e5?style=flat-square&logo=readthedocs)](https://yankouskia.github.io/hurried/)

[**Documentation**](https://yankouskia.github.io/hurried/) · [**Quick start**](#-quick-start) · [**Bus showcase**](#-the-bus--typed-pub-sub-across-threads) · [**Patterns**](#-pattern-showcase) · [**API**](#-api-reference) · [**Examples**](./examples)

</div>

---

## 30 seconds to your first parallel task

```ts
import { Thread } from 'hurried';

const thread = Thread.fromFunction((n: number) => n * 2);

await thread.run(21);        // → 42, on a worker thread
await thread.terminate();
```

That's it. Three lines, fully typed, CPU work off the event loop, no separate worker file.

Need progress events? Add a typed `Events` map and use the bus:

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

**Live, end-to-end-typed progress events across the worker boundary.** That's the whole demo.

---

## ✨ Why hurried?

CPU-bound JavaScript blocks the event loop. The standard Node fix — `worker_threads` — is powerful but unfriendly: a separate file, untyped `postMessage`, no pools, no progress events, no cancellation. **hurried** is a small library that wraps that primitive in an API real codebases actually want to use.

<table>
  <thead>
    <tr><th align="left">Feature</th><th>hurried</th><th>worker_threads (raw)</th><th>workerpool / piscina</th></tr>
  </thead>
  <tbody>
    <tr><td><b>Inline-function workers</b></td><td>✅ one call</td><td>❌ separate file</td><td>partial</td></tr>
    <tr><td><b>Typed RPC <code>await thread.run(arg)</code></b></td><td>✅</td><td>❌ DIY</td><td>partial</td></tr>
    <tr><td><b>Typed event bus</b> (<code>thread.on('progress', …)</code>)</td><td>✅</td><td>❌ untyped</td><td>rare</td></tr>
    <tr><td><b>Worker pool</b> with queue + backpressure</td><td>✅ <code>Pool</code></td><td>❌</td><td>✅</td></tr>
    <tr><td><b>Parallel map / array helpers</b></td><td>✅ <code>mapParallel</code></td><td>❌</td><td>partial</td></tr>
    <tr><td><b>AbortSignal + per-call timeout</b></td><td>✅</td><td>❌</td><td>partial</td></tr>
    <tr><td><b>Dual ESM + CJS</b>, zero deps</td><td>✅</td><td>n/a</td><td>varies</td></tr>
    <tr><td><b>First-class TypeScript</b> (types travel across the worker boundary)</td><td>✅</td><td>❌</td><td>partial</td></tr>
  </tbody>
</table>

> 💡 **What makes hurried different?** Every primitive — `Thread`, `Pool`, `parallel`, `mapParallel` — speaks the same tiny API: `run / on / emit / terminate`. Learn it once, scale from a single worker to a 16-CPU pool without rewriting your code.

---

## 📦 Install

```sh
npm  install hurried
pnpm add     hurried
yarn add     hurried
bun  add     hurried
```

> Requires **Node.js 18.17+**. Ships **ESM + CJS + `.d.ts`** — no build step on your side.

---

## ⚡ Quick start

### 1) Run a single inline task

```ts
import { Thread } from 'hurried';

const t = Thread.fromFunction((n: number) => n * 2);
await t.run(21);            // → 42
await t.terminate();
```

### 2) Spin up a pool

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

### 3) Skip lifecycle entirely

```ts
import { mapParallel } from 'hurried';

const squares = await mapParallel(
  [1, 2, 3, 4, 5, 6, 7, 8],
  (n) => n * n,
  { concurrency: 4 },
);
```

---

## 🚌 The Bus — typed pub/sub across threads

> The feature you've always wished `worker_threads` had: send strongly-typed events both ways with one shared contract.

```ts
type Events = {
  progress: { done: number; total: number };
  log: string;
  cancel: void;                                    // void events → no payload arg
};

const thread = Thread.fromFunction<Events, number, number>((bus, n) => {
  bus.on('cancel', () => { /* gracefully stop */ });

  for (let i = 0; i < n; i++) {
    bus.emit('progress', { done: i, total: n });
  }
  bus.emit('log', 'done');
  return n;
});

thread.on('progress', (p) => render(p.done / p.total));
thread.on('log',      (msg) => console.log(msg));

thread.emit('cancel');
```

**One event map, two endpoints.** Both `thread.on(...)` on the main side and `bus.on(...)` inside the worker are typed against the same `Events`. Rename a field; both sides break at compile time.

**Five methods, total surface.** `emit / on / once / off / waitFor` — and `on()` returns its own unsubscribe function, so cleanup is one variable.

<details>
<summary><b>File-based workers (recommended for non-trivial logic)</b></summary>

```ts
// worker.ts
import { defineWorker, workerBus } from 'hurried';

export type Events = { progress: { done: number; total: number } };
const bus = workerBus<Events>();

export default defineWorker({
  process(items: string[]) {
    items.forEach((item, i) => {
      bus.emit('progress', { done: i + 1, total: items.length });
    });
    return items.length;
  },
});
```

```ts
// main.ts
import { Thread } from 'hurried';
import type { Events } from './worker.ts';

const thread = Thread.fromFile<Events>(new URL('./worker.js', import.meta.url));
thread.on('progress', (p) => console.log(p));
const count = await thread.run('process', ['a', 'b', 'c']);
```

</details>

<details>
<summary><b>Pools — events aggregated, broadcasts unified</b></summary>

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

</details>

---

## 🎯 Pattern showcase

Five real TypeScript pain points, each painful with raw `worker_threads` and a one-liner with hurried.

### 1. Typed RPC across the worker boundary

```ts
// worker.ts
import { defineWorker } from 'hurried';

export const handlers = defineWorker({
  add: (a: number, b: number) => a + b,
  greet: (name: string) => `Hello, ${name}!`,
  hash: async (input: string) =>
    (await import('node:crypto')).createHash('sha256').update(input).digest('hex'),
});

export type Handlers = typeof handlers;
```

```ts
// main.ts
import { Thread } from 'hurried';
import type { Handlers } from './worker.ts';

const thread = Thread.fromFile(new URL('./worker.js', import.meta.url));
await thread.run('add', 2, 5);          // Promise<number>
await thread.run('greet', 'world');     // Promise<string>
```

Worker file = single source of truth. Export its handler-map type; import it back in main.

### 2. Streaming progress from CPU-bound work

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

thread.on('progress', (p) => process.stdout.write(`\r${p.pctText}`));
await thread.run(50_000_000);
```

Live progress bar, fully typed, no polling.

### 3. Cooperative cancellation through the bus

```ts
type Events = { cancel: void; cancelled: { atIteration: number } };

const thread = Thread.fromFunction<Events, number, 'completed' | 'cancelled'>(
  async (bus, n) => {
    let stop = false;
    bus.on('cancel', () => { stop = true; });

    const chunk = 5_000_000;
    for (let i = 0; i < n; i += chunk) {
      if (stop) { bus.emit('cancelled', { atIteration: i }); return 'cancelled'; }
      for (let j = 0; j < chunk; j++) Math.sqrt(i + j);
      await new Promise((r) => setImmediate(r));    // drain pending messages
    }
    return 'completed';
  },
);

setTimeout(() => thread.emit('cancel'), 200);
```

> 💬 Pro tip: Node workers won't process incoming messages while inside a tight sync loop. `await setImmediate` is the cooperative yield that lets cancellation actually arrive.

### 4. Aggregated events from many workers

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
```

### 5. Worker as a finite state machine

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
  bus.emit('state', { phase: 'processing', chunk: 1 });
  bus.emit('state', { phase: 'done', bytes: 1234 });
  return 1234;
});

thread.on('state', (s) => {
  switch (s.phase) {
    case 'downloading': console.log(`↓ ${s.url}`); break;       // s narrows here
    case 'processing':  console.log(`⚙ chunk ${s.chunk}`); break;
    case 'done':        console.log(`✓ ${s.bytes} bytes`); break;
    case 'error':       console.error(s.message); break;
  }
});
```

TypeScript narrows the union per branch — no `as any`, no manual type guards.

---

## 📚 API reference

> Full interactive API reference lives at the [**docs site**](https://yankouskia.github.io/hurried/). Below is the cheat sheet.

### `Thread`

| Method | Description |
| --- | --- |
| `Thread.fromFunction(task, options?)` | Spawn from inline function. Declare two params `(bus, arg)` to receive a typed `Bus`. |
| `Thread.fromFile(filename, options?)` | Spawn from a module file (pair with `defineWorker` / `workerBus`). |
| `Thread.fromScript(script, options?)` | Spawn from a raw code string. |
| `thread.run(arg, options?)` | Invoke the default inline task. |
| `thread.run(name, ...args)` | Invoke a named handler. |
| `thread.on / once / off / emit / bus()` | Typed event API. |
| `thread.terminate()` | Stop the worker; pending calls reject with `TerminatedError`. |

### `Pool`

| Method | Description |
| --- | --- |
| `new Pool({ task, size?, maxQueue?, timeout?, … })` | Fixed-size pool of workers running the same task. |
| `pool.run / pool.map` | Run one or many. Inputs preserve order. |
| `pool.on / emit / bus()` | Aggregated event bus across workers. |
| `pool.size / idleCount / queueLength` | Inspection. |
| `pool.terminate()` | Reject queued tasks, tear down workers. |

### Helpers

| Function | Description |
| --- | --- |
| `parallel(tasks, options?)` | Run an array of inline functions concurrently. |
| `mapParallel(items, task, options?)` | Parallel-map an iterable through one task using a pool. |
| `defineWorker(handlers)` | Register a typed handler map inside a worker file. |
| `workerBus<Events>()` | Get the typed `Bus<Events>` inside a worker. |

### Options

```ts
interface RunOptions {
  timeout?: number;                 // per-call timeout (ms)
  signal?: AbortSignal;             // cancellation
  transferList?: TransferListItem[];// zero-copy transfers
}
```

`ThreadOptions` extends Node's `WorkerOptions` (`env`, `execArgv`, `stdin`/`out`/`err`, `workerData`, `resourceLimits`, `name`) and adds a `timeout` default.

### Errors

All errors extend `HurriedError`: `TaskError` (handler threw — original in `.cause`), `TaskTimeoutError`, `TaskAbortedError`, `TerminatedError`.

---

## 🧪 Testing

- **Vitest** with v8 coverage. CI enforces ≥ 50% thresholds; the suite ships at **~95% statements**.
- **95 tests** across 11 files: bus, runtime, protocol, thread, pool, parallel helpers, legacy handler API.
- **Matrix CI:** Node 18 / 20 / 22 / 24 × Ubuntu / macOS / Windows × lint + typecheck + format + test + coverage + build + examples.

```sh
npm test               # run once
npm run test:watch     # watch mode
npm run test:coverage  # full report
```

---

## 🤝 Contributing

```sh
npm install
npm run lint           # eslint flat config
npm run typecheck      # tsc --noEmit
npm test               # vitest
npm run build          # tsup → dist/ (ESM + CJS + .d.ts)

npm run docs:dev       # local docs preview
npm run docs:build     # static site → website/build
```

PRs welcome. Code is TypeScript-first with no shortcuts — every public surface is fully typed, and the test suite enforces both behavior and coverage.

---

## 🗺 Migration from v1

```diff
- const { Thread, makeExecutable } = require('hurried');
+ import { Thread, defineWorker, workerBus } from 'hurried';

- module.exports.slow = slow;
- makeExecutable(slow, 'slow');
+ export default defineWorker({ slow });
```

- **ESM-first** build; CJS still works via the `require` export.
- New `Thread.fromFunction` replaces ad-hoc `fromScript` for inline tasks — fully type-safe.
- New `Pool` / `parallel` / `mapParallel` cover the common parallel-map case.
- New `Bus<Events>` — typed pub/sub across the worker boundary.
- `AbortSignal` and per-call `timeout` are first-class everywhere.
- Legacy `makeExecutable` still works, so v1 worker files don't need to change.

---

## 📜 License

[MIT](./LICENSE) © [Alex Yankouski](https://github.com/yankouskia)

<div align="center">

<sub>Built with ❤️ for the JS/TS ecosystem · ⭐ <a href="https://github.com/yankouskia/hurried">Star us on GitHub</a> if hurried makes your code faster.</sub>

</div>

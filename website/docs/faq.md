---
id: faq
title: FAQ
sidebar_position: 10
description: Frequently asked questions about hurried.
---

# FAQ

### Why workers and not `child_process`?

Spawning a child process is heavy — a new V8 instance per process, expensive setup, no shared memory. Worker threads share the same process, are an order of magnitude faster to spin up, and let you transfer `ArrayBuffer`s without copying. Workers are almost always the right choice for CPU-bound JavaScript.

### Should I use a worker for I/O?

Usually no. Node's I/O is already non-blocking and lives on the event loop. Workers are for **CPU-bound work**: image processing, hashing, parsing, math. If your bottleneck is disk or network, optimize the I/O itself first.

### Why does my worker hang?

Probably you forgot to `await thread.terminate()` or `await pool.terminate()`. Workers are real OS-level resources; the Node process won't exit while they're alive.

### Why didn't my `bus.on` listener fire?

If the worker is inside a synchronous loop, it can't process incoming messages until the loop ends. Yield to the event loop periodically:

```ts
for (let i = 0; i < n; i++) {
  doWork(i);
  if (i % 1_000_000 === 0) await new Promise((r) => setImmediate(r));
}
```

### Can I pass functions / class instances over the bus?

No — payloads cross via Node's structured clone algorithm, same rules as `postMessage`. Functions, class instances with custom prototypes, and DOM nodes don't survive the trip. Plain objects, `Map`, `Set`, `Date`, typed arrays all work.

### Can I share memory between workers?

Yes — use `SharedArrayBuffer` and pass it via `workerData` or `transferList`. Same rules as Node `worker_threads`.

### Does hurried work in the browser?

No — hurried is built on Node.js `worker_threads`. For browser workers, look at libraries like `comlink` or `threads.js`.

### Does it work with `tsx` / `ts-node`?

Yes. `Thread.fromFunction` works out of the box. `Thread.fromFile` pointing at a `.ts` file needs `execArgv: ['--import', 'tsx']`:

```ts
Thread.fromFile(new URL('./worker.ts', import.meta.url), {
  execArgv: ['--import', 'tsx'],
});
```

### How big is the bundle?

About **20 kB** minified. Zero runtime dependencies.

### What's the Node version requirement?

**Node 18.17+** for `availableParallelism()` and modern `AbortSignal` semantics. The CI matrix tests Node 18, 20, 22, and 24 on Ubuntu, macOS, and Windows.

### Where do I report bugs?

[https://github.com/yankouskia/hurried/issues](https://github.com/yankouskia/hurried/issues). Stars and PRs welcome too.

### What's the latest version?

**2.0.2** on [npm](https://www.npmjs.com/package/hurried). See the [full changelog](https://github.com/yankouskia/hurried/blob/master/CHANGELOG.md).

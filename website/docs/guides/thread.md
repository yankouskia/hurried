---
id: thread
title: Thread
sidebar_position: 2
description: Single-worker primitive with typed RPC and a typed Bus.
---

# Thread

A `Thread` is a single Node.js worker thread wrapped in a typed, ergonomic API.

## Three ways to create one

### `Thread.fromFunction(task)` — inline

Best for self-contained functions. The function is serialized to source, so don't reference closure variables.

```ts
const t = Thread.fromFunction((n: number) => n * 2);
await t.run(21);
```

With a typed bus (declare two params):

```ts
type Events = { progress: { done: number } };

const t = Thread.fromFunction<Events, number, number>((bus, n) => {
  bus.emit('progress', { done: n });
  return n * 2;
});
t.on('progress', (p) => console.log(p));
```

### `Thread.fromFile(filename)` — file-based

Best for non-trivial workers that need imports. Pair with [`defineWorker`](../api/define-worker) and [`workerBus`](./bus#file-based-recommended-for-non-trivial-logic).

```ts
const t = Thread.fromFile(new URL('./worker.js', import.meta.url));
await t.run('process', input);
```

### `Thread.fromScript(code)` — code string

Useful for tooling and code-gen pipelines.

```ts
const t = Thread.fromScript(`
  const { parentPort } = require('worker_threads');
  parentPort.on('message', (msg) => parentPort.postMessage({ ok: true, result: msg.args[0] * 3 }));
`);
```

## The `run` method

Two call shapes, picked by the first argument's type.

```ts
t.run(arg, options?)                      // default inline task
t.run(handlerName, ...args, options?)     // named handler from defineWorker / makeExecutable
```

`options` is a `RunOptions` object:

```ts
interface RunOptions {
  timeout?: number;                  // ms; rejects with TaskTimeoutError
  signal?: AbortSignal;              // rejects with TaskAbortedError
  transferList?: TransferListItem[]; // zero-copy ArrayBuffers, MessagePorts, ...
}
```

## Lifecycle

```ts
t.isTerminated      // boolean
t.pendingCount      // in-flight calls
await t.terminate() // stop the worker; pending calls reject TerminatedError
```

`terminate()` is idempotent and returns the worker exit code (or 0 if already terminated).

## Type parameters

```ts
Thread<TEvents extends EventMap = EventMap, TArg = unknown, TResult = unknown>
```

- `TEvents` — event map for the bus.
- `TArg` — argument type for `run(arg)` on inline tasks.
- `TResult` — return type for `run()`.

All three have sensible defaults; you'll usually only specify them when the inline task uses the bus.

## Errors you might see

| Error                | Cause                                              |
| -------------------- | -------------------------------------------------- |
| `TaskError`          | Handler threw or rejected. Original error in `.cause`. |
| `TaskTimeoutError`   | `timeout` exceeded.                                |
| `TaskAbortedError`   | An `AbortSignal` fired.                            |
| `TerminatedError`    | Worker was terminated mid-flight.                  |

All extend [`HurriedError`](../api/errors).

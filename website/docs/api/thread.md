---
id: thread
title: Thread
sidebar_position: 1
description: API reference for the Thread class.
---

# `Thread<TEvents, TArg, TResult>`

A managed Node.js worker with a typed request/response protocol and a typed Bus.

## Static factories

### `Thread.fromFunction(task, options?)`

Spawn a worker from a self-contained inline function.

```ts
static fromFunction<TArg, TResult>(
  task: (arg: TArg) => TResult | Promise<TResult>,
  options?: ThreadOptions,
): Thread<EventMap, TArg, TResult>;

static fromFunction<TEvents extends EventMap, TArg, TResult>(
  task: (bus: Bus<TEvents>, arg: TArg) => TResult | Promise<TResult>,
  options?: ThreadOptions,
): Thread<TEvents, TArg, TResult>;
```

Pick the overload that matches your task signature. Two-parameter tasks receive a typed `Bus` as the first argument.

### `Thread.fromFile(filename, options?)`

Spawn a worker from a module file. Pair with [`defineWorker`](./define-worker) inside the file.

```ts
static fromFile<TEvents, TArg, TResult>(
  filename: string | URL,
  options?: ThreadOptions,
): Thread<TEvents, TArg, TResult>;
```

### `Thread.fromScript(script, options?)`

Spawn a worker from a raw code string (CommonJS).

```ts
static fromScript<TEvents, TArg, TResult>(
  script: string,
  options?: ThreadOptions,
): Thread<TEvents, TArg, TResult>;
```

### `Thread.isMainThread()`

Returns `true` when the current code is executing in the main thread (not inside a worker).

### `Thread.setMaxListeners(count)`

Convenience wrapper around Node's `EventEmitter.defaultMaxListeners`. Useful when you're spawning many threads and want to silence the default 10-listener warning.

## Instance API

### `thread.run(arg, options?)` — default task

```ts
run(arg: TArg, options?: RunOptions): Promise<TResult>;
```

Invokes the inline task with the given argument.

### `thread.run(handlerName, ...args)` — named handler

```ts
run(handler: string, ...args: unknown[]): Promise<TResult>;
```

Invokes a handler registered via `defineWorker` or `makeExecutable`. If the last argument is a `RunOptions` object, it's used for the call.

### `thread.on / once / off / emit / bus()`

Typed event API. See [Bus](./bus) for details. Shorthand:

```ts
thread.on<K>(event, listener)    // Unsubscribe
thread.once<K>(event, listener)
thread.off<K>(event, listener)
thread.emit<K>(event, payload?)
thread.bus()                     // Bus<TEvents>
```

### `thread.terminate()`

Stop the worker. Pending calls reject with `TerminatedError`.

```ts
await thread.terminate(): Promise<number>;
```

Returns the worker's exit code (or 0 if already terminated). Safe to call multiple times.

### Inspection

```ts
thread.isTerminated      // boolean
thread.pendingCount      // number of in-flight calls
```

## Errors

All errors extend `HurriedError`:

| Error                | When                                                |
| -------------------- | --------------------------------------------------- |
| `TaskError`          | Handler threw or rejected; original in `.cause`     |
| `TaskTimeoutError`   | `timeout` was exceeded                              |
| `TaskAbortedError`   | An `AbortSignal` fired                              |
| `TerminatedError`    | Worker was terminated mid-flight                    |

See [Errors](./errors) for the full hierarchy.

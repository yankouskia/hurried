---
id: errors
title: Errors
sidebar_position: 6
description: Structured error hierarchy.
---

# Error hierarchy

All hurried errors extend `HurriedError`, so you can `instanceof HurriedError` to detect anything from the library.

```mermaid
classDiagram
  HurriedError <|-- TaskError
  HurriedError <|-- TaskTimeoutError
  HurriedError <|-- TaskAbortedError
  HurriedError <|-- TerminatedError
  HurriedError <|-- WorkerExitedError
  class HurriedError {
    +string name
    +string message
  }
  class TaskError {
    +unknown cause
  }
  class TaskTimeoutError {
    +number timeoutMs
  }
  class WorkerExitedError {
    +number code
  }
```

## `HurriedError`

Base class. `instanceof HurriedError` matches every other library error.

## `TaskError`

A handler threw or rejected. The original error is on `.cause`:

```ts
try {
  await thread.run('process', data);
} catch (e) {
  if (e instanceof TaskError) {
    console.error('handler failed:', e.cause);
  }
}
```

## `TaskTimeoutError`

The call exceeded its `timeout`. `.timeoutMs` carries the configured deadline.

```ts
try {
  await thread.run(arg, { timeout: 500 });
} catch (e) {
  if (e instanceof TaskTimeoutError) retryWithLongerTimeout();
}
```

## `TaskAbortedError`

An `AbortSignal` fired during the call.

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 100);

try {
  await thread.run(arg, { signal: controller.signal });
} catch (e) {
  if (e instanceof TaskAbortedError) { /* swallow */ }
}
```

## `TerminatedError`

The worker was **deliberately** torn down mid-flight via `terminate()`.

```ts
const promise = thread.run(arg);
await thread.terminate();        // promise rejects with TerminatedError
```

## `WorkerExitedError`

The worker exited **on its own** — `process.exit()` in task code, an OOM, or a fatal native error — rather than being terminated. Kept distinct from `TerminatedError` so the [`*Settled` helpers](../guides/settled) can treat a crashed worker as a recoverable per-item failure instead of a deliberate stop. Exposes the exit `code` when the runtime reports one.

```ts
try {
  await thread.run(arg);
} catch (e) {
  if (e instanceof WorkerExitedError) respawn();
}
```

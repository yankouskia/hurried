---
id: define-worker
title: defineWorker & makeExecutable
sidebar_position: 5
description: Register typed handler maps inside a worker file.
---

# `defineWorker(handlers)`

Register a typed map of handlers inside a worker file. Returns the same map so you can also export it for type-sharing.

```ts
function defineWorker<T extends HandlerMap>(handlers: T): T;
```

```ts
// worker.ts
import { defineWorker } from 'hurried';

export const handlers = defineWorker({
  add:   (a: number, b: number) => a + b,
  greet: (name: string)         => `Hello, ${name}!`,
});

export type Handlers = typeof handlers;
```

```ts
// main.ts
import { Thread } from 'hurried';
import type { Handlers } from './worker.js';

const thread = Thread.fromFile(new URL('./worker.js', import.meta.url));
await thread.run('add', 2, 5);            // Promise<number>
await thread.run('greet', 'world');       // Promise<string>
```

When the worker module is imported from the main thread (e.g. during tests), `defineWorker` is a no-op — it returns the map without registering any listeners.

# `makeExecutable(fn, name)`

V1-compatible single-handler registration. Still exported so existing v1 worker files continue to work.

```ts
function makeExecutable<TFn>(fn: TFn, name: string): void;
```

```ts
// legacy v1 worker — still works
import { makeExecutable } from 'hurried';

export function slow(n: number) { return n * 2; }
makeExecutable(slow, 'slow');
```

New code should prefer `defineWorker` for the typed handler-map ergonomics.

## `HandlerMap` type

```ts
type HandlerMap = Record<string, (...args: any[]) => any>;
```

Just an object of named functions. Handlers can be sync or async; their return value (or resolved value) is sent back to the caller.

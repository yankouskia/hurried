---
id: file-workers
title: File-based workers
sidebar_position: 5
description: Use defineWorker + workerBus for non-trivial worker logic that needs imports and a typed bus.
---

# File-based workers

Inline-function workers are perfect for small tasks. For anything that needs imports, multiple handlers, or a long-lived bus subscription, use a separate worker file with [`defineWorker`](../api/define-worker) and [`workerBus`](../api/bus#workerbus).

## The pattern

```ts
// shared.ts — types both sides import
export type Events = {
  progress: { done: number; total: number };
  log: string;
};

export type Handlers = {
  process: (items: string[]) => number;
  hash:    (input: string)   => string;
};
```

```ts
// worker.ts
import { createHash } from 'node:crypto';
import { defineWorker, workerBus } from 'hurried';
import type { Events } from './shared.js';

const bus = workerBus<Events>();

export default defineWorker({
  process(items: string[]) {
    items.forEach((item, i) => {
      bus.emit('progress', { done: i + 1, total: items.length });
    });
    return items.length;
  },
  hash(input: string) {
    bus.emit('log', `hashing ${input.length} bytes`);
    return createHash('sha256').update(input).digest('hex');
  },
});
```

```ts
// main.ts
import { Thread } from 'hurried';
import type { Events } from './shared.js';

const thread = Thread.fromFile<Events>(new URL('./worker.js', import.meta.url));

thread.on('progress', (p) => console.log(`${p.done}/${p.total}`));
thread.on('log',      (m) => console.log(`[worker] ${m}`));

const count = await thread.run('process', ['a', 'b', 'c']);
const hash  = await thread.run('hash', 'hello world');

await thread.terminate();
```

## Why a separate file?

- **Imports work.** Use `node:crypto`, third-party libs, anything you'd use in a regular Node module.
- **No serialization rules.** Inline tasks are stringified, which means no closure references. File modules don't have that constraint.
- **Multiple handlers.** A `defineWorker` map can register many named handlers in one file.
- **Type-export.** Export your handler-map and event types; import them into `main.ts` for end-to-end type safety.

## Caveat: TypeScript files at runtime

`Thread.fromFile` calls `new Worker(filename)` — Node's Worker can only execute compiled JavaScript by default. Two common solutions:

- **Compile and reference the .js**: build your worker file with `tsc` / `tsup` / `esbuild` and point `Thread.fromFile` at the `.js` output.
- **Use a TS loader**: pass `execArgv: ['--import', 'tsx']` (or `--loader ts-node/esm`) to `Thread.fromFile` to let the worker load `.ts` directly. Useful in development.

```ts
const thread = Thread.fromFile(new URL('./worker.ts', import.meta.url), {
  execArgv: ['--import', 'tsx'],
});
```

## v1 compatibility: `makeExecutable`

If you have v1 worker files using `makeExecutable(fn, name)`, they still work — `makeExecutable` is still exported and just registers a single named handler. New code should prefer `defineWorker` for the typed handler-map ergonomics.

```ts
// legacy v1 worker — still works
import { makeExecutable } from 'hurried';

export function slow(n: number) { return n * 2; }
makeExecutable(slow, 'slow');
```

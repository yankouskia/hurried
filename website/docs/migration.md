---
id: migration
title: Migration from v1
sidebar_position: 9
description: What changed between hurried v1 and v2.
---

# Migration from v1 → v2

hurried v2 is a complete TypeScript rewrite. The v1 public API still works where it makes sense — but you'll want to migrate to the new primitives for the type safety and the bus.

## Quick diff

```diff
- const { Thread, makeExecutable } = require('hurried');
+ import { Thread, defineWorker, workerBus } from 'hurried';

- module.exports.slow = slow;
- makeExecutable(slow, 'slow');
+ export default defineWorker({ slow });
```

## What changed

| Area                        | v1                                  | v2                                                                 |
| --------------------------- | ----------------------------------- | ------------------------------------------------------------------ |
| Language                    | JavaScript                          | TypeScript with `.d.ts` published                                  |
| Module format               | CommonJS                            | ESM + CJS (dual)                                                   |
| Min Node version            | 10.5                                | 18.17                                                              |
| Inline functions            | via `fromScript(code)` (untyped)    | `fromFunction(fn)` (typed)                                         |
| Pools                       | not built-in                        | `new Pool({ task, size })`                                         |
| Parallel helpers            | not built-in                        | `parallel`, `mapParallel`                                          |
| Pub/sub events              | not built-in                        | typed `Bus<TEvents>` on every primitive                            |
| Cancellation                | not built-in                        | `AbortSignal` + `timeout` on every call                            |
| Errors                      | plain `Error`                       | typed hierarchy (`TaskError`, `TaskTimeoutError`, …)               |
| Named handlers              | `makeExecutable(fn, name)`          | `defineWorker({ name: fn, ... })` (legacy `makeExecutable` kept)   |
| Tests                       | jest snapshots                      | vitest, 97% coverage, matrix CI                                    |

## Migration steps

### 1. Update imports

```diff
- const { Thread, makeExecutable } = require('hurried');
+ import { Thread, defineWorker, workerBus } from 'hurried';
```

### 2. Replace inline `fromScript` usage with `fromFunction`

```diff
- const thread = Thread.fromScript(`
-   const { makeExecutable } = require('hurried');
-   makeExecutable((n) => n * 2, 'double');
- `);
- await thread.run('double', 21);

+ const thread = Thread.fromFunction((n: number) => n * 2);
+ await thread.run(21);
```

### 3. Migrate handler files to `defineWorker`

```diff
- // worker.js
- const { makeExecutable } = require('hurried');
- function process(items) { /* ... */ return items.length; }
- module.exports.process = process;
- makeExecutable(process, 'process');

+ // worker.ts
+ import { defineWorker } from 'hurried';
+ export default defineWorker({
+   process(items: string[]) { /* ... */ return items.length; },
+ });
```

`makeExecutable` is still exported, so you don't *have* to migrate — but `defineWorker` gives you better type ergonomics.

### 4. Add typed events with `workerBus`

For workers that report progress or state, add a typed event map and reach for `workerBus<Events>()`:

```ts
// shared.ts
export type Events = {
  progress: { done: number; total: number };
};

// worker.ts
import { defineWorker, workerBus } from 'hurried';
import type { Events } from './shared.js';

const bus = workerBus<Events>();

export default defineWorker({
  process(items: string[]) {
    items.forEach((it, i) =>
      bus.emit('progress', { done: i + 1, total: items.length }),
    );
    return items.length;
  },
});

// main.ts
import type { Events } from './shared.js';
const thread = Thread.fromFile<Events>(new URL('./worker.js', import.meta.url));
thread.on('progress', (p) => render(p));
```

### 5. Adopt pools where it makes sense

Anywhere you had multiple workers running the same task, `Pool` cleans up the lifecycle:

```diff
- const threads = Array.from({ length: 4 }, () => Thread.fromFile('./worker.js'));
- const results = await Promise.all(inputs.map((x, i) => threads[i % 4].run('process', x)));
- threads.forEach((t) => t.terminate());

+ const pool = new Pool({ size: 4, task: processInput });
+ const results = await pool.map(inputs);
+ await pool.terminate();
```

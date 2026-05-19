---
id: bus
title: Bus & workerBus
sidebar_position: 3
description: API reference for the typed event Bus and the worker-side workerBus() helper.
---

# `Bus<TEvents>`

The typed pub/sub class behind every `on / emit` surface in hurried.

## Type parameters

```ts
type EventMap = Record<string, unknown>;
type EmitArgs<TPayload> = [TPayload] extends [void] ? [] : [TPayload];

class Bus<TEvents extends EventMap = EventMap>
```

`TEvents` is your event-name → payload-type map. Use `void` for payload-less events.

```ts
type Events = {
  progress: { done: number; total: number };
  log: string;
  cancel: void;
};
```

## Methods

### `emit(event, payload?)`

Send the event to the other side. No-op if this bus has no transport (e.g. inside the main thread).

```ts
emit<K>(event: K, ...args: EmitArgs<TEvents[K]>): void;

bus.emit('progress', { done: 5, total: 10 });
bus.emit('cancel');                              // void event
```

### `on(event, listener)`

Subscribe. Returns an `Unsubscribe` function.

```ts
on<K>(event: K, listener: (payload: TEvents[K]) => void): Unsubscribe;

const off = bus.on('progress', (p) => render(p));
// later:
off();
```

### `once(event, listener)`

Subscribe; auto-unsubscribe after the first event.

```ts
once<K>(event: K, listener: (payload: TEvents[K]) => void): Unsubscribe;
```

### `off(event, listener)`

Manually remove a listener. Prefer the unsubscribe function returned by `on()`.

```ts
off<K>(event: K, listener: (payload: TEvents[K]) => void): void;
```

### `waitFor(event, options?)`

Promise-style await for the next occurrence of an event. Combines with `AbortSignal` for cancellable awaits.

```ts
waitFor<K>(event: K, options?: { signal?: AbortSignal }): Promise<TEvents[K]>;

const { version } = await bus.waitFor('ready', { signal });
```

### `clear()`

Remove every listener on this bus.

### `listenerCount(event?)`

Returns the number of listeners for an event, or the total if no event is supplied.

## `workerBus<TEvents>()` {#workerbus}

Inside a worker module, returns the typed `Bus<TEvents>` for that worker. The bus is a singleton per worker — repeated calls return the same instance.

```ts
import { workerBus } from 'hurried';
import type { Events } from './shared.js';

const bus = workerBus<Events>();
bus.emit('progress', { done: 0, total: 100 });
```

When called outside a worker (main thread), it returns an inert bus — safe to import worker modules from your tests or main code without side effects.

/**
 * Type-safe pub/sub bus for communicating between the main thread and workers.
 *
 * Define an event map up-front and both sides — main and worker — get the same typed
 * `emit` / `on` / `once` API. No `any` leaks across the worker boundary.
 *
 * @example
 * ```ts
 * type Events = {
 *   progress: { done: number; total: number };
 *   log: string;
 *   cancel: void;
 * };
 *
 * thread.on('progress', (p) => console.log(p));       // typed payload
 * thread.emit('cancel');                              // void event — no payload arg
 * ```
 */

/** Map of event-name → payload type. Use `void` for payload-less events. */
export type EventMap = Record<string, unknown>;

/** Unsubscribe function returned by {@link Bus.on} and {@link Bus.once}. */
export type Unsubscribe = () => void;

type Listener<TPayload> = (payload: TPayload) => void;

/**
 * Argument tuple for {@link Bus.emit}. Resolves to `[]` for `void` events and
 * `[TPayload]` for everything else — giving you a clean call site:
 *
 * ```ts
 * bus.emit('cancel');                     // void event
 * bus.emit('progress', { done: 5, total: 10 });
 * ```
 */
export type EmitArgs<TPayload> = [TPayload] extends [void] ? [] : [TPayload];

/**
 * A typed pub/sub channel.
 *
 * - `emit(event, payload)` — send to the other side (worker ↔ main).
 * - `on(event, listener)` — subscribe; returns an unsubscribe function.
 * - `once(event, listener)` — subscribe to a single occurrence.
 * - `off(event, listener)` — manually unsubscribe.
 */
export class Bus<TEvents extends EventMap = EventMap> {
  private readonly listeners = new Map<string, Set<Listener<unknown>>>();
  private readonly forwarders = new Set<Bus<EventMap>>();
  private readonly sender?: (event: string, payload: unknown) => void;

  constructor(sender?: (event: string, payload: unknown) => void) {
    this.sender = sender;
  }

  /** Send an event to the other side. No-op if this bus has no transport (e.g. inside the main thread). */
  emit<K extends keyof TEvents & string>(event: K, ...args: EmitArgs<TEvents[K]>): void {
    const payload = (args as unknown[])[0];
    this.sender?.(event, payload);
  }

  /** Subscribe to an event coming from the other side. Returns an unsubscribe function. */
  on<K extends keyof TEvents & string>(
    event: K,
    listener: (payload: TEvents[K]) => void,
  ): Unsubscribe {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<unknown>);
    return () => {
      set!.delete(listener as Listener<unknown>);
    };
  }

  /** Subscribe to the next occurrence of an event, then automatically unsubscribe. */
  once<K extends keyof TEvents & string>(
    event: K,
    listener: (payload: TEvents[K]) => void,
  ): Unsubscribe {
    const off = this.on(event, (payload) => {
      off();
      listener(payload);
    });
    return off;
  }

  /** Manually unsubscribe a listener. Prefer the function returned by {@link Bus.on}. */
  off<K extends keyof TEvents & string>(event: K, listener: (payload: TEvents[K]) => void): void {
    this.listeners.get(event)?.delete(listener as Listener<unknown>);
  }

  /** Resolves on the next occurrence of an event. Combine with `AbortSignal` for cancellation. */
  waitFor<K extends keyof TEvents & string>(
    event: K,
    options: { signal?: AbortSignal } = {},
  ): Promise<TEvents[K]> {
    return new Promise<TEvents[K]>((resolve, reject) => {
      const off = this.once(event, (payload) => {
        if (cleanup) cleanup();
        resolve(payload);
      });
      const cleanup = options.signal
        ? () => options.signal!.removeEventListener('abort', onAbort)
        : null;
      const onAbort = () => {
        off();
        if (cleanup) cleanup();
        reject(new Error('waitFor: aborted'));
      };
      if (options.signal) {
        if (options.signal.aborted) {
          off();
          reject(new Error('waitFor: aborted'));
          return;
        }
        options.signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  /** Remove every listener on this bus. */
  clear(): void {
    this.listeners.clear();
  }

  /** Number of active listeners for an event (or every event, if omitted). */
  listenerCount(event?: keyof TEvents & string): number {
    if (event) return this.listeners.get(event)?.size ?? 0;
    let total = 0;
    for (const s of this.listeners.values()) total += s.size;
    return total;
  }

  /** @internal — deliver an incoming event from the transport to local listeners and forwarders. */
  __publish(event: string, payload: unknown): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const l of set) l(payload);
    }
    for (const f of this.forwarders) f.__publish(event, payload);
  }

  /** @internal — pipe every incoming event through to another bus (used by Pool to aggregate). */
  __forwardTo(target: Bus<EventMap>): Unsubscribe {
    this.forwarders.add(target);
    return () => {
      this.forwarders.delete(target);
    };
  }
}

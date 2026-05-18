import { EventEmitter } from 'node:events';
import { Worker, isMainThread } from 'node:worker_threads';
import { Bus, type EmitArgs, type EventMap, type Unsubscribe } from './bus.js';
import { TaskAbortedError, TaskError, TaskTimeoutError, TerminatedError } from './errors.js';
import {
  createBusMessage,
  createRequest,
  deserializeError,
  isBusMessage,
  isResponseMessage,
  type ResponseMessage,
} from './protocol.js';
import { buildInlineWorkerCode } from './runtime.js';
import type { RunOptions, ThreadOptions, Task } from './types.js';

const DEFAULT_HANDLER = '__default__';

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
  timer?: NodeJS.Timeout;
  abortListener?: () => void;
  signal?: AbortSignal;
}

/**
 * A managed Node.js Worker thread with a structured request/response protocol *and* a
 * typed pub/sub {@link Bus} for event-style communication.
 *
 * Use {@link Thread.fromFunction} for the simplest case (inline task), {@link Thread.fromFile}
 * for a worker module on disk, or {@link Thread.fromScript} for an embedded code string.
 *
 * @typeParam TEvents - The event map shared between the main thread and this worker.
 * @typeParam TArg    - The argument type accepted by the default inline task.
 * @typeParam TResult - The result type returned by the default inline task.
 */
export class Thread<TEvents extends EventMap = EventMap, TArg = unknown, TResult = unknown> {
  private readonly worker: Worker;
  private readonly defaultTimeout: number | undefined;
  private readonly pending = new Map<string, PendingCall>();
  private readonly _bus: Bus<TEvents>;
  private terminated = false;

  /** @internal */
  constructor(worker: Worker, defaultTimeout?: number) {
    this.worker = worker;
    this.defaultTimeout = defaultTimeout;

    this._bus = new Bus<TEvents>((event, payload) => {
      this.worker.postMessage(createBusMessage(event, payload));
    });

    this.worker.on('message', (msg: unknown) => {
      if (isBusMessage(msg)) {
        this._bus.__publish(msg.event, msg.payload);
        return;
      }
      if (isResponseMessage(msg)) this.handleResponse(msg);
    });

    this.worker.on('error', (err) => this.rejectAll(err));
    this.worker.on('exit', () => {
      if (this.terminated) return;
      this.terminated = true;
      this.rejectAll(new TerminatedError());
    });
  }

  /**
   * Set the global default max listeners for EventEmitter — useful when spinning up many threads.
   * @see https://nodejs.org/api/events.html#emittersetmaxlistenersn
   */
  static setMaxListeners(count: number): void {
    EventEmitter.defaultMaxListeners = count;
  }

  /** True when the current code is executing in the main thread (not inside a worker). */
  static isMainThread(): boolean {
    return isMainThread;
  }

  /**
   * Create a thread that runs a single, self-contained inline function.
   *
   * The function is serialized to source — **don't reference closure variables**, imports
   * or `this`. The first parameter is treated as a {@link Bus} handle when the function
   * declares two or more parameters; single-parameter functions keep the simple
   * `(arg) => result` contract.
   *
   * @example
   * ```ts
   * // Simple case — no bus
   * const t = Thread.fromFunction((n: number) => n * 2);
   * await t.run(21); // 42
   *
   * // With bus
   * type Events = { progress: { done: number; total: number } };
   * const t = Thread.fromFunction<Events, number, number>((bus, n) => {
   *   bus.emit('progress', { done: 0, total: n });
   *   return n;
   * });
   * t.on('progress', (p) => console.log(p));
   * ```
   */
  static fromFunction<TArg, TResult>(
    task: (arg: TArg) => TResult | Promise<TResult>,
    options?: ThreadOptions,
  ): Thread<EventMap, TArg, TResult>;
  static fromFunction<TEvents extends EventMap, TArg, TResult>(
    task: (bus: Bus<TEvents>, arg: TArg) => TResult | Promise<TResult>,
    options?: ThreadOptions,
  ): Thread<TEvents, TArg, TResult>;
  static fromFunction(
    task: (...args: any[]) => any,
    options: ThreadOptions = {},
  ): Thread<EventMap, unknown, unknown> {
    const code = buildInlineWorkerCode(task.toString(), task.length);
    return Thread.fromScript(code, options);
  }

  /**
   * Create a thread from a worker module on disk. The file should register handlers via
   * {@link defineWorker} or the legacy {@link makeExecutable} and may obtain its bus via
   * {@link workerBus}.
   */
  static fromFile<TEvents extends EventMap = EventMap, TArg = unknown, TResult = unknown>(
    filename: string | URL,
    options: ThreadOptions = {},
  ): Thread<TEvents, TArg, TResult> {
    const { timeout, ...workerOptions } = options;
    const worker = new Worker(filename, { ...workerOptions, eval: false });
    return new Thread<TEvents, TArg, TResult>(worker, timeout);
  }

  /**
   * Create a thread from a raw code string (CommonJS by default).
   */
  static fromScript<TEvents extends EventMap = EventMap, TArg = unknown, TResult = unknown>(
    script: string,
    options: ThreadOptions = {},
  ): Thread<TEvents, TArg, TResult> {
    const { timeout, ...workerOptions } = options;
    const worker = new Worker(script, { ...workerOptions, eval: true });
    return new Thread<TEvents, TArg, TResult>(worker, timeout);
  }

  /** True if `terminate()` has been called (or the worker exited on its own). */
  get isTerminated(): boolean {
    return this.terminated;
  }

  /** Number of in-flight calls awaiting a response. */
  get pendingCount(): number {
    return this.pending.size;
  }

  /** Typed {@link Bus} for pub/sub between this thread and the main thread. */
  bus(): Bus<TEvents> {
    return this._bus;
  }

  /** Shortcut for `thread.bus().on(event, listener)`. */
  on<K extends keyof TEvents & string>(
    event: K,
    listener: (payload: TEvents[K]) => void,
  ): Unsubscribe {
    return this._bus.on(event, listener);
  }

  /** Shortcut for `thread.bus().once(event, listener)`. */
  once<K extends keyof TEvents & string>(
    event: K,
    listener: (payload: TEvents[K]) => void,
  ): Unsubscribe {
    return this._bus.once(event, listener);
  }

  /** Shortcut for `thread.bus().off(event, listener)`. */
  off<K extends keyof TEvents & string>(event: K, listener: (payload: TEvents[K]) => void): void {
    this._bus.off(event, listener);
  }

  /** Shortcut for `thread.bus().emit(event, payload)`. Sends the event into the worker. */
  emit<K extends keyof TEvents & string>(event: K, ...args: EmitArgs<TEvents[K]>): void {
    (this._bus.emit as (e: K, ...a: EmitArgs<TEvents[K]>) => void)(event, ...args);
  }

  /**
   * Invoke the default task on this thread (only works for inline-function threads).
   */
  run(arg: TArg, options?: RunOptions): Promise<TResult>;
  /**
   * Invoke a named handler registered via {@link makeExecutable} or {@link defineWorker}.
   */
  run(handler: string, ...args: unknown[]): Promise<TResult>;
  run(...callArgs: unknown[]): Promise<TResult> {
    if (this.terminated) {
      return Promise.reject(new TerminatedError());
    }

    let name: string;
    let args: unknown[];
    let options: RunOptions | undefined;

    if (typeof callArgs[0] === 'string') {
      name = callArgs[0];
      const last = callArgs[callArgs.length - 1];
      if (
        callArgs.length > 1 &&
        last !== null &&
        typeof last === 'object' &&
        ('timeout' in (last as object) ||
          'signal' in (last as object) ||
          'transferList' in (last as object))
      ) {
        args = callArgs.slice(1, -1);
        options = last as RunOptions;
      } else {
        args = callArgs.slice(1);
      }
    } else {
      name = DEFAULT_HANDLER;
      args = [callArgs[0] as unknown];
      options = callArgs[1] as RunOptions | undefined;
    }

    return this.dispatch(name, args, options);
  }

  private dispatch(name: string, args: unknown[], options?: RunOptions): Promise<TResult> {
    const request = createRequest(name, args);
    const timeoutMs = options?.timeout ?? this.defaultTimeout;
    const signal = options?.signal;

    if (signal?.aborted) {
      return Promise.reject(new TaskAbortedError(asAbortReason(signal)));
    }

    return new Promise<TResult>((resolve, reject) => {
      const entry: PendingCall = {
        resolve: resolve as (v: unknown) => void,
        reject,
        signal,
      };

      if (timeoutMs && timeoutMs > 0) {
        entry.timer = setTimeout(() => {
          this.settle(request.id, false, undefined, new TaskTimeoutError(timeoutMs));
        }, timeoutMs);
      }

      if (signal) {
        const onAbort = () =>
          this.settle(request.id, false, undefined, new TaskAbortedError(asAbortReason(signal)));
        entry.abortListener = onAbort;
        signal.addEventListener('abort', onAbort, { once: true });
      }

      this.pending.set(request.id, entry);

      try {
        if (options?.transferList && options.transferList.length > 0) {
          this.worker.postMessage(request, options.transferList as unknown as readonly any[]);
        } else {
          this.worker.postMessage(request);
        }
      } catch (err) {
        this.settle(
          request.id,
          false,
          undefined,
          new TaskError('Failed to post message to worker', err),
        );
      }
    });
  }

  private handleResponse(msg: ResponseMessage): void {
    if (msg.ok) {
      this.settle(msg.id, true, msg.result, undefined);
    } else {
      const cause = msg.error ? deserializeError(msg.error) : new Error('Unknown worker error');
      this.settle(msg.id, false, undefined, new TaskError(cause.message, cause));
    }
  }

  private settle(id: string, ok: boolean, result: unknown, err: unknown): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id);
    if (entry.timer) clearTimeout(entry.timer);
    if (entry.signal && entry.abortListener)
      entry.signal.removeEventListener('abort', entry.abortListener);
    if (ok) entry.resolve(result);
    else entry.reject(err);
  }

  private rejectAll(err: unknown): void {
    for (const [id, entry] of this.pending) {
      this.pending.delete(id);
      if (entry.timer) clearTimeout(entry.timer);
      if (entry.signal && entry.abortListener)
        entry.signal.removeEventListener('abort', entry.abortListener);
      entry.reject(err);
    }
  }

  /** Terminate the worker. Pending calls are rejected with a {@link TerminatedError}. */
  async terminate(): Promise<number> {
    if (this.terminated) return 0;
    this.terminated = true;
    this.rejectAll(new TerminatedError());
    this._bus.clear();
    return this.worker.terminate();
  }
}

// Re-export Task for legacy imports
export type { Task };

function asAbortReason(signal: AbortSignal): string | undefined {
  const reason = (signal as AbortSignal & { reason?: unknown }).reason;
  if (reason === undefined || reason === null) return undefined;
  if (reason instanceof Error) return reason.message;
  return String(reason);
}

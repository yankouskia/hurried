import { TaskAbortedError } from './errors.js';

/**
 * A source of items to stream through workers — an eager array, a lazy
 * generator, or any async source (a DB cursor, a file-line reader, a network
 * stream). Items are pulled on demand, so the source may even be infinite.
 */
export type StreamInput<T> = Iterable<T> | AsyncIterable<T>;

/** @internal options accepted by the core scheduler. */
interface StreamCoreOptions {
  /** Max number of tasks in flight (and buffered, when ordered) at any moment. */
  concurrency: number;
  /** Emit in input order (`true`) or as soon as each task settles (`false`). */
  ordered: boolean;
  /** Optional signal — checked between scheduling steps for prompt cancellation. */
  signal?: AbortSignal;
}

/** @internal a completed task, tagged with its input position. */
interface Settled<TResult> {
  index: number;
  ok: boolean;
  value?: TResult;
  error?: unknown;
}

function toIterator<T>(input: StreamInput<T>): AsyncIterator<T> | Iterator<T> {
  const asyncFactory = (input as AsyncIterable<T>)[Symbol.asyncIterator];
  if (typeof asyncFactory === 'function') return asyncFactory.call(input);
  return (input as Iterable<T>)[Symbol.iterator]();
}

/**
 * Core streaming scheduler shared by {@link Pool.stream} and
 * {@link mapParallelStream}.
 *
 * Pulls items lazily from `input`, keeps up to `concurrency` of them running
 * through `run` at once, and yields each result — in input order or as it
 * settles. The number of *outstanding* items (in flight + completed but not yet
 * emitted) never exceeds `concurrency`, so memory stays flat no matter how large
 * — or infinite — the source is. When the consumer stops pulling (a slow
 * `for await` body, an early `break`, or a thrown error) the source iterator is
 * closed.
 *
 * @internal
 */
export async function* streamResults<TArg, TResult>(
  input: StreamInput<TArg>,
  run: (arg: TArg) => Promise<TResult>,
  options: StreamCoreOptions,
): AsyncGenerator<TResult, void, void> {
  const { ordered, signal } = options;
  // Defend against NaN / 0 / negative — those would otherwise make the top-up
  // guard always-false and silently yield nothing.
  const limit =
    Number.isFinite(options.concurrency) && options.concurrency >= 1
      ? Math.floor(options.concurrency)
      : 1;
  const iterator = toIterator(input);

  const inFlight = new Map<number, Promise<Settled<TResult>>>();
  const buffer = new Map<number, TResult>(); // completed, awaiting in-order emit
  let nextIndex = 0; // next input slot to assign
  let emitIndex = 0; // next index to emit (ordered mode)
  let inputDone = false;

  try {
    while (true) {
      // Honor cancellation every iteration — not only while topping up — so an
      // abort still lands after the source has been fully drained.
      if (signal?.aborted) throw new TaskAbortedError(abortReason(signal));

      // 1. Top up to the concurrency cap. Outstanding = in flight + buffered, so
      //    a stuck head in ordered mode can't make us read the source unbounded.
      while (!inputDone && inFlight.size + buffer.size < limit) {
        if (signal?.aborted) throw new TaskAbortedError(abortReason(signal));
        const next = await iterator.next();
        if (next.done) {
          inputDone = true;
          break;
        }
        const index = nextIndex++;
        const settled = run(next.value).then(
          (value): Settled<TResult> => ({ index, ok: true, value }),
          (error): Settled<TResult> => ({ index, ok: false, error }),
        );
        inFlight.set(index, settled);
      }

      // 2. Source drained and nothing left running → done.
      if (inFlight.size === 0) return;

      // 3. Wait for the next task to settle.
      const settled = await Promise.race(inFlight.values());
      inFlight.delete(settled.index);
      if (!settled.ok) throw settled.error;

      // 4. Emit — immediately when unordered, or in contiguous runs when ordered.
      if (!ordered) {
        yield settled.value as TResult;
      } else {
        buffer.set(settled.index, settled.value as TResult);
        while (buffer.has(emitIndex)) {
          const value = buffer.get(emitIndex)!;
          buffer.delete(emitIndex);
          emitIndex++;
          yield value;
        }
      }
    }
  } finally {
    // Consumer broke early, an error propagated, or we finished — release the source.
    if (typeof iterator.return === 'function') {
      try {
        await iterator.return();
      } catch {
        // ignore errors from closing the source iterator
      }
    }
  }
}

function abortReason(signal: AbortSignal): string | undefined {
  const reason = (signal as AbortSignal & { reason?: unknown }).reason;
  if (reason === undefined || reason === null) return undefined;
  if (reason instanceof Error) return reason.message;
  return String(reason);
}

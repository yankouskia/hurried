import { TaskAbortedError, TerminatedError } from './errors.js';

/**
 * Retry configuration, or a bare number meaning "this many retries with the
 * defaults". `retry: 2` runs up to **three** times (one initial try + two
 * retries).
 */
export type RetryInput = number | RetryOptions;

export interface RetryOptions {
  /** Additional attempts after the first. `retries: 2` → up to 3 tries total. Default `0`. */
  retries?: number;
  /** Base delay (ms) before the first retry. Default `0` (retry immediately). */
  minDelay?: number;
  /** Upper bound (ms) on any single backoff delay. Default unbounded. */
  maxDelay?: number;
  /** Exponential multiplier per retry: `delay = minDelay * factor^(n-1)`. Default `2`. */
  factor?: number;
  /** Apply full jitter — a random value between 0 and the computed delay. Default `false`. */
  jitter?: boolean;
  /**
   * Decide whether a failed attempt should be retried. Receives the error and
   * the 1-based number of the attempt that just failed. Default: retry every
   * error **except** cancellation/teardown ({@link TaskAbortedError},
   * {@link TerminatedError}).
   */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Invoked after a failed attempt, just before the backoff delay. */
  onRetry?: (error: unknown, attempt: number) => void;
}

interface NormalizedRetry {
  retries: number;
  minDelay: number;
  maxDelay: number;
  factor: number;
  jitter: boolean;
  shouldRetry: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number) => void;
}

const defaultShouldRetry = (error: unknown): boolean =>
  !(error instanceof TaskAbortedError) && !(error instanceof TerminatedError);

/**
 * Resolve a {@link RetryInput} to a concrete config, or `undefined` when no
 * retrying should happen (missing input, or zero retries).
 *
 * @internal
 */
export function normalizeRetry(input: RetryInput | undefined): NormalizedRetry | undefined {
  if (input == null) return undefined;
  const opts = typeof input === 'number' ? { retries: input } : input;
  const retries = Number.isFinite(opts.retries)
    ? Math.max(0, Math.floor(opts.retries as number))
    : 0;
  if (retries === 0) return undefined;
  return {
    retries,
    minDelay: Number.isFinite(opts.minDelay) ? Math.max(0, opts.minDelay as number) : 0,
    maxDelay: Number.isFinite(opts.maxDelay)
      ? Math.max(0, opts.maxDelay as number)
      : Number.POSITIVE_INFINITY,
    factor: Number.isFinite(opts.factor) ? (opts.factor as number) : 2,
    jitter: opts.jitter ?? false,
    shouldRetry: opts.shouldRetry ?? defaultShouldRetry,
    onRetry: opts.onRetry,
  };
}

/** Largest delay `setTimeout` accepts without overflowing to ~immediate (~24.8 days). */
const MAX_TIMER = 2_147_483_647;

/**
 * Run `attempt` up to `retries + 1` times, applying backoff between failures.
 * Stops early — re-throwing the last error — when the attempts are exhausted,
 * the signal aborts, or `shouldRetry` declines. Shared by `Thread.run` and
 * `Pool.run`.
 *
 * @internal
 */
export async function withRetry<T>(
  attempt: () => Promise<T>,
  retry: NormalizedRetry,
  signal?: AbortSignal,
): Promise<T> {
  const maxTries = retry.retries + 1;
  for (let tryNo = 1; ; tryNo++) {
    try {
      return await attempt();
    } catch (error) {
      const isLast = tryNo >= maxTries;
      if (isLast || signal?.aborted || !retry.shouldRetry(error, tryNo)) throw error;
      retry.onRetry?.(error, tryNo);
      const delay = computeDelay(retry, tryNo);
      if (delay > 0) await abortableDelay(delay, signal);
    }
  }
}

function computeDelay(retry: NormalizedRetry, tryNo: number): number {
  if (retry.minDelay <= 0) return 0;
  const grown = retry.minDelay * Math.pow(retry.factor, tryNo - 1);
  // Clamp below the setTimeout overflow ceiling so an unbounded maxDelay can't
  // make a huge backoff wrap around to firing almost immediately.
  const capped = Math.min(grown, retry.maxDelay, MAX_TIMER);
  return retry.jitter ? Math.random() * capped : capped;
}

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new TaskAbortedError(abortReason(signal)));
      return;
    }
    const onAbort = signal
      ? () => {
          clearTimeout(timer);
          reject(new TaskAbortedError(abortReason(signal)));
        }
      : undefined;
    const timer = setTimeout(() => {
      if (signal && onAbort) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    if (signal && onAbort) signal.addEventListener('abort', onAbort, { once: true });
  });
}

function abortReason(signal: AbortSignal): string | undefined {
  const reason = (signal as AbortSignal & { reason?: unknown }).reason;
  if (reason === undefined || reason === null) return undefined;
  if (reason instanceof Error) return reason.message;
  return String(reason);
}

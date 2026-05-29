import { describe, expect, it } from 'vitest';
import { TaskAbortedError, TerminatedError } from '../src/errors';
import { mapParallel, mapParallelStream } from '../src/parallel';
import { Pool } from '../src/pool';
import { normalizeRetry, withRetry } from '../src/retry';
import { Thread } from '../src/thread';

async function collect<T>(gen: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

// ---------------------------------------------------------------------------
// Core (normalizeRetry + withRetry) — fast, deterministic, no worker threads.
// ---------------------------------------------------------------------------
describe('normalizeRetry', () => {
  it('treats missing / zero / negative / NaN as "no retry"', () => {
    expect(normalizeRetry(undefined)).toBeUndefined();
    expect(normalizeRetry(0)).toBeUndefined();
    expect(normalizeRetry(-2)).toBeUndefined();
    expect(normalizeRetry(NaN)).toBeUndefined();
    expect(normalizeRetry({ retries: 0 })).toBeUndefined();
  });

  it('expands a bare number and fills defaults', () => {
    const r = normalizeRetry(3)!;
    expect(r.retries).toBe(3);
    expect(r.factor).toBe(2);
    expect(r.minDelay).toBe(0);
    expect(r.jitter).toBe(false);
  });
});

describe('withRetry', () => {
  it('does not retry on first-try success', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      return 42;
    }, normalizeRetry(3)!);
    expect(result).toBe(42);
    expect(calls).toBe(1);
  });

  it('retries until a try succeeds', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls < 3) throw new Error('flaky');
      return 'ok';
    }, normalizeRetry(3)!);
    expect(result).toBe('ok');
    expect(calls).toBe(3); // failed twice, succeeded on the third
  });

  it('rejects with the last error after exhausting retries', async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw new Error('fail-' + calls);
      }, normalizeRetry(2)!),
    ).rejects.toThrow('fail-3');
    expect(calls).toBe(3); // 1 initial + 2 retries
  });

  it('honors shouldRetry and reports each retry via onRetry', async () => {
    const seen: number[] = [];
    const retry = normalizeRetry({
      retries: 5,
      onRetry: (_e, attempt) => seen.push(attempt),
      shouldRetry: (_e, attempt) => attempt < 2,
    })!;
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw new Error('e');
      }, retry),
    ).rejects.toThrow('e');
    expect(calls).toBe(2); // attempt 2 fails shouldRetry → stop
    expect(seen).toEqual([1]); // onRetry fired only before the single retry
  });

  it('does not retry cancellation or teardown errors by default', async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw new TaskAbortedError();
      }, normalizeRetry(3)!),
    ).rejects.toBeInstanceOf(TaskAbortedError);
    expect(calls).toBe(1);

    calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw new TerminatedError();
      }, normalizeRetry(3)!),
    ).rejects.toBeInstanceOf(TerminatedError);
    expect(calls).toBe(1);
  });

  it('applies exponential backoff between retries', async () => {
    let calls = 0;
    const start = Date.now();
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error('e');
        },
        normalizeRetry({ retries: 2, minDelay: 25, factor: 2 })!,
      ),
    ).rejects.toThrow('e');
    const elapsed = Date.now() - start;
    expect(calls).toBe(3);
    expect(elapsed).toBeGreaterThanOrEqual(60); // ~25 + 50ms of backoff (lower bound)
  });

  it('caps the delay at maxDelay and applies jitter', async () => {
    let calls = 0;
    const start = Date.now();
    await expect(
      // minDelay 1000 but maxDelay 30 → each delay is clamped to 30, then jittered into [0, 30].
      withRetry(
        async () => {
          calls++;
          throw new Error('e');
        },
        normalizeRetry({ retries: 1, minDelay: 1000, maxDelay: 30, jitter: true })!,
      ),
    ).rejects.toThrow('e');
    expect(calls).toBe(2);
    expect(Date.now() - start).toBeLessThan(300); // never waited the uncapped 1000ms
  });

  it('stops retrying promptly when the signal aborts during a backoff delay', async () => {
    const ctrl = new AbortController();
    let calls = 0;
    const p = withRetry(
      async () => {
        calls++;
        throw new Error('e');
      },
      normalizeRetry({ retries: 5, minDelay: 50 })!,
      ctrl.signal,
    );
    setTimeout(() => ctrl.abort(), 15);
    await expect(p).rejects.toBeInstanceOf(TaskAbortedError);
    expect(calls).toBe(1); // failed once, aborted before the second attempt
  });
});

// ---------------------------------------------------------------------------
// Integration — retry across the real worker boundary.
// Flaky-then-succeed uses per-worker `globalThis` state, which persists across
// retries because they reuse the same worker (Thread, or a size-1 Pool).
// ---------------------------------------------------------------------------
describe('Thread.run retry', () => {
  it('recovers a flaky task within the retry budget', async () => {
    const t = Thread.fromFunction((n: number) => {
      const g = globalThis as unknown as Record<string, number>;
      g.__threadHits = (g.__threadHits || 0) + 1;
      if (g.__threadHits <= 2) throw new Error('flaky #' + g.__threadHits);
      return n * 10;
    });
    await expect(t.run(4, { retry: 2 })).resolves.toBe(40); // 2 failures + 1 success
    await t.terminate();
  });

  it('rejects when the retry budget is too small', async () => {
    const t = Thread.fromFunction((n: number) => {
      const g = globalThis as unknown as Record<string, number>;
      g.__threadHits2 = (g.__threadHits2 || 0) + 1;
      if (g.__threadHits2 <= 2) throw new Error('still flaky');
      return n;
    });
    await expect(t.run(4, { retry: 1 })).rejects.toThrow(/flaky/); // only 2 attempts
    await t.terminate();
  });

  it('counts exactly retries+1 attempts for an always-failing task', async () => {
    type Ev = { tried: void };
    const t = Thread.fromFunction<Ev, number, number>((bus, _n) => {
      bus.emit('tried');
      throw new Error('always');
    });
    let tries = 0;
    t.on('tried', () => {
      tries++;
    });
    await expect(t.run(1, { retry: 2 })).rejects.toThrow(/always/);
    expect(tries).toBe(3);
    await t.terminate();
  });

  it('aborts a retry sequence via AbortSignal', async () => {
    const ctrl = new AbortController();
    const t = Thread.fromFunction((_n: number) => {
      throw new Error('always');
    });
    const p = t.run(1, { retry: { retries: 5, minDelay: 50 }, signal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 20);
    await expect(p).rejects.toBeInstanceOf(TaskAbortedError);
    await t.terminate();
  });
});

describe('Pool / helper retry pass-through', () => {
  it('Pool.run retries on a single-worker pool', async () => {
    const pool = new Pool({
      size: 1,
      task: (n: number) => {
        const g = globalThis as unknown as Record<string, number>;
        g.__poolHits = (g.__poolHits || 0) + 1;
        if (g.__poolHits <= 1) throw new Error('flaky');
        return n + 100;
      },
    });
    await expect(pool.run(5, { retry: 2 })).resolves.toBe(105);
    await pool.terminate();
  });

  it('runs exactly retries+1 attempts on a Pool (no nested double-retry)', async () => {
    // Guards against Pool forwarding `retry` to the worker thread, which would
    // multiply attempts to (retries+1)². Count attempts via a per-attempt event.
    type Ev = { tried: void };
    const pool = new Pool<Ev, number, number>({
      size: 1,
      task: (bus, _n) => {
        bus.emit('tried');
        throw new Error('boom');
      },
    });
    let tries = 0;
    pool.on('tried', () => {
      tries++;
    });
    await expect(pool.run(1, { retry: 2 })).rejects.toThrow(/boom/);
    expect(tries).toBe(3); // exactly retries + 1, not 9
    await pool.terminate();
  });

  it('rejects retry combined with transferList', async () => {
    const t = Thread.fromFunction((b: ArrayBuffer) => b.byteLength);
    const buf = new ArrayBuffer(8);
    await expect(t.run(buf, { retry: 2, transferList: [buf] })).rejects.toThrow(/transferList/);
    expect(buf.byteLength).toBe(8); // rejected up front — buffer never detached
    await t.terminate();
  });

  it('mapParallel forwards retry to each item', async () => {
    const out = await mapParallel(
      [7],
      (n: number) => {
        const g = globalThis as unknown as Record<string, number>;
        g.__mapHits = (g.__mapHits || 0) + 1;
        if (g.__mapHits <= 1) throw new Error('flaky');
        return n;
      },
      { concurrency: 1, retry: 2 },
    );
    expect(out).toEqual([7]);
  });

  it('mapParallelStream forwards retry to each item', async () => {
    const out = await collect(
      mapParallelStream(
        [3],
        (n: number) => {
          const g = globalThis as unknown as Record<string, number>;
          g.__streamHits = (g.__streamHits || 0) + 1;
          if (g.__streamHits <= 1) throw new Error('flaky');
          return n * 2;
        },
        { concurrency: 1, retry: 1 },
      ),
    );
    expect(out).toEqual([6]);
  });
});

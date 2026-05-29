import { getEventListeners } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { TaskAbortedError, TaskTimeoutError } from '../src/errors';
import { mapParallelStream } from '../src/parallel';
import { Pool } from '../src/pool';
import { streamResults } from '../src/stream';

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

async function collect<T>(gen: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

const poolsToCleanup: Pool<any, any, any>[] = [];
function track<T extends Pool<any, any, any>>(p: T): T {
  poolsToCleanup.push(p);
  return p;
}
afterEach(async () => {
  await Promise.all(poolsToCleanup.splice(0).map((p) => p.terminate().catch(() => undefined)));
});

// ---------------------------------------------------------------------------
// Core scheduler (streamResults) — fast, deterministic, no worker threads.
// ---------------------------------------------------------------------------
describe('streamResults (core scheduler)', () => {
  it('yields in input order when ordered, despite jittered completion', async () => {
    const run = async (n: number) => {
      await tick((n * 7) % 5); // varied, shuffled completion order
      return n;
    };
    const out = await collect(streamResults(range(12), run, { concurrency: 4, ordered: true }));
    expect(out).toEqual(range(12));
  });

  it('yields as-completed when unordered', async () => {
    const run = async (n: number) => {
      await tick(n === 0 ? 60 : 2); // item 0 is the slowpoke
      return n;
    };
    const out = await collect(streamResults(range(6), run, { concurrency: 6, ordered: false }));
    expect(out[out.length - 1]).toBe(0); // slowest emitted last
    expect([...out].sort((a, b) => a - b)).toEqual(range(6));
  });

  it('never exceeds the concurrency cap (unordered)', async () => {
    let active = 0;
    let max = 0;
    const run = async (n: number) => {
      active++;
      max = Math.max(max, active);
      await tick(n % 4);
      active--;
      return n;
    };
    const out = await collect(streamResults(range(40), run, { concurrency: 5, ordered: false }));
    expect(max).toBeLessThanOrEqual(5);
    expect([...out].sort((a, b) => a - b)).toEqual(range(40));
  });

  it('bounds outstanding work in ordered mode even when the head is slow', async () => {
    let active = 0;
    let max = 0;
    const run = async (n: number) => {
      active++;
      max = Math.max(max, active);
      await tick(n === 0 ? 50 : 1); // head stalls; tail finishes fast and must buffer
      active--;
      return n;
    };
    const out = await collect(streamResults(range(30), run, { concurrency: 4, ordered: true }));
    expect(max).toBeLessThanOrEqual(4);
    expect(out).toEqual(range(30));
  });

  it('reads the source at most `concurrency` ahead of emission, even with a slow head', async () => {
    // Directly measures the flat-memory invariant: in-flight + reorder buffer
    // (= produced - emitted) must never exceed the concurrency cap.
    let produced = 0;
    function* source() {
      for (let i = 0; i < 40; i++) {
        produced++;
        yield i;
      }
    }
    const run = async (n: number) => {
      await tick(n === 0 ? 40 : 1); // head stalls; tail must buffer behind it
      return n;
    };
    let emitted = 0;
    let maxGap = 0;
    for await (const _ of streamResults(source(), run, { concurrency: 5, ordered: true })) {
      void _;
      emitted++;
      maxGap = Math.max(maxGap, produced - emitted);
    }
    expect(emitted).toBe(40);
    expect(maxGap).toBeLessThanOrEqual(5); // never reads more than `concurrency` ahead
  });

  it('clamps a non-positive or non-finite concurrency to 1 instead of yielding nothing', async () => {
    const run = async (n: number) => n;
    for (const bad of [0, -3, NaN, undefined as unknown as number]) {
      const out = await collect(streamResults(range(6), run, { concurrency: bad, ordered: true }));
      expect(out).toEqual(range(6));
    }
  });

  it('honors an abort that arrives after the source is fully drained', async () => {
    // Source (2 items) < concurrency, so it drains immediately and `inputDone`
    // is set; the abort must still be observed while tasks are in flight.
    const ctrl = new AbortController();
    const run = async (n: number) => {
      await tick(40);
      return n;
    };
    const p = collect(
      streamResults([0, 1], run, { concurrency: 4, ordered: false, signal: ctrl.signal }),
    );
    ctrl.abort();
    await expect(p).rejects.toBeInstanceOf(TaskAbortedError);
  });

  it('pulls the source lazily and closes it on early break', async () => {
    let produced = 0;
    let returned = false;
    function* infinite() {
      try {
        for (let i = 0; ; i++) {
          produced++;
          yield i;
        }
      } finally {
        returned = true;
      }
    }
    const run = async (n: number) => n;
    let count = 0;
    for await (const _ of streamResults(infinite(), run, { concurrency: 3, ordered: false })) {
      void _;
      if (++count === 5) break;
    }
    expect(count).toBe(5);
    expect(returned).toBe(true); // source iterator was closed
    expect(produced).toBeLessThan(40); // bounded look-ahead, not a full drain
  });

  it('propagates a task error and stops scheduling', async () => {
    let started = 0;
    const run = async (n: number) => {
      started++;
      await tick(1);
      if (n === 2) throw new Error('boom');
      return n;
    };
    await expect(
      collect(streamResults(range(50), run, { concurrency: 3, ordered: false })),
    ).rejects.toThrow('boom');
    expect(started).toBeLessThan(50); // didn't keep launching after the failure
  });

  it('throws immediately for a pre-aborted signal', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const run = async (n: number) => n;
    await expect(
      collect(
        streamResults(range(5), run, { concurrency: 2, ordered: false, signal: ctrl.signal }),
      ),
    ).rejects.toBeInstanceOf(TaskAbortedError);
  });

  it('throws when the signal aborts mid-stream', async () => {
    const ctrl = new AbortController();
    const run = async (n: number) => {
      await tick(2);
      return n;
    };
    const consume = async () => {
      for await (const _ of streamResults(range(100), run, {
        concurrency: 2,
        ordered: false,
        signal: ctrl.signal,
      })) {
        void _;
        ctrl.abort();
      }
    };
    await expect(consume()).rejects.toBeInstanceOf(TaskAbortedError);
  });

  it('yields nothing for empty input', async () => {
    const run = async (n: number) => n;
    expect(
      await collect(streamResults<number, number>([], run, { concurrency: 4, ordered: true })),
    ).toEqual([]);
  });

  it('accepts an async-iterable source', async () => {
    async function* src() {
      for (const n of [1, 2, 3, 4]) {
        await tick(1);
        yield n;
      }
    }
    const run = async (n: number) => n * 10;
    expect(await collect(streamResults(src(), run, { concurrency: 2, ordered: true }))).toEqual([
      10, 20, 30, 40,
    ]);
  });
});

// ---------------------------------------------------------------------------
// mapParallelStream — end-to-end across real worker threads.
// ---------------------------------------------------------------------------
describe('mapParallelStream', () => {
  it('preserves input order by default', async () => {
    const items = [
      { v: 0, ms: 120 },
      { v: 1, ms: 10 },
      { v: 2, ms: 10 },
      { v: 3, ms: 10 },
    ];
    const out = await collect(
      mapParallelStream(
        items,
        (it: { v: number; ms: number }) =>
          new Promise<number>((r) => setTimeout(() => r(it.v), it.ms)),
        { concurrency: 4 },
      ),
    );
    expect(out).toEqual([0, 1, 2, 3]); // 0 finishes last but is emitted first
  });

  it('emits as-completed with ordered:false', async () => {
    const items = [
      { v: 0, ms: 120 },
      { v: 1, ms: 10 },
      { v: 2, ms: 10 },
      { v: 3, ms: 10 },
    ];
    const out = await collect(
      mapParallelStream(
        items,
        (it: { v: number; ms: number }) =>
          new Promise<number>((r) => setTimeout(() => r(it.v), it.ms)),
        { concurrency: 4, ordered: false },
      ),
    );
    expect(out[out.length - 1]).toBe(0); // slowpoke last
    expect([...out].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it('maps a large input correctly with bounded concurrency', async () => {
    const out = await collect(
      mapParallelStream(range(50), (n: number) => n * n, { concurrency: 4 }),
    );
    expect(out).toEqual(range(50).map((n) => n * n));
  });

  it('accepts an async-iterable source', async () => {
    async function* src() {
      for (const n of [1, 2, 3, 4, 5]) yield n;
    }
    const out = await collect(mapParallelStream(src(), (n: number) => n + 1, { concurrency: 2 }));
    expect(out).toEqual([2, 3, 4, 5, 6]);
  });

  it('propagates a task error without hanging', async () => {
    const task = (n: number) => {
      if (n === 2) throw new Error('kaboom');
      return n;
    };
    await expect(collect(mapParallelStream([1, 2, 3], task))).rejects.toThrow();
  });

  it('aborts mid-stream via AbortSignal', async () => {
    const ctrl = new AbortController();
    const task = (n: number) => new Promise<number>((r) => setTimeout(() => r(n), 20));
    const consume = async () => {
      for await (const _ of mapParallelStream(range(100), task, {
        concurrency: 2,
        signal: ctrl.signal,
      })) {
        void _;
        ctrl.abort();
      }
    };
    await expect(consume()).rejects.toBeInstanceOf(TaskAbortedError);
  });

  it('runs cleanup (closes source, tears down pool) on an early break', async () => {
    // A generator source whose `finally` flips a flag — it only runs if the
    // stream's own finally (which also calls pool.terminate) executes on break.
    let sourceClosed = false;
    function* source() {
      try {
        for (let i = 0; i < 100; i++) yield i;
      } finally {
        sourceClosed = true;
      }
    }
    const task = (n: number) => new Promise<number>((r) => setTimeout(() => r(n), 5));
    let count = 0;
    for await (const _ of mapParallelStream(source(), task, { concurrency: 4 })) {
      void _;
      if (++count === 3) break;
    }
    expect(count).toBe(3);
    expect(sourceClosed).toBe(true); // teardown path ran (closes source + terminates pool)
  });

  it('does no work until the stream is actually iterated', async () => {
    // The pool is spawned inside the async-generator body, so building a stream
    // and discarding it must touch nothing — no source pull, no workers.
    let pulled = 0;
    function* source() {
      for (let i = 0; i < 5; i++) {
        pulled++;
        yield i;
      }
    }
    const gen = mapParallelStream(source(), (n: number) => n, { concurrency: 2 });
    await tick(20);
    expect(pulled).toBe(0); // nothing happened on the bare call
    expect(await collect(gen)).toEqual([0, 1, 2, 3, 4]); // still works once consumed
  });

  it('clamps concurrency: 0 to a single worker instead of CPU-count', async () => {
    const out = await collect(
      mapParallelStream(range(8), (n: number) => n * 2, { concurrency: 0 }),
    );
    expect(out).toEqual(range(8).map((n) => n * 2));
  });

  it('yields nothing for empty input', async () => {
    expect(await collect(mapParallelStream<number, number>([], (n) => n))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Pool.stream — streaming over a reusable, caller-owned pool.
// ---------------------------------------------------------------------------
describe('Pool.stream', () => {
  it('streams results and leaves the pool reusable', async () => {
    const pool = track(new Pool({ size: 2, task: (n: number) => n * 2 }));
    expect(await collect(pool.stream([1, 2, 3, 4]))).toEqual([2, 4, 6, 8]);
    expect(pool.isTerminated).toBe(false);
    await expect(pool.run(5)).resolves.toBe(10); // still usable afterward
  });

  it('caps concurrency at the pool size', async () => {
    const pool = track(new Pool({ size: 2, task: (n: number) => n }));
    expect(await collect(pool.stream([1, 2, 3, 4, 5], { concurrency: 100 }))).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it('applies a per-task timeout', async () => {
    const pool = track(
      new Pool({
        size: 1,
        task: (n: number) => new Promise<number>((r) => setTimeout(() => r(n), 100)),
      }),
    );
    const consume = async () => {
      for await (const _ of pool.stream([1], { timeout: 20 })) void _;
    };
    await expect(consume()).rejects.toBeInstanceOf(TaskTimeoutError);
  });

  it('rejects when the pool is already terminated', async () => {
    const pool = new Pool({ size: 1, task: (n: number) => n });
    await pool.terminate();
    const consume = async () => {
      for await (const _ of pool.stream([1, 2, 3])) void _;
    };
    await expect(consume()).rejects.toThrow();
  });

  it('does not leak abort listeners when streaming with a shared signal', async () => {
    // Streaming forwards one signal to every per-item run; the listener must be
    // detached on settle or memory grows per item — defeating the flat-memory goal.
    const ctrl = new AbortController();
    const pool = track(new Pool({ size: 2, task: (n: number) => n }));
    for await (const _ of pool.stream(range(60), { signal: ctrl.signal })) void _;
    expect(getEventListeners(ctrl.signal, 'abort').length).toBeLessThanOrEqual(2);
  });
});

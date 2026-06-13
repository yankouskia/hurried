import { afterEach, describe, expect, it } from 'vitest';
import { TaskAbortedError, TaskError, TerminatedError } from '../src/errors';
import { mapParallelSettled, mapParallelStreamSettled } from '../src/parallel';
import { Pool } from '../src/pool';
import type { SettledResult } from '../src/settled';

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

// A task that throws on even inputs — deterministic mix of success/failure.
const evenThrows = (n: number) => {
  if (n % 2 === 0) throw new Error('even-' + n);
  return n * 2;
};

const statuses = <T>(rs: SettledResult<T>[]) => rs.map((r) => r.status);

describe('mapParallelSettled', () => {
  it('records per-item success and failure in input order', async () => {
    const rs = await mapParallelSettled([0, 1, 2, 3], evenThrows, { concurrency: 2 });
    expect(statuses(rs)).toEqual(['rejected', 'fulfilled', 'rejected', 'fulfilled']);
    expect(rs[1]).toEqual({ status: 'fulfilled', value: 2 });
    expect(rs[3]).toEqual({ status: 'fulfilled', value: 6 });
    const first = rs[0]!;
    expect(first.status).toBe('rejected');
    if (first.status === 'rejected') {
      expect(first.reason).toBeInstanceOf(TaskError);
      expect((first.reason as Error).message).toContain('even-0');
    }
  });

  it('returns all fulfilled when nothing throws', async () => {
    const rs = await mapParallelSettled([1, 3, 5], (n: number) => n + 1);
    expect(rs).toEqual([
      { status: 'fulfilled', value: 2 },
      { status: 'fulfilled', value: 4 },
      { status: 'fulfilled', value: 6 },
    ]);
  });

  it('returns [] for empty input', async () => {
    await expect(mapParallelSettled([], (n: number) => n)).resolves.toEqual([]);
  });

  it('still rejects the whole batch when aborted', async () => {
    const ctrl = new AbortController();
    const slow = (n: number) => new Promise<number>((r) => setTimeout(() => r(n), 50));
    const p = mapParallelSettled(range(8), slow, { concurrency: 2, signal: ctrl.signal });
    ctrl.abort();
    await expect(p).rejects.toBeInstanceOf(TaskAbortedError);
  });

  it('records a worker that crashes mid-task as rejected, not sinking the batch', async () => {
    // A crashing worker (process.exit) must be a per-item failure — the whole
    // point of the settled API is that one bad item doesn't take down the rest.
    const rs = await mapParallelSettled(
      [1, 2, 3, 4],
      (n: number) => {
        if (n === 2) (process as unknown as { exit: (c: number) => never }).exit(1);
        return n * 10;
      },
      { concurrency: 4 },
    );
    expect(rs.filter((r) => r.status === 'fulfilled').length).toBe(3);
    expect(rs.filter((r) => r.status === 'rejected').length).toBe(1);
    expect(rs[1]?.status).toBe('rejected'); // item 2 crashed its worker
  });

  it('keeps draining onto healthy workers after one crashes (queue > pool size)', async () => {
    // size 2, 6 items: items 1→W1, 2→W2; W2 crashes on item 2, the rest run on W1.
    const rs = await mapParallelSettled(
      [1, 2, 3, 4, 5, 6],
      (n: number) => {
        if (n === 2) (process as unknown as { exit: (c: number) => never }).exit(1);
        return n;
      },
      { concurrency: 2 },
    );
    expect(rs.filter((r) => r.status === 'fulfilled').length).toBe(5);
    expect(rs.filter((r) => r.status === 'rejected').length).toBe(1);
    expect(rs[1]?.status).toBe('rejected');
  });

  it('records a rejection only after retries are exhausted', async () => {
    // Always throws; retry can't save it → one rejected entry (not a thrown batch).
    const rs = await mapParallelSettled(
      [1],
      (): number => {
        throw new Error('always');
      },
      { concurrency: 1, retry: 2 },
    );
    const first = rs[0]!;
    expect(first.status).toBe('rejected');
    if (first.status === 'rejected') expect((first.reason as Error).message).toContain('always');
  });
});

describe('Pool.mapSettled', () => {
  it('records per-item outcomes and leaves the pool reusable', async () => {
    const pool = track(new Pool({ size: 2, task: evenThrows }));
    const rs = await pool.mapSettled([0, 1, 2, 3]);
    expect(statuses(rs)).toEqual(['rejected', 'fulfilled', 'rejected', 'fulfilled']);
    expect(pool.isTerminated).toBe(false);
    await expect(pool.run(5)).resolves.toBe(10); // still usable
  });

  it('rejects the settled batch when the pool is terminated mid-flight', async () => {
    // Explicit teardown is a deliberate "stop everything" — distinct from a crash.
    const pool = new Pool({
      size: 2,
      task: (n: number) => new Promise<number>((r) => setTimeout(() => r(n), 100)),
    });
    const p = pool.mapSettled([1, 2, 3, 4]);
    setTimeout(() => pool.terminate(), 20);
    await expect(p).rejects.toBeInstanceOf(TerminatedError);
  });
});

describe('mapParallelStreamSettled', () => {
  it('yields a settled result per item, fault-tolerant, in order', async () => {
    const rs = await collect(
      mapParallelStreamSettled([0, 1, 2, 3], evenThrows, { concurrency: 2 }),
    );
    expect(statuses(rs)).toEqual(['rejected', 'fulfilled', 'rejected', 'fulfilled']);
    expect(rs[1]).toEqual({ status: 'fulfilled', value: 2 });
  });

  it('streams settled results as-completed when ordered:false', async () => {
    const rs = await collect(
      mapParallelStreamSettled([1, 3, 5, 7], (n: number) => n * 2, {
        concurrency: 4,
        ordered: false,
      }),
    );
    expect(statuses(rs)).toEqual(['fulfilled', 'fulfilled', 'fulfilled', 'fulfilled']);
    expect(rs.map((r) => (r.status === 'fulfilled' ? r.value : -1)).sort((a, b) => a - b)).toEqual([
      2, 6, 10, 14,
    ]);
  });

  it('keeps streaming past failures but still throws on abort', async () => {
    const ctrl = new AbortController();
    const slow = (n: number) => new Promise<number>((r) => setTimeout(() => r(n), 30));
    const consume = async () => {
      for await (const _ of mapParallelStreamSettled(range(50), slow, {
        concurrency: 2,
        signal: ctrl.signal,
      })) {
        void _;
        ctrl.abort();
      }
    };
    await expect(consume()).rejects.toBeInstanceOf(TaskAbortedError);
  });

  it('yields nothing for empty input', async () => {
    expect(await collect(mapParallelStreamSettled<number, number>([], (n) => n))).toEqual([]);
  });
});

describe('Pool.streamSettled', () => {
  it('streams settled results and leaves the pool reusable', async () => {
    const pool = track(new Pool({ size: 2, task: evenThrows }));
    const rs = await collect(pool.streamSettled([0, 1, 2, 3]));
    expect(statuses(rs)).toEqual(['rejected', 'fulfilled', 'rejected', 'fulfilled']);
    expect(pool.isTerminated).toBe(false);
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { HurriedError, TaskAbortedError, TerminatedError } from '../src/errors';
import { Pool } from '../src/pool';

const poolsToCleanup: Pool<any, any, any>[] = [];
function track<T extends Pool<any, any, any>>(p: T): T {
  poolsToCleanup.push(p);
  return p;
}

afterEach(async () => {
  await Promise.all(poolsToCleanup.splice(0).map((p) => p.terminate().catch(() => undefined)));
});

describe('Pool', () => {
  it('throws when constructed without a task', () => {
    expect(() => new Pool({ size: 1 } as never)).toThrow(HurriedError);
  });

  it('runs a single task to completion', async () => {
    const pool = track(new Pool({ size: 2, task: (n: number) => n + 1 }));
    await expect(pool.run(41)).resolves.toBe(42);
  });

  it('exposes size/idle/queue stats', () => {
    const pool = track(new Pool({ size: 3, task: (n: number) => n }));
    expect(pool.size).toBe(3);
    expect(pool.idleCount).toBe(3);
    expect(pool.queueLength).toBe(0);
    expect(pool.isTerminated).toBe(false);
  });

  it('processes more tasks than workers via queueing', async () => {
    const pool = track(
      new Pool({
        size: 2,
        task: async (n: number) => {
          await new Promise((r) => setTimeout(r, 20));
          return n * 2;
        },
      }),
    );
    const inputs = [1, 2, 3, 4, 5, 6, 7, 8];
    const results = await pool.map(inputs);
    expect(results).toEqual(inputs.map((n) => n * 2));
  });

  it('preserves input order in map()', async () => {
    const pool = track(
      new Pool({
        size: 4,
        task: async (n: number) => {
          await new Promise((r) => setTimeout(r, Math.random() * 20));
          return n;
        },
      }),
    );
    const inputs = [10, 20, 30, 40, 50, 60];
    expect(await pool.map(inputs)).toEqual(inputs);
  });

  it('rejects new tasks after terminate()', async () => {
    const pool = track(new Pool({ size: 1, task: (n: number) => n }));
    await pool.terminate();
    expect(pool.isTerminated).toBe(true);
    await expect(pool.run(1)).rejects.toBeInstanceOf(TerminatedError);
  });

  it('respects maxQueue backpressure', async () => {
    const pool = track(
      new Pool({
        size: 1,
        maxQueue: 1,
        task: async (n: number) => {
          await new Promise((r) => setTimeout(r, 50));
          return n;
        },
      }),
    );
    const running = pool.run(1);
    const queued = pool.run(2);
    await expect(pool.run(3)).rejects.toThrow(/queue is full/);
    await Promise.all([running, queued]);
  });

  it('aborts a queued task via AbortSignal without affecting others', async () => {
    const pool = track(
      new Pool({
        size: 1,
        task: async (n: number) => {
          await new Promise((r) => setTimeout(r, 30));
          return n;
        },
      }),
    );
    const first = pool.run(1);
    const controller = new AbortController();
    const second = pool.run(2, { signal: controller.signal });
    controller.abort();
    await expect(second).rejects.toBeInstanceOf(TaskAbortedError);
    await expect(first).resolves.toBe(1);
  });

  it('rejects a pre-aborted task synchronously', async () => {
    const pool = track(new Pool({ size: 1, task: (n: number) => n }));
    const controller = new AbortController();
    controller.abort();
    await expect(pool.run(1, { signal: controller.signal })).rejects.toBeInstanceOf(
      TaskAbortedError,
    );
  });
});

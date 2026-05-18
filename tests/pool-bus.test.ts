import { afterEach, describe, expect, it } from 'vitest';
import { Pool } from '../src/pool';

type Events = {
  progress: { done: number; total: number };
  ping: void;
  pong: { from: number };
};

const pools: Pool<any, any, any>[] = [];
function track<T extends Pool<any, any, any>>(p: T): T {
  pools.push(p);
  return p;
}

afterEach(async () => {
  await Promise.all(pools.splice(0).map((p) => p.terminate().catch(() => undefined)));
});

describe('Pool + Bus integration', () => {
  it('aggregates events from every worker', async () => {
    const pool = track(
      new Pool<Events, number, number>({
        size: 4,
        task: (bus, n) => {
          bus.emit('progress', { done: n, total: n });
          return n;
        },
      }),
    );

    const seen: Array<{ done: number; total: number }> = [];
    pool.on('progress', (p) => seen.push(p));

    await pool.map([1, 2, 3, 4]);
    await new Promise((r) => setTimeout(r, 30));

    expect(seen).toHaveLength(4);
    expect(seen.map((p) => p.done).sort()).toEqual([1, 2, 3, 4]);
  });

  it('broadcasts emit() to every worker', async () => {
    const pool = track(
      new Pool<Events, void, 'pong'>({
        size: 3,
        task: (bus, _arg) =>
          new Promise<'pong'>((resolve) => {
            bus.on('ping', () => resolve('pong'));
          }),
      }),
    );

    const promises = Array.from({ length: 3 }, () => pool.run(undefined as unknown as void));
    await new Promise((r) => setTimeout(r, 50));
    pool.emit('ping');

    const results = await Promise.all(promises);
    expect(results).toEqual(['pong', 'pong', 'pong']);
  });

  it('pool.bus() returns the aggregated bus', () => {
    const pool = track(
      new Pool<Events, number, number>({
        size: 2,
        task: (bus, n) => {
          bus.emit('progress', { done: 0, total: n });
          return n;
        },
      }),
    );
    expect(pool.bus()).toBe(pool.bus());
  });

  it('once() on the pool fires exactly once across all workers', async () => {
    const pool = track(
      new Pool<Events, number, number>({
        size: 4,
        task: (bus, n) => {
          bus.emit('progress', { done: n, total: n });
          return n;
        },
      }),
    );

    let count = 0;
    pool.once('progress', () => {
      count++;
    });

    await pool.map([1, 2, 3, 4]);
    await new Promise((r) => setTimeout(r, 30));

    expect(count).toBe(1);
  });
});

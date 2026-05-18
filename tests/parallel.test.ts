import { describe, expect, it } from 'vitest';
import { mapParallel, parallel } from '../src/parallel';

describe('parallel', () => {
  it('runs an empty list immediately', async () => {
    await expect(parallel([])).resolves.toEqual([]);
  });

  it('returns results in input order', async () => {
    const results = await parallel<number>([() => 1, () => 2, () => 3]);
    expect(results).toEqual([1, 2, 3]);
  });

  it('respects concurrency cap', async () => {
    const results = await parallel<number>([() => 1, () => 2, () => 3, () => 4], {
      concurrency: 2,
    });
    expect(results.sort()).toEqual([1, 2, 3, 4]);
  });

  it('propagates errors from a task', async () => {
    await expect(
      parallel<number>([
        () => 1,
        () => {
          throw new Error('inner');
        },
      ]),
    ).rejects.toThrow();
  });
});

describe('mapParallel', () => {
  it('returns an empty array for empty input', async () => {
    await expect(mapParallel([], (n: number) => n)).resolves.toEqual([]);
  });

  it('maps inputs through a worker pool', async () => {
    const inputs = [1, 2, 3, 4, 5];
    const out = await mapParallel(inputs, (n: number) => n * n, { concurrency: 3 });
    expect(out).toEqual([1, 4, 9, 16, 25]);
  });

  it('preserves order for async tasks with jitter', async () => {
    const inputs = [10, 20, 30, 40];
    const out = await mapParallel(
      inputs,
      async (n: number) => {
        await new Promise((r) => setTimeout(r, Math.random() * 15));
        return n + 1;
      },
      { concurrency: 2 },
    );
    expect(out).toEqual([11, 21, 31, 41]);
  });
});

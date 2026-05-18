import { afterEach, describe, expect, it } from 'vitest';
import { Thread } from '../src/thread';

type ProgressEvents = {
  progress: { done: number; total: number };
  log: string;
  cancel: void;
};

const threads: Thread<any, any, any>[] = [];
function track<T extends Thread<any, any, any>>(t: T): T {
  threads.push(t);
  return t;
}

afterEach(async () => {
  await Promise.all(threads.splice(0).map((t) => t.terminate().catch(() => 0)));
});

describe('Thread + Bus integration', () => {
  it('inline task can emit events back to the main thread', async () => {
    const thread = track(
      Thread.fromFunction<ProgressEvents, number, number>((bus, n) => {
        bus.emit('progress', { done: 0, total: n });
        bus.emit('progress', { done: n, total: n });
        return n;
      }),
    );

    const events: Array<{ done: number; total: number }> = [];
    thread.on('progress', (p) => events.push(p));

    await thread.run(5);
    await new Promise((r) => setImmediate(r));

    expect(events).toEqual([
      { done: 0, total: 5 },
      { done: 5, total: 5 },
    ]);
  });

  it('main thread can emit events into the worker', async () => {
    const thread = track(
      Thread.fromFunction<ProgressEvents, void, string>((bus, _arg) => {
        return new Promise<string>((resolve) => {
          bus.on('log', (msg: string) => resolve(msg));
        });
      }),
    );

    const promise = thread.run(undefined as unknown as void);
    // Give the worker a moment to subscribe before we emit.
    await new Promise((r) => setTimeout(r, 50));
    thread.emit('log', 'hello from main');

    await expect(promise).resolves.toBe('hello from main');
  });

  it('supports void-payload events on both ends', async () => {
    const thread = track(
      Thread.fromFunction<ProgressEvents, void, boolean>((bus, _arg) => {
        return new Promise<boolean>((resolve) => {
          bus.on('cancel', () => {
            bus.emit('log', 'cancelled');
            resolve(true);
          });
        });
      }),
    );

    let cancelled = false;
    thread.on('log', (msg) => {
      if (msg === 'cancelled') cancelled = true;
    });

    const p = thread.run(undefined as unknown as void);
    await new Promise((r) => setTimeout(r, 50));
    thread.emit('cancel');

    await expect(p).resolves.toBe(true);
    await new Promise((r) => setImmediate(r));
    expect(cancelled).toBe(true);
  });

  it('once() fires exactly once on the main side', async () => {
    const thread = track(
      Thread.fromFunction<ProgressEvents, number, number>((bus, n) => {
        bus.emit('progress', { done: 1, total: n });
        bus.emit('progress', { done: 2, total: n });
        return n;
      }),
    );

    let count = 0;
    thread.once('progress', () => {
      count++;
    });

    await thread.run(2);
    await new Promise((r) => setTimeout(r, 30));

    expect(count).toBe(1);
  });

  it('unsubscribe function from on() stops further delivery', async () => {
    const thread = track(
      Thread.fromFunction<ProgressEvents, number, number>((bus, n) => {
        bus.emit('progress', { done: 1, total: n });
        return n;
      }),
    );

    const off = thread.on('progress', () => {
      throw new Error('should not be called after off()');
    });
    off();

    await thread.run(2);
    await new Promise((r) => setTimeout(r, 30));
  });

  it('off() removes a specific listener', async () => {
    const thread = track(
      Thread.fromFunction<ProgressEvents, number, number>((bus, n) => {
        bus.emit('progress', { done: 1, total: n });
        return n;
      }),
    );

    const listener = () => {
      throw new Error('should be removed');
    };
    thread.on('progress', listener);
    thread.off('progress', listener);

    await thread.run(2);
    await new Promise((r) => setTimeout(r, 30));
  });

  it('inline task with arity 1 keeps the simple no-bus contract', async () => {
    const thread = track(Thread.fromFunction((n: number) => n * 3));
    await expect(thread.run(7)).resolves.toBe(21);
  });

  it('bus() returns the same instance', () => {
    const thread = track(
      Thread.fromFunction<ProgressEvents, number, number>((bus, n) => {
        bus.emit('log', `n=${n}`);
        return n;
      }),
    );
    expect(thread.bus()).toBe(thread.bus());
  });
});

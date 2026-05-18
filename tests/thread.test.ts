import { afterEach, describe, expect, it } from 'vitest';
import { Thread } from '../src/thread';
import { TaskAbortedError, TaskError, TaskTimeoutError, TerminatedError } from '../src/errors';
import type { EventMap } from '../src/bus';

const threadsToCleanup: Thread<any, any, any>[] = [];
function track<T extends Thread<any, any, any>>(t: T): T {
  threadsToCleanup.push(t);
  return t;
}

afterEach(async () => {
  await Promise.all(threadsToCleanup.splice(0).map((t) => t.terminate().catch(() => 0)));
});

describe('Thread', () => {
  describe('static helpers', () => {
    it('isMainThread() returns true in the test runner', () => {
      expect(Thread.isMainThread()).toBe(true);
    });

    it('setMaxListeners() updates EventEmitter default', async () => {
      const { EventEmitter } = await import('node:events');
      const prev = EventEmitter.defaultMaxListeners;
      Thread.setMaxListeners(123);
      expect(EventEmitter.defaultMaxListeners).toBe(123);
      Thread.setMaxListeners(prev);
    });
  });

  describe('fromFunction', () => {
    it('runs an inline task and returns the result', async () => {
      const t = track(Thread.fromFunction((n: number) => n * 2));
      await expect(t.run(21)).resolves.toBe(42);
    });

    it('passes through async tasks', async () => {
      const t = track(
        Thread.fromFunction(async (n: number) => {
          await new Promise((r) => setTimeout(r, 10));
          return n + 1;
        }),
      );
      await expect(t.run(41)).resolves.toBe(42);
    });

    it('propagates errors as TaskError', async () => {
      const t = track(
        Thread.fromFunction(() => {
          throw new Error('boom');
        }),
      );
      await expect(t.run(undefined as unknown as void)).rejects.toBeInstanceOf(TaskError);
    });

    it('rejects pending calls when terminated', async () => {
      const t = track(
        Thread.fromFunction(async () => {
          await new Promise((r) => setTimeout(r, 5_000));
          return 1;
        }),
      );
      const p = t.run(undefined as unknown as void);
      const assertion = expect(p).rejects.toBeInstanceOf(TerminatedError);
      await t.terminate();
      await assertion;
      expect(t.isTerminated).toBe(true);
    });

    it('rejects new calls after terminate', async () => {
      const t = track(Thread.fromFunction((n: number) => n));
      await t.terminate();
      await expect(t.run(1)).rejects.toBeInstanceOf(TerminatedError);
    });
  });

  describe('timeouts', () => {
    it('rejects with TaskTimeoutError when the call exceeds timeout', async () => {
      const t = track(
        Thread.fromFunction(async () => {
          await new Promise((r) => setTimeout(r, 1_000));
          return 'too late';
        }),
      );
      await expect(t.run(undefined as unknown as void, { timeout: 50 })).rejects.toBeInstanceOf(
        TaskTimeoutError,
      );
    });

    it('honors thread-level default timeout', async () => {
      const t = track(
        Thread.fromFunction(
          async () => {
            await new Promise((r) => setTimeout(r, 1_000));
            return 'too late';
          },
          { timeout: 30 },
        ),
      );
      await expect(t.run(undefined as unknown as void)).rejects.toBeInstanceOf(TaskTimeoutError);
    });
  });

  describe('AbortSignal', () => {
    it('rejects immediately if the signal is already aborted', async () => {
      const t = track(Thread.fromFunction((n: number) => n));
      const controller = new AbortController();
      controller.abort();
      await expect(t.run(1, { signal: controller.signal })).rejects.toBeInstanceOf(
        TaskAbortedError,
      );
    });

    it('rejects when the signal aborts mid-flight', async () => {
      const t = track(
        Thread.fromFunction(async () => {
          await new Promise((r) => setTimeout(r, 1_000));
          return 'done';
        }),
      );
      const controller = new AbortController();
      const p = t.run(undefined as unknown as void, { signal: controller.signal });
      setTimeout(() => controller.abort('user-cancel'), 20);
      await expect(p).rejects.toBeInstanceOf(TaskAbortedError);
    });
  });

  describe('named handlers', () => {
    it('runs a named handler registered inside a script', async () => {
      const code = `
        const { parentPort } = require('worker_threads');
        parentPort.on('message', (msg) => {
          if (!msg || msg.__hurried !== 'req') return;
          if (msg.name === 'add') {
            const sum = msg.args.reduce((a, b) => a + b, 0);
            parentPort.postMessage({ __hurried: 'res', id: msg.id, ok: true, result: sum });
          }
        });
      `;
      const t = track(Thread.fromScript<EventMap, unknown, number>(code));
      await expect(t.run('add', 1, 2, 3, 4)).resolves.toBe(10);
    });

    it('parses options object when passed last', async () => {
      const code = `
        const { parentPort } = require('worker_threads');
        parentPort.on('message', async (msg) => {
          if (!msg || msg.__hurried !== 'req') return;
          await new Promise(r => setTimeout(r, 500));
          parentPort.postMessage({ __hurried: 'res', id: msg.id, ok: true, result: msg.args });
        });
      `;
      const t = track(Thread.fromScript<EventMap, unknown, unknown[]>(code));
      await expect(t.run('slow', 1, 2, { timeout: 50 })).rejects.toBeInstanceOf(TaskTimeoutError);
    });
  });

  describe('pendingCount', () => {
    it('reports in-flight calls', async () => {
      const t = track(
        Thread.fromFunction(async (n: number) => {
          await new Promise((r) => setTimeout(r, 50));
          return n;
        }),
      );
      const p = t.run(1);
      expect(t.pendingCount).toBe(1);
      await p;
      expect(t.pendingCount).toBe(0);
    });
  });
});

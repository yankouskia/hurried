import type { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { parentPortMock } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
  const events = require('node:events');
  const mock: EventEmitter & { postMessage: ReturnType<typeof vi.fn> } = new events.EventEmitter();
  mock.postMessage = vi.fn();
  return { parentPortMock: mock };
});

vi.mock('node:worker_threads', () => ({
  isMainThread: false,
  parentPort: parentPortMock,
}));

import { defineWorker, makeExecutable } from '../src/make-executable';

beforeEach(() => {
  parentPortMock.removeAllListeners();
  parentPortMock.postMessage.mockReset();
});

afterEach(() => {
  parentPortMock.removeAllListeners();
});

describe('makeExecutable', () => {
  it('responds to a matching request with the function result', async () => {
    makeExecutable((n: number) => n * 3, 'triple');

    parentPortMock.emit('message', {
      __hurried: 'req',
      id: 'r1',
      name: 'triple',
      args: [4],
    });

    await flush();
    expect(parentPortMock.postMessage).toHaveBeenCalledWith({
      __hurried: 'res',
      id: 'r1',
      ok: true,
      result: 12,
      error: undefined,
    });
  });

  it('serializes errors thrown by the handler', async () => {
    makeExecutable(() => {
      throw new Error('nope');
    }, 'broken');

    parentPortMock.emit('message', {
      __hurried: 'req',
      id: 'r2',
      name: 'broken',
      args: [],
    });

    await flush();
    const call = parentPortMock.postMessage.mock.calls[0]![0];
    expect(call.ok).toBe(false);
    expect(call.error.message).toBe('nope');
  });

  it('ignores requests with a different handler name', async () => {
    makeExecutable((n: number) => n, 'one');
    parentPortMock.emit('message', {
      __hurried: 'req',
      id: 'r3',
      name: 'other',
      args: [1],
    });
    await flush();
    expect(parentPortMock.postMessage).not.toHaveBeenCalled();
  });

  it('ignores non-request messages', async () => {
    makeExecutable((n: number) => n, 'one');
    parentPortMock.emit('message', 'garbage');
    parentPortMock.emit('message', { __hurried: 'res', id: 'x', ok: true });
    await flush();
    expect(parentPortMock.postMessage).not.toHaveBeenCalled();
  });
});

describe('defineWorker', () => {
  it('dispatches to the matching handler', async () => {
    defineWorker({
      add: (a: number, b: number) => a + b,
      greet: (name: string) => `hi ${name}`,
    });

    parentPortMock.emit('message', {
      __hurried: 'req',
      id: 'a1',
      name: 'add',
      args: [2, 5],
    });
    parentPortMock.emit('message', {
      __hurried: 'req',
      id: 'g1',
      name: 'greet',
      args: ['world'],
    });

    await flush();
    const results = parentPortMock.postMessage.mock.calls.map((c) => c[0]);
    expect(results).toContainEqual({
      __hurried: 'res',
      id: 'a1',
      ok: true,
      result: 7,
      error: undefined,
    });
    expect(results).toContainEqual({
      __hurried: 'res',
      id: 'g1',
      ok: true,
      result: 'hi world',
      error: undefined,
    });
  });

  it('returns the handler map for type inference', () => {
    const handlers = defineWorker({ id: (x: number) => x });
    expect(typeof handlers.id).toBe('function');
  });

  it('ignores unknown handlers', async () => {
    defineWorker({ known: () => 'ok' });
    parentPortMock.emit('message', {
      __hurried: 'req',
      id: 'u1',
      name: 'unknown',
      args: [],
    });
    await flush();
    expect(parentPortMock.postMessage).not.toHaveBeenCalled();
  });

  it('reports thrown errors', async () => {
    defineWorker({
      bad: () => {
        throw new TypeError('wrong');
      },
    });
    parentPortMock.emit('message', {
      __hurried: 'req',
      id: 'b1',
      name: 'bad',
      args: [],
    });
    await flush();
    const call = parentPortMock.postMessage.mock.calls[0]![0];
    expect(call.ok).toBe(false);
    expect(call.error.name).toBe('TypeError');
  });
});

function flush(): Promise<void> {
  return new Promise((r) => setImmediate(r));
}

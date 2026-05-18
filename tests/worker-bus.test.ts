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

import { __resetWorkerBus, workerBus } from '../src/worker-bus';

type Events = {
  hello: string;
  tick: void;
};

beforeEach(() => {
  __resetWorkerBus();
  parentPortMock.removeAllListeners();
  parentPortMock.postMessage.mockReset();
});

afterEach(() => {
  parentPortMock.removeAllListeners();
  __resetWorkerBus();
});

describe('workerBus', () => {
  it('returns a singleton bus across calls', () => {
    const a = workerBus<Events>();
    const b = workerBus<Events>();
    expect(a).toBe(b);
  });

  it('emit() posts a bus message through parentPort', () => {
    const bus = workerBus<Events>();
    bus.emit('hello', 'world');
    expect(parentPortMock.postMessage).toHaveBeenCalledWith({
      __hurried: 'bus',
      event: 'hello',
      payload: 'world',
    });
  });

  it('emit() with a void event sends an undefined payload', () => {
    const bus = workerBus<Events>();
    bus.emit('tick');
    expect(parentPortMock.postMessage).toHaveBeenCalledWith({
      __hurried: 'bus',
      event: 'tick',
      payload: undefined,
    });
  });

  it('delivers incoming bus messages to local listeners', () => {
    const bus = workerBus<Events>();
    const listener = vi.fn();
    bus.on('hello', listener);
    parentPortMock.emit('message', { __hurried: 'bus', event: 'hello', payload: 'world' });
    expect(listener).toHaveBeenCalledWith('world');
  });

  it('ignores non-bus messages', () => {
    const bus = workerBus<Events>();
    const listener = vi.fn();
    bus.on('hello', listener);
    parentPortMock.emit('message', { __hurried: 'req', id: 'x', name: 'y', args: [] });
    parentPortMock.emit('message', null);
    expect(listener).not.toHaveBeenCalled();
  });
});

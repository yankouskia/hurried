import { describe, expect, it, vi } from 'vitest';
import { Bus } from '../src/bus';

type Events = {
  greet: string;
  count: number;
  tick: void;
};

describe('Bus', () => {
  describe('local listeners', () => {
    it('publishes to subscribed listeners', () => {
      const bus = new Bus<Events>();
      const listener = vi.fn();
      bus.on('greet', listener);
      bus.__publish('greet', 'hello');
      expect(listener).toHaveBeenCalledWith('hello');
    });

    it('supports multiple listeners on the same event', () => {
      const bus = new Bus<Events>();
      const a = vi.fn();
      const b = vi.fn();
      bus.on('count', a);
      bus.on('count', b);
      bus.__publish('count', 42);
      expect(a).toHaveBeenCalledWith(42);
      expect(b).toHaveBeenCalledWith(42);
    });

    it('returns an unsubscribe function from on()', () => {
      const bus = new Bus<Events>();
      const listener = vi.fn();
      const off = bus.on('greet', listener);
      off();
      bus.__publish('greet', 'hello');
      expect(listener).not.toHaveBeenCalled();
    });

    it('once() fires exactly once and auto-unsubscribes', () => {
      const bus = new Bus<Events>();
      const listener = vi.fn();
      bus.once('count', listener);
      bus.__publish('count', 1);
      bus.__publish('count', 2);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(1);
    });

    it('off() removes a listener', () => {
      const bus = new Bus<Events>();
      const listener = vi.fn();
      bus.on('greet', listener);
      bus.off('greet', listener);
      bus.__publish('greet', 'x');
      expect(listener).not.toHaveBeenCalled();
    });

    it('clear() removes every listener', () => {
      const bus = new Bus<Events>();
      const listener = vi.fn();
      bus.on('greet', listener);
      bus.on('count', listener);
      bus.clear();
      bus.__publish('greet', 'x');
      bus.__publish('count', 1);
      expect(listener).not.toHaveBeenCalled();
    });

    it('listenerCount reports per-event and total counts', () => {
      const bus = new Bus<Events>();
      bus.on('greet', () => {});
      bus.on('greet', () => {});
      bus.on('count', () => {});
      expect(bus.listenerCount('greet')).toBe(2);
      expect(bus.listenerCount('count')).toBe(1);
      expect(bus.listenerCount()).toBe(3);
      expect(bus.listenerCount('tick')).toBe(0);
    });

    it('ignores publishes when no listener is registered', () => {
      const bus = new Bus<Events>();
      expect(() => bus.__publish('greet', 'noop')).not.toThrow();
    });
  });

  describe('transport (sender)', () => {
    it('emit() forwards events through the sender', () => {
      const sender = vi.fn();
      const bus = new Bus<Events>(sender);
      bus.emit('greet', 'world');
      expect(sender).toHaveBeenCalledWith('greet', 'world');
    });

    it('emit() works with void events and no payload arg', () => {
      const sender = vi.fn();
      const bus = new Bus<Events>(sender);
      bus.emit('tick');
      expect(sender).toHaveBeenCalledWith('tick', undefined);
    });

    it('emit() is a no-op when no sender is configured', () => {
      const bus = new Bus<Events>();
      expect(() => bus.emit('greet', 'hi')).not.toThrow();
    });
  });

  describe('forwarding', () => {
    it('__forwardTo pipes every event to another bus', () => {
      const a = new Bus<Events>();
      const b = new Bus<Events>();
      const listener = vi.fn();
      b.on('greet', listener);
      a.__forwardTo(b);
      a.__publish('greet', 'hi');
      expect(listener).toHaveBeenCalledWith('hi');
    });

    it('__forwardTo returns an unsubscribe function', () => {
      const a = new Bus<Events>();
      const b = new Bus<Events>();
      const listener = vi.fn();
      b.on('greet', listener);
      const stop = a.__forwardTo(b);
      stop();
      a.__publish('greet', 'hi');
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('waitFor', () => {
    it('resolves on the next matching event', async () => {
      const bus = new Bus<Events>();
      const p = bus.waitFor('count');
      bus.__publish('count', 7);
      await expect(p).resolves.toBe(7);
    });

    it('rejects when the signal aborts', async () => {
      const bus = new Bus<Events>();
      const controller = new AbortController();
      const p = bus.waitFor('count', { signal: controller.signal });
      controller.abort();
      await expect(p).rejects.toThrow(/aborted/);
    });

    it('rejects synchronously when signal is already aborted', async () => {
      const bus = new Bus<Events>();
      const controller = new AbortController();
      controller.abort();
      await expect(bus.waitFor('count', { signal: controller.signal })).rejects.toThrow(/aborted/);
    });
  });
});

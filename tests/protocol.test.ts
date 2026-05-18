import { describe, expect, it } from 'vitest';
import {
  createId,
  createRequest,
  createResponse,
  deserializeError,
  isRequestMessage,
  isResponseMessage,
  serializeError,
} from '../src/protocol';

describe('protocol', () => {
  describe('createId', () => {
    it('produces unique ids on consecutive calls', () => {
      const ids = new Set(Array.from({ length: 1000 }, () => createId()));
      expect(ids.size).toBe(1000);
    });

    it('returns a non-empty string', () => {
      expect(typeof createId()).toBe('string');
      expect(createId().length).toBeGreaterThan(0);
    });
  });

  describe('createRequest', () => {
    it('captures handler name and args', () => {
      const req = createRequest('foo', [1, 'two', { three: true }], 'fixed-id');
      expect(req).toEqual({
        __hurried: 'req',
        id: 'fixed-id',
        name: 'foo',
        args: [1, 'two', { three: true }],
      });
    });

    it('auto-generates an id when omitted', () => {
      const a = createRequest('x', []);
      const b = createRequest('x', []);
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('createResponse', () => {
    it('encodes success', () => {
      expect(createResponse('id', true, 42)).toEqual({
        __hurried: 'res',
        id: 'id',
        ok: true,
        result: 42,
        error: undefined,
      });
    });

    it('encodes failure', () => {
      const err = { name: 'Error', message: 'boom' };
      expect(createResponse('id', false, undefined, err)).toEqual({
        __hurried: 'res',
        id: 'id',
        ok: false,
        result: undefined,
        error: err,
      });
    });
  });

  describe('isRequestMessage', () => {
    it('accepts well-formed requests', () => {
      expect(isRequestMessage({ __hurried: 'req', id: 'x', name: 'f', args: [] })).toBe(true);
    });

    it('rejects non-objects', () => {
      expect(isRequestMessage(null)).toBe(false);
      expect(isRequestMessage(undefined)).toBe(false);
      expect(isRequestMessage('string')).toBe(false);
      expect(isRequestMessage(42)).toBe(false);
    });

    it('rejects objects missing required fields', () => {
      expect(isRequestMessage({})).toBe(false);
      expect(isRequestMessage({ __hurried: 'req' })).toBe(false);
      expect(isRequestMessage({ __hurried: 'req', id: 'x' })).toBe(false);
      expect(isRequestMessage({ __hurried: 'req', id: 'x', name: 'f' })).toBe(false);
      expect(isRequestMessage({ __hurried: 'req', id: 'x', name: 'f', args: 'not-array' })).toBe(
        false,
      );
    });

    it('rejects messages with the wrong tag', () => {
      expect(isRequestMessage({ __hurried: 'res', id: 'x', name: 'f', args: [] })).toBe(false);
    });
  });

  describe('isResponseMessage', () => {
    it('accepts well-formed responses', () => {
      expect(isResponseMessage({ __hurried: 'res', id: 'x', ok: true })).toBe(true);
      expect(isResponseMessage({ __hurried: 'res', id: 'x', ok: false })).toBe(true);
    });

    it('rejects malformed values', () => {
      expect(isResponseMessage(null)).toBe(false);
      expect(isResponseMessage({ __hurried: 'res' })).toBe(false);
      expect(isResponseMessage({ __hurried: 'req', id: 'x', ok: true })).toBe(false);
      expect(isResponseMessage({ __hurried: 'res', id: 'x', ok: 'yes' })).toBe(false);
    });
  });

  describe('serializeError / deserializeError', () => {
    it('round-trips Error instances', () => {
      const err = new TypeError('bad type');
      const wire = serializeError(err);
      expect(wire.name).toBe('TypeError');
      expect(wire.message).toBe('bad type');
      const restored = deserializeError(wire);
      expect(restored.message).toBe('bad type');
      expect(restored.name).toBe('TypeError');
    });

    it('serializes non-Error values', () => {
      expect(serializeError('boom')).toEqual({ name: 'Error', message: 'boom' });
      expect(serializeError(42)).toEqual({ name: 'Error', message: '42' });
    });

    it('preserves stack when present', () => {
      const err = new Error('with stack');
      const wire = serializeError(err);
      expect(wire.stack).toBeDefined();
      const restored = deserializeError(wire);
      expect(restored.stack).toBe(wire.stack);
    });

    it('deserializes without stack', () => {
      const restored = deserializeError({ name: 'Foo', message: 'no stack' });
      expect(restored.name).toBe('Foo');
      expect(restored.message).toBe('no stack');
    });
  });
});

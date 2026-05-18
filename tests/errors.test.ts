import { describe, expect, it } from 'vitest';
import {
  HurriedError,
  TaskAbortedError,
  TaskError,
  TaskTimeoutError,
  TerminatedError,
} from '../src/errors';

describe('errors', () => {
  it('HurriedError carries a name and message', () => {
    const e = new HurriedError('boom');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('HurriedError');
    expect(e.message).toBe('boom');
  });

  it('TaskError preserves cause', () => {
    const cause = new Error('inner');
    const e = new TaskError('outer', cause);
    expect(e).toBeInstanceOf(HurriedError);
    expect(e.cause).toBe(cause);
    expect(e.name).toBe('TaskError');
  });

  it('TaskTimeoutError reports duration', () => {
    const e = new TaskTimeoutError(250);
    expect(e.timeoutMs).toBe(250);
    expect(e.message).toContain('250');
    expect(e.name).toBe('TaskTimeoutError');
  });

  it('TaskAbortedError supports a custom reason', () => {
    expect(new TaskAbortedError().message).toBe('Task aborted');
    expect(new TaskAbortedError('user cancelled').message).toBe('Task aborted: user cancelled');
  });

  it('TerminatedError has a stable shape', () => {
    const e = new TerminatedError();
    expect(e.name).toBe('TerminatedError');
    expect(e.message).toMatch(/terminated/i);
  });
});

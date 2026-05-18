import { describe, expect, it } from 'vitest';
import { buildInlineWorkerCode } from '../src/runtime';

describe('buildInlineWorkerCode', () => {
  it('embeds the supplied task source verbatim', () => {
    const src = '(n) => n * 2';
    const code = buildInlineWorkerCode(src, 1);
    expect(code).toContain(src);
    expect(code).toContain("require('worker_threads')");
  });

  it('only handles the default task name', () => {
    const code = buildInlineWorkerCode('() => 0', 0);
    expect(code).toContain('__default__');
  });

  it('opts the user task into bus injection when arity >= 2', () => {
    const withBus = buildInlineWorkerCode('(bus, n) => n', 2);
    expect(withBus).toMatch(/__wantsBus = true/);
    const withoutBus = buildInlineWorkerCode('(n) => n', 1);
    expect(withoutBus).toMatch(/__wantsBus = false/);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createStaticProseBatchEmitter } from '../../../src/cli/repl/static-prose-batch.js';

describe('createStaticProseBatchEmitter', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('joins prose lines into one push after debounce', () => {
    const pushed: string[] = [];
    const batch = createStaticProseBatchEmitter((md) => pushed.push(md), 20);
    batch.line('a');
    batch.line('b');
    expect(pushed).toEqual([]);
    vi.advanceTimersByTime(20);
    expect(pushed).toEqual(['a\nb']);
  });

  it('flushes prose before a fenced block', () => {
    const pushed: string[] = [];
    const batch = createStaticProseBatchEmitter((md) => pushed.push(md), 20);
    batch.line('intro');
    batch.block('```\ncode\n```');
    expect(pushed).toEqual(['intro', '```\ncode\n```']);
  });
});

import { describe, it, expect } from 'vitest';
import { createStreamSegmenter, type Segment } from '../../src/cli/repl/stream-segmenter.js';

function collect(): { seg: Segment[]; emit: (s: Segment) => void } {
  const seg: Segment[] = [];
  return { seg, emit: (s) => seg.push(s) };
}

describe('createStreamSegmenter', () => {
  it('emits prose lines as they complete (real-time flow)', () => {
    const { seg, emit } = collect();
    const s = createStreamSegmenter(emit);
    s.feed('first line\nsecond ');
    expect(seg).toEqual([{ kind: 'line', markdown: 'first line' }]); // emitted on \n
    expect(s.partial()).toBe('second '); // partial held
    s.feed('line\n');
    expect(seg).toEqual([{ kind: 'line', markdown: 'first line' }, { kind: 'line', markdown: 'second line' }]);
  });

  it('buffers a fenced code block and emits it whole', () => {
    const { seg, emit } = collect();
    const s = createStreamSegmenter(emit);
    s.feed('```ts\nconst x = 1;\nconst y = 2;\n```\n');
    expect(seg).toEqual([{ kind: 'block', markdown: '```ts\nconst x = 1;\nconst y = 2;\n```' }]);
  });

  it('buffers a table (with separator) and emits it whole', () => {
    const { seg, emit } = collect();
    const s = createStreamSegmenter(emit);
    s.feed('| A | B |\n|---|---|\n| 1 | 2 |\nafter\n');
    expect(seg[0]).toEqual({ kind: 'block', markdown: '| A | B |\n|---|---|\n| 1 | 2 |' });
    expect(seg[1]).toEqual({ kind: 'line', markdown: 'after' });
  });

  it('a pipe-run without a separator is emitted as prose lines (not a table)', () => {
    const { seg, emit } = collect();
    const s = createStreamSegmenter(emit);
    s.feed('a | b\nc | d\nplain\n');
    expect(seg).toEqual([
      { kind: 'line', markdown: 'a | b' },
      { kind: 'line', markdown: 'c | d' },
      { kind: 'line', markdown: 'plain' },
    ]);
  });

  it('flush emits a trailing partial line', () => {
    const { seg, emit } = collect();
    const s = createStreamSegmenter(emit);
    s.feed('no newline here');
    expect(seg).toEqual([]);
    s.flush();
    expect(seg).toEqual([{ kind: 'line', markdown: 'no newline here' }]);
  });

  it('flush emits an unclosed code block', () => {
    const { seg, emit } = collect();
    const s = createStreamSegmenter(emit);
    s.feed('```js\ncode without close\n');
    s.flush();
    expect(seg).toEqual([{ kind: 'block', markdown: '```js\ncode without close' }]);
  });
});

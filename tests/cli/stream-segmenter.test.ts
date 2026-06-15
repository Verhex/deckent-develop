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

  it('caps a runaway unclosed code block — emits mid-stream instead of swallowing the rest of the reply', () => {
    // A stray/unclosed ``` would otherwise buffer EVERY following line silently
    // until turn-end (the "akış kayıp" freeze). The cap bounds that window.
    const { seg, emit } = collect();
    const s = createStreamSegmenter(emit);
    s.feed('```js\n');
    for (let i = 0; i < 250; i++) s.feed(`line ${i}\n`);
    // Without the cap, nothing is emitted before flush(); with it, the runaway
    // block is flushed mid-stream so subsequent output is not swallowed.
    expect(seg.length).toBeGreaterThan(0);
    expect(seg.some((x) => x.kind === 'block')).toBe(true);
  });

  it('a normal-sized closed code block is unaffected by the cap (still emits whole on close)', () => {
    const { seg, emit } = collect();
    const s = createStreamSegmenter(emit);
    s.feed('```ts\n');
    for (let i = 0; i < 20; i++) s.feed(`const n${i} = ${i};\n`);
    expect(seg).toEqual([]);          // under the cap → still buffered until close
    s.feed('```\n');
    expect(seg).toHaveLength(1);
    expect(seg[0]!.kind).toBe('block');
  });
});

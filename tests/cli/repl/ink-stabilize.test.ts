// tests/cli/repl/ink-stabilize.test.ts
// Sprint 301 Task 301-014 — F11-016: Ink REPL stabilize
//
// Two hermetic groups:
//   A) createStreamSegmenter — unclosed-fence / fenceGuard / flush-race scenarios.
//   B) createConfirmQueue   — FIFO burst ordering, always-allow cascade, deny no-cascade.
//
// Hermetic: no disk I/O, no process.spawn, no Ink render. Pure-logic units.

import { describe, it, expect, vi } from 'vitest';
import {
  createStreamSegmenter,
  type Segment,
} from '../../../src/cli/repl/stream-segmenter.js';
import {
  createConfirmQueue,
  type ConfirmRequest,
  type ConfirmAnswer,
} from '../../../src/cli/repl/app.js';

// ─── A: createStreamSegmenter ────────────────────────────────────────────────

describe('createStreamSegmenter — fence / flush guards (F11-016)', () => {
  it('emits a prose line immediately when a newline arrives', () => {
    const segs: Segment[] = [];
    const s = createStreamSegmenter((seg) => segs.push(seg));
    s.feed('hello world\n');
    expect(segs).toHaveLength(1);
    expect(segs[0]).toEqual({ kind: 'line', markdown: 'hello world' });
  });

  it('flush() emits a trailing partial line (no trailing newline)', () => {
    const segs: Segment[] = [];
    const s = createStreamSegmenter((seg) => segs.push(seg));
    s.feed('trailing');
    expect(segs).toHaveLength(0); // not emitted yet
    s.flush();
    expect(segs).toHaveLength(1);
    expect(segs[0]).toEqual({ kind: 'line', markdown: 'trailing' });
  });

  it('flush() emits an unclosed fence block (yarım fence flush-race)', () => {
    const segs: Segment[] = [];
    const s = createStreamSegmenter((seg) => segs.push(seg));
    // Open a fence but never close it
    s.feed('```js\nconst x = 1;\nconst y = 2;\n');
    expect(segs).toHaveLength(0); // buffering: fence opened, no close yet
    s.flush();
    // The unclosed block must be emitted as a single 'block' segment
    expect(segs).toHaveLength(1);
    expect(segs[0]!.kind).toBe('block');
    expect(segs[0]!.markdown).toContain('```js');
    expect(segs[0]!.markdown).toContain('const x = 1;');
  });

  it('flush() on a partial fence-opener emits the fence as a block', () => {
    const segs: Segment[] = [];
    const s = createStreamSegmenter((seg) => segs.push(seg));
    // Stream ends with a bare opening fence (no newline after)
    s.feed('preamble\n```');
    s.flush();
    // preamble was a prose line; the bare ``` is a fence-opener → emitted as a block
    expect(segs.some((seg) => seg.kind === 'line' && seg.markdown === 'preamble')).toBe(true);
    expect(segs.some((seg) => seg.kind === 'block' && seg.markdown.startsWith('```'))).toBe(true);
  });

  it('fenceGuard fires at MAX_CODE_BLOCK_LINES and auto-flushes mid-stream', () => {
    const segs: Segment[] = [];
    const s = createStreamSegmenter((seg) => segs.push(seg));
    // Open a fence
    s.feed('```\n');
    // Feed exactly 200 lines inside the code block (lines: opening + 200 = 201 total)
    // The guard fires when block.length >= 200 (i.e. after the 200th line INSIDE the block)
    for (let i = 0; i < 200; i++) {
      s.feed(`line${i}\n`);
    }
    // fenceGuard (block.length >= 200) should have fired, emitting the block
    expect(segs.length).toBeGreaterThanOrEqual(1);
    const blockSegs = segs.filter((seg) => seg.kind === 'block');
    expect(blockSegs.length).toBeGreaterThanOrEqual(1);
    // After the guard fires, mode resets to prose; subsequent lines emit as prose
    s.feed('after fence\n');
    const proseAfter = segs.filter((seg) => seg.kind === 'line' && seg.markdown === 'after fence');
    expect(proseAfter).toHaveLength(1);
  });

  it('properly closed fence emits once on the closing ``` line', () => {
    const segs: Segment[] = [];
    const s = createStreamSegmenter((seg) => segs.push(seg));
    s.feed('```ts\nconst a = 1;\n```\n');
    expect(segs).toHaveLength(1);
    expect(segs[0]!.kind).toBe('block');
    expect(segs[0]!.markdown).toContain('```ts');
    expect(segs[0]!.markdown).toContain('const a = 1;');
    expect(segs[0]!.markdown).toContain('```');
  });

  it('multiple prose lines each emit individually', () => {
    const segs: Segment[] = [];
    const s = createStreamSegmenter((seg) => segs.push(seg));
    s.feed('line one\nline two\nline three\n');
    expect(segs).toHaveLength(3);
    expect(segs.map((s) => s.markdown)).toEqual(['line one', 'line two', 'line three']);
  });
});

// ─── B: createConfirmQueue ────────────────────────────────────────────────────

describe('createConfirmQueue — FIFO burst + concurrent safety (F11-016)', () => {
  it('returns null head when queue is empty', () => {
    const q = createConfirmQueue(() => {});
    expect(q.head()).toBeNull();
    expect(q.size()).toBe(0);
  });

  it('enqueue + answer in FIFO order — 3-item burst', async () => {
    const onChange = vi.fn();
    const q = createConfirmQueue(onChange);

    const results: ConfirmAnswer[] = [];
    const makeReq = (summary: string): { req: ConfirmRequest; promise: Promise<ConfirmAnswer> } => {
      let resolve!: (a: ConfirmAnswer) => void;
      const promise = new Promise<ConfirmAnswer>((res) => { resolve = res; });
      return { req: { summary, resolve }, promise };
    };

    const r1 = makeReq('action-1');
    const r2 = makeReq('action-2');
    const r3 = makeReq('action-3');

    q.enqueue(r1.req);
    q.enqueue(r2.req);
    q.enqueue(r3.req);

    expect(q.size()).toBe(3);
    expect(q.head()!.summary).toBe('action-1');

    // Answer head → first promise resolves with 'y'
    q.answer('y');
    results.push(await r1.promise);
    expect(q.head()!.summary).toBe('action-2');

    q.answer('n');
    results.push(await r2.promise);
    expect(q.head()!.summary).toBe('action-3');

    q.answer('y');
    results.push(await r3.promise);
    expect(q.head()).toBeNull();

    expect(results).toEqual(['y', 'n', 'y']);
    // onChange fired on each enqueue + each answer
    expect(onChange).toHaveBeenCalled();
  });

  it('always-allow (a) auto-resolves same-tool pending items', async () => {
    const q = createConfirmQueue(() => {});

    const answers: Array<ConfirmAnswer | null> = [null, null, null];
    const promises: Promise<ConfirmAnswer>[] = [];

    // item 0: tool-a (head)
    promises.push(new Promise<ConfirmAnswer>((res) =>
      q.enqueue({ summary: 'call tool-a', toolName: 'tool-a', resolve: (a) => { answers[0] = a; res(a); } }),
    ));
    // item 1: tool-b (different tool — must NOT be auto-resolved)
    promises.push(new Promise<ConfirmAnswer>((res) =>
      q.enqueue({ summary: 'call tool-b', toolName: 'tool-b', resolve: (a) => { answers[1] = a; res(a); } }),
    ));
    // item 2: tool-a again (same tool as head — must be auto-resolved by 'a')
    promises.push(new Promise<ConfirmAnswer>((res) =>
      q.enqueue({ summary: 'call tool-a', toolName: 'tool-a', resolve: (a) => { answers[2] = a; res(a); } }),
    ));

    expect(q.size()).toBe(3);

    // Answer head (tool-a) with 'a' (always) — should cascade to item 2 but NOT item 1
    q.answer('a');

    // items 0 and 2 should resolve immediately (synchronous cascade)
    await promises[0];
    await promises[2];

    // item 0 (tool-a): directly answered 'a'
    expect(answers[0]).toBe('a');
    // item 2 (tool-a again): auto-resolved with 'a' by the always-cascade
    expect(answers[2]).toBe('a');
    // item 1 (tool-b): NOT auto-resolved (different tool); still in queue
    expect(q.size()).toBe(1);
    expect(q.head()!.summary).toBe('call tool-b');
    // Resolve item 1 manually
    q.answer('n');
    await promises[1];
    expect(answers[1]).toBe('n');
  });

  it('deny (n) does NOT cascade to remaining queue items', async () => {
    const q = createConfirmQueue(() => {});

    const answers: ConfirmAnswer[] = [];
    const add = (s: string) =>
      new Promise<ConfirmAnswer>((resolve) => q.enqueue({ summary: s, resolve }));

    const p1 = add('req-1');
    const p2 = add('req-2');

    q.answer('n'); // deny only req-1
    answers.push(await p1);

    // req-2 must still be pending (deny did not cascade)
    expect(q.size()).toBe(1);
    expect(q.head()!.summary).toBe('req-2');
    q.answer('y');
    answers.push(await p2);
    expect(answers).toEqual(['n', 'y']);
  });

  it('concurrent Promise.all enqueue + sequential answer — no orphan', async () => {
    const q = createConfirmQueue(() => {});

    // Simulate a concurrent burst: all 5 enqueue calls happen before any answer
    const items = Array.from({ length: 5 }, (_, i) => {
      let resolve!: (a: ConfirmAnswer) => void;
      const promise = new Promise<ConfirmAnswer>((res) => {
        resolve = res;
        q.enqueue({ summary: `burst-${i}`, resolve: res });
      });
      void resolve; // ref only for TS
      return promise;
    });

    expect(q.size()).toBe(5);

    // Answer all in FIFO order
    for (let i = 0; i < 5; i++) {
      expect(q.head()!.summary).toBe(`burst-${i}`);
      q.answer('y');
    }

    const results = await Promise.all(items);
    expect(results).toEqual(['y', 'y', 'y', 'y', 'y']);
    expect(q.size()).toBe(0);
    expect(q.head()).toBeNull();
  });

  it('head() index/total are correct across a burst', () => {
    const q = createConfirmQueue(() => {});

    const noop = () => {};
    q.enqueue({ summary: 'a', resolve: noop });
    q.enqueue({ summary: 'b', resolve: noop });
    q.enqueue({ summary: 'c', resolve: noop });

    // Before any answers: index=1, total=3
    expect(q.head()).toMatchObject({ summary: 'a', index: 1, total: 3 });

    q.answer('y');
    // After 1 answer: index=2, total=3
    expect(q.head()).toMatchObject({ summary: 'b', index: 2, total: 3 });

    q.answer('y');
    expect(q.head()).toMatchObject({ summary: 'c', index: 3, total: 3 });

    q.answer('y');
    expect(q.head()).toBeNull();
  });
});

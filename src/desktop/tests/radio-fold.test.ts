// DT-1 «Telsiz» — the pure transcript fold, hermetically pinned: how the SSE
// frame sequence (chunk* → done|error) becomes operator/deckent lines. The
// send-only-adapter case (no chunks, done carries the whole reply) and the
// torn-tail cases are the honesty lines here.
import { describe, it, expect } from 'vitest';
import { radioSend, radioChunk, radioDone, radioError, type RadioMessage } from '../src/renderer/shell/radio-fold.js';

describe('radio-fold — operator transmits', () => {
  it('radioSend appends the operator line + an empty pending deckent line', () => {
    const list = radioSend([], 'hello watch');
    expect(list).toEqual([
      { role: 'operator', text: 'hello watch' },
      { role: 'deckent', text: '', pending: true },
    ]);
  });
});

describe('radio-fold — stream frames land', () => {
  const base = (): RadioMessage[] => radioSend([], 'q');

  it('chunks accumulate on the pending line in order', () => {
    let list = base();
    list = radioChunk(list, 'Hel');
    list = radioChunk(list, 'lo');
    expect(list[list.length - 1]).toEqual({ role: 'deckent', text: 'Hello', pending: true });
  });

  it('done finalizes with the AUTHORITATIVE full reply (streamed text is superseded)', () => {
    let list = base();
    list = radioChunk(list, 'partial');
    list = radioDone(list, 'the full reply');
    expect(list[list.length - 1]).toEqual({ role: 'deckent', text: 'the full reply' });
  });

  it('a send-only adapter (done with no prior chunks) still lands the reply', () => {
    const list = radioDone(base(), 'one-shot reply');
    expect(list[list.length - 1]).toEqual({ role: 'deckent', text: 'one-shot reply' });
  });

  it('done with an empty reply keeps the streamed text (never erases what arrived)', () => {
    let list = base();
    list = radioChunk(list, 'streamed');
    list = radioDone(list, '');
    expect(list[list.length - 1]).toEqual({ role: 'deckent', text: 'streamed' });
  });

  it('error converts the pending line into an honest failed line', () => {
    const list = radioError(base(), 'chat-stream: no adapter configured');
    expect(list[list.length - 1]).toEqual({
      role: 'deckent',
      text: 'chat-stream: no adapter configured',
      failed: true,
    });
  });

  it('a late frame with NO pending line is a no-op (chunk/done) or an appended failure (error)', () => {
    const settled: RadioMessage[] = [{ role: 'operator', text: 'q' }, { role: 'deckent', text: 'a' }];
    expect(radioChunk(settled, 'x')).toEqual(settled);
    expect(radioDone(settled, 'x')).toEqual(settled);
    const errored = radioError(settled, 'late failure');
    expect(errored[errored.length - 1]).toEqual({ role: 'deckent', text: 'late failure', failed: true });
  });
});

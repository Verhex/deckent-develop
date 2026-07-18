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

describe('radio-fold — 588/F0c persistence (profil-anahtarlı localStorage)', () => {
  it('round-trips a settled transcript; a pending line is DROPPED on parse (a reload cannot resume a dead stream)', async () => {
    const { serializeRadio, parseRadio } = await import('../src/renderer/shell/radio-fold.js');
    const list = [
      { role: 'operator' as const, text: 'q' },
      { role: 'deckent' as const, text: 'a' },
      { role: 'deckent' as const, text: 'half', pending: true },
    ];
    const restored = parseRadio(serializeRadio(list));
    expect(restored).toEqual([
      { role: 'operator', text: 'q' },
      { role: 'deckent', text: 'a' },
    ]);
  });

  it('garbage / null / wrong-shapes parse to [] (tolerant, never a throw); failed-flag survives', async () => {
    const { parseRadio, serializeRadio } = await import('../src/renderer/shell/radio-fold.js');
    expect(parseRadio(null)).toEqual([]);
    expect(parseRadio('not-json{')).toEqual([]);
    expect(parseRadio('{"a":1}')).toEqual([]);
    expect(parseRadio(JSON.stringify([{ role: 'ghost', text: 'x' }, 42]))).toEqual([]);
    const failed = parseRadio(serializeRadio([{ role: 'deckent', text: 'boom', failed: true }]));
    expect(failed).toEqual([{ role: 'deckent', text: 'boom', failed: true }]);
  });

  it('serialize caps at RADIO_PERSIST_CAP (a transcript is working memory, not an archive)', async () => {
    const { serializeRadio, parseRadio, RADIO_PERSIST_CAP } = await import('../src/renderer/shell/radio-fold.js');
    const long = Array.from({ length: RADIO_PERSIST_CAP + 50 }, (_v, i) => ({ role: 'operator' as const, text: `m${i}` }));
    const restored = parseRadio(serializeRadio(long));
    expect(restored).toHaveLength(RADIO_PERSIST_CAP);
    expect(restored[0]!.text).toBe('m50'); // en-eskiler düşer
  });
});

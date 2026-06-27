// F11-012 — Ink render-path UTF-8 / Türkçe chunk-boundary guard.
//
// The segmenter is the canonical streaming seam between provider tokens and the
// Ink renderer. When it receives RAW UTF-8 bytes (not a pre-decoded string), a
// multi-byte code point — Turkish ç/ğ/ı/İ/ö/ş/ü or any emoji — can straddle a
// chunk boundary. A non-streaming per-chunk decode would bisect that code point
// into U+FFFD replacement characters (garble). These tests feed bytes at the
// most adversarial granularity — ONE BYTE AT A TIME, so every multi-byte code
// point is split mid-sequence — and assert the reassembled segments equal the
// exact original string. Pre-fix RED: `buf += <Uint8Array>` coerces to
// "197,159,..." digit-garble, so reassembly ≠ original; post-fix the segmenter
// decodes with streaming semantics (carry the incomplete tail) → exact match.
import { describe, it, expect } from 'vitest';
import { createStreamSegmenter, type Segment } from '../../../src/cli/repl/stream-segmenter.js';

function collect(): { seg: Segment[]; emit: (s: Segment) => void } {
  const seg: Segment[] = [];
  return { seg, emit: (s) => seg.push(s) };
}

const enc = new TextEncoder();

// All multi-byte: Turkish 2-byte (ç ğ ı İ ö ş ü), em-dash 3-byte, ☕/😀 emoji,
// 🇹🇷 flag (two 4-byte regional indicators). A torture string for byte splitting.
const TURKISH = 'Şu çörək ğıpta İÖÜ ödülü — café ☕ 🇹🇷 😀';

describe('stream-segmenter UTF-8 chunk-boundary guard (F11-012)', () => {
  it('reassembles a Turkish+emoji line fed ONE BYTE AT A TIME (every boundary mid-codepoint)', () => {
    const bytes = enc.encode(TURKISH);
    // sanity: the string MUST contain multi-byte code points or the test is vacuous
    expect(bytes.length).toBeGreaterThan(TURKISH.length);

    const { seg, emit } = collect();
    const s = createStreamSegmenter(emit);
    for (const b of bytes) s.feed(new Uint8Array([b])); // one byte per feed → splits every code point
    s.flush();

    // no newline in the input → exactly one prose line, equal to the original
    expect(seg).toHaveLength(1);
    expect(seg[0]).toEqual({ kind: 'line', markdown: TURKISH });
    // no U+FFFD replacement chars leaked through
    expect(seg[0]!.markdown).not.toContain('�');
  });

  it('reassembles when split at adversarial 2/3/4-byte mid-codepoint boundaries', () => {
    const bytes = enc.encode(TURKISH);
    const { seg, emit } = collect();
    const s = createStreamSegmenter(emit);
    // walk in irregular strides so cuts land inside 2-, 3- and 4-byte sequences
    let i = 0;
    for (const stride of cycle([1, 2, 3, 5], bytes.length)) {
      s.feed(bytes.subarray(i, i + stride));
      i += stride;
    }
    s.flush();
    expect(seg.map((x) => x.markdown).join('')).toBe(TURKISH);
  });

  it('decodes a single 2-byte char (ş) split exactly between its two bytes', () => {
    const [b0, b1] = enc.encode('ş'); // 0xC5 0x9F
    const { seg, emit } = collect();
    const s = createStreamSegmenter(emit);
    s.feed(new Uint8Array([b0!])); // lead byte alone — incomplete, must be held
    expect(s.partial()).toBe('');  // not surfaced as a half/replacement char
    s.feed(new Uint8Array([b1!])); // continuation byte completes the code point
    s.flush();
    expect(seg).toEqual([{ kind: 'line', markdown: 'ş' }]);
  });

  it('preserves newline segmentation when multi-line Turkish is fed byte-by-byte', () => {
    const input = 'satır bir: çğış\nsatır iki: öü 😀\nüçüncü\n';
    const bytes = enc.encode(input);
    const { seg, emit } = collect();
    const s = createStreamSegmenter(emit);
    for (const b of bytes) s.feed(new Uint8Array([b]));
    s.flush();
    expect(seg).toEqual([
      { kind: 'line', markdown: 'satır bir: çğış' },
      { kind: 'line', markdown: 'satır iki: öü 😀' },
      { kind: 'line', markdown: 'üçüncü' },
    ]);
    // every '\n'-terminated line back to the exact original
    expect(seg.map((x) => x.markdown).join('\n') + '\n').toBe(input);
  });

  it('buffers a fenced code block fed byte-by-byte and emits it whole, intact', () => {
    const input = '```ts\nconst ş = "çığ";\n```\n';
    const bytes = enc.encode(input);
    const { seg, emit } = collect();
    const s = createStreamSegmenter(emit);
    for (const b of bytes) s.feed(new Uint8Array([b]));
    expect(seg).toEqual([{ kind: 'block', markdown: '```ts\nconst ş = "çığ";\n```' }]);
  });

  // ── behavior preservation: string feeds and ASCII are byte-for-byte unchanged ──

  it('string feed of the same content is identical to the byte feed (whole-codepoint path unchanged)', () => {
    // byte path: one byte per feed
    const fromBytes = collect();
    const sb = createStreamSegmenter(fromBytes.emit);
    for (const b of enc.encode(TURKISH)) sb.feed(new Uint8Array([b]));
    sb.flush();

    // string path: a single whole-codepoint string feed (the production decoded path)
    const fromStr = collect();
    const ss = createStreamSegmenter(fromStr.emit);
    ss.feed(TURKISH);
    ss.flush();

    expect(fromBytes.seg).toEqual(fromStr.seg);
    expect(fromStr.seg).toEqual([{ kind: 'line', markdown: TURKISH }]);
  });

  it('ASCII byte feed segments identically to ASCII string feed (no behavior change)', () => {
    const ascii = 'first line\nsecond line\nplain\n';
    const fromStr = collect();
    const ss = createStreamSegmenter(fromStr.emit);
    ss.feed(ascii);
    ss.flush();

    const fromBytes = collect();
    const sb = createStreamSegmenter(fromBytes.emit);
    for (const b of enc.encode(ascii)) sb.feed(new Uint8Array([b]));
    sb.flush();

    expect(fromBytes.seg).toEqual(fromStr.seg);
    expect(fromStr.seg).toEqual([
      { kind: 'line', markdown: 'first line' },
      { kind: 'line', markdown: 'second line' },
      { kind: 'line', markdown: 'plain' },
    ]);
  });
});

/** Yield strides from `pattern` repeatedly until their sum reaches `total`. */
function* cycle(pattern: number[], total: number): Generator<number> {
  let sum = 0;
  let i = 0;
  while (sum < total) {
    const stride = Math.min(pattern[i % pattern.length]!, total - sum);
    sum += stride;
    i += 1;
    yield stride;
  }
}

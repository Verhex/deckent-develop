// tests/orchestra/planner-failure-evidence.test.ts
// MASTER 3356 — a planner failure must be diagnosable without leaking provider output.
//
// The failure message reaches the operator's screen and the logs. Provider
// stderr routinely carries tokens, auth URLs and absolute paths, and the model's
// own stdout can echo whatever context was pasted into the prompt — so neither
// belongs in the message verbatim. Before this slice the nonzero-exit branch
// interpolated 500 bytes of raw stderr and the parse branch interpolated a
// 200-byte stdout snippet.
//
// The replacement has to stay useful: byte counts plus an algorithm-prefixed,
// byte-length-framed digest tell two failures apart and correlate with the
// invocation receipt, while reproducing nothing.
import { describe, expect, it } from 'vitest';

import { framedOutputDigest } from '../../src/orchestra/planner.js';

describe('planner failure evidence digest', () => {
  it('is algorithm-prefixed', () => {
    expect(framedOutputDigest(['out'])).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('is deterministic for the same parts', () => {
    expect(framedOutputDigest(['out', 'err'])).toBe(framedOutputDigest(['out', 'err']));
  });

  // The whole point of framing: a plain concatenation would hash ('ab','c') and
  // ('a','bc') identically, so one failure could masquerade as another.
  it('does not collapse parts that a concatenation would merge', () => {
    expect(framedOutputDigest(['ab', 'c'])).not.toBe(framedOutputDigest(['a', 'bc']));
  });

  it('separates an empty part from an absent one only by position, not by silence', () => {
    expect(framedOutputDigest(['x', ''])).not.toBe(framedOutputDigest(['x']));
  });

  it('treats undefined as an empty part rather than throwing', () => {
    expect(framedOutputDigest(['x', undefined])).toBe(framedOutputDigest(['x', '']));
  });

  // A digest that changed with the byte length alone would let an attacker or a
  // careless log reader infer content; it must depend on the bytes themselves.
  it('changes when content changes at equal length', () => {
    expect(framedOutputDigest(['aaaa'])).not.toBe(framedOutputDigest(['aaab']));
  });

  it('counts bytes, not code units, so multibyte output frames correctly', () => {
    // 'é' is two UTF-8 bytes: framing by string length would make these collide.
    expect(framedOutputDigest(['é'])).not.toBe(framedOutputDigest(['e']));
  });
});

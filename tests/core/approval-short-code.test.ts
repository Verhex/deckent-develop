// ─── Approval short codes (DE1) — addressing-sugar pins ─────────────────────
//
// Pins: (1) codes are deterministic, 5-char, Crockford-alphabet (no O/0 I/1);
// (2) input normalization maps the classic confusables; (3) resolution is
// fail-closed against the CURRENT pending set — unknown codes miss, stale
// codes cannot address anything, collisions are typed ambiguous (never a
// guess); (4) a full id never LOOKS like a short code, so the decide arg
// dispatcher cannot misroute it.

import { describe, expect, it } from 'vitest';

import {
  SHORT_CODE_LENGTH,
  looksLikeShortCode,
  normalizeShortCode,
  resolveShortCode,
  shortCodeFor,
} from '../../src/core/approval-short-code.js';

describe('approval short codes', () => {
  it('is deterministic, 5 chars, confusion-resistant alphabet', () => {
    const id = 'aprp-7662509635c6268151493f1e1d9279aa4b341849ff2ecdac965fd52f5ed219e8';
    const code = shortCodeFor(id);
    expect(code).toBe(shortCodeFor(id));
    expect(code).toHaveLength(SHORT_CODE_LENGTH);
    expect(code).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{5}$/u);
    expect(shortCodeFor('aprp-other')).not.toBe(code);
  });

  it('normalizes confusables and recognizes code-shaped input only', () => {
    expect(normalizeShortCode(' o1il2 ')).toBe('01112');
    const code = shortCodeFor('cnf-abc');
    expect(looksLikeShortCode(code.toLowerCase())).toBe(true);
    expect(looksLikeShortCode('aprp-7662509635c62681')).toBe(false);
    expect(looksLikeShortCode('K7X2')).toBe(false);
  });

  it('resolves only against the current pending set — fail-closed and typed', () => {
    const ids = ['aprp-live-1', 'cnf-live-2', 'checkpoint-live-3'];
    const target = ids[1]!;
    expect(resolveShortCode(shortCodeFor(target), ids))
      .toEqual({ state: 'resolved', id: target });
    // A code minted from an id that is no longer pending resolves to nothing.
    expect(resolveShortCode(shortCodeFor('aprp-settled-yesterday'), ids))
      .toEqual({ state: 'unknown' });
    // Lowercase + confusable input still resolves.
    expect(resolveShortCode(shortCodeFor(target).toLowerCase(), ids))
      .toEqual({ state: 'resolved', id: target });
  });

  it('reports collisions as ambiguous with every match (never a guess)', () => {
    const target = 'aprp-collision-a';
    const code = shortCodeFor(target);
    // Duplicate the SAME id in the candidate list to force a controlled
    // multi-match without hunting a real 25-bit collision.
    const resolution = resolveShortCode(code, [target, target]);
    expect(resolution.state).toBe('ambiguous');
    if (resolution.state === 'ambiguous') {
      expect(resolution.ids).toEqual([target, target]);
    }
  });
});

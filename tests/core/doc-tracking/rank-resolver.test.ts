import { describe, it, expect } from 'vitest';
import { resolveRank } from '../../../src/core/doc-tracking/rank-resolver.js';
import { DEFAULT_DOC_TRACKING_CONFIG as C } from '../../../src/core/doc-tracking/types.js';

describe('resolveRank', () => {
  it('front-matter doc_rank overrides everything', () => {
    expect(resolveRank('docs/adr/090.md', { doc_rank: 3 }, C)).toBe(3);
  });
  it('rankMap glob applies when no override', () => {
    expect(resolveRank('docs/adr/090.md', {}, C)).toBe(1);
    expect(resolveRank('docs/analysis/x.md', {}, C)).toBe(90);
  });
  it('most-specific (longest) pattern wins', () => {
    expect(resolveRank('docs/DOC-POLICY.md', {}, C)).toBe(0); // exact beats docs/**-style
  });
  it('falls back to defaultRank', () => {
    expect(resolveRank('random/x.md', {}, C)).toBe(C.defaultRank);
  });
  it('ignores invalid override (negative / NaN)', () => {
    expect(resolveRank('docs/adr/090.md', { doc_rank: -2 }, C)).toBe(1);
    expect(resolveRank('random/x.md', { doc_rank: Number.NaN }, C)).toBe(C.defaultRank);
  });
});

// S8 determinism gate pins (sprint-523 task 8): in-sync passes, undeclared
// drift fails typed, declared drift passes ONLY with a canonical-side
// disposition (a bare allowlist entry is itself a failure). The digest comes
// from the S5 snapshot — this suite also pins that the gate DERIVES rather
// than re-hashing (no second digest mechanism).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compareDeterminism } from '../../scripts/lint-skill-catalog-determinism.mjs';

const A = 'sha256:' + 'a'.repeat(64);
const B = 'sha256:' + 'b'.repeat(64);

describe('skill catalog determinism gate (S8)', () => {
  it('identical digests → IN_SYNC pass', () => {
    const r = compareDeterminism({ catalogDigest: A, withSidecarDigest: A, baseline: null });
    expect(r.ok).toBe(true);
    expect(r.verdict).toBe('IN_SYNC');
  });

  it('divergent digests with no baseline → typed UNDECLARED_DRIFT failure', () => {
    const r = compareDeterminism({ catalogDigest: A, withSidecarDigest: B, baseline: null });
    expect(r.ok).toBe(false);
    expect(r.verdict).toBe('UNDECLARED_DRIFT');
    expect(r.detail).toContain(A);
    expect(r.detail).toContain(B);
  });

  it('declared drift WITH a disposition passes and surfaces the disposition', () => {
    const baseline = {
      declaredDrift: [{
        catalogDigest: A,
        withSidecarDigest: B,
        disposition: 'machine-local stats sidecar declared 2026-08-12; canonical side unchanged',
      }],
    };
    const r = compareDeterminism({ catalogDigest: A, withSidecarDigest: B, baseline });
    expect(r.ok).toBe(true);
    expect(r.verdict).toBe('DECLARED_DRIFT');
    expect(r.detail).toContain('canonical side unchanged');
  });

  it('a bare allowlist entry (no disposition) is REFUSED — the §S8 shape is a disposition', () => {
    const baseline = { declaredDrift: [{ catalogDigest: A, withSidecarDigest: B, disposition: '' }] };
    const r = compareDeterminism({ catalogDigest: A, withSidecarDigest: B, baseline });
    expect(r.ok).toBe(false);
    expect(r.verdict).toBe('DECLARED_WITHOUT_DISPOSITION');
  });

  it('the gate derives the digest from the S5 snapshot — no second hash mechanism in the script', () => {
    const src = readFileSync('scripts/lint-skill-catalog-determinism.mjs', 'utf-8');
    expect(src).toContain('snapshotSkillCatalog');
    expect(src).not.toMatch(/createHash|crypto/);
  });
});

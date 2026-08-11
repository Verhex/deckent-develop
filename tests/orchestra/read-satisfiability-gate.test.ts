/**
 * Tests for the read-side scope-satisfiability rule (G1b extension) —
 * Sprint 521, Task 521-008.
 *
 * Born from two honest sprint-519/520 BOUNDARY_BLOCKED refusals: a task whose
 * description demands consuming machinery outside its read scope reaches a
 * worker and fails only at execution time — the 2030 taxonomy task could not
 * read the providers it had to classify, and the 4021 tenant task could not
 * read the principal resolver it was ordered to consume. The plan-time gate
 * already warned on write-side MENTIONED_NOT_WRITABLE (description-adjacent
 * verb + negation guard, rule 1b); this file pins the read-side sibling,
 * MENTIONED_NOT_READABLE, fired the same way but gated on read verbs
 * (consume/classify/read/oku/tüket/sınıflandır) and read-visibility
 * (filesRead ∪ directories ∪ filesWrite) instead of write-visibility.
 *
 * No new gate mechanism is exercised here — every case below still goes
 * through the single `lintScopeSatisfiability` entry point.
 */
import { describe, it, expect } from 'vitest';
import {
  lintScopeSatisfiability,
  type SatisfiabilityInput,
  type SatisfiabilityFinding,
} from '../../src/orchestra/scope-satisfiability.js';

function base(overrides: Partial<SatisfiabilityInput>): SatisfiabilityInput {
  return {
    description: '',
    goCriteria: '',
    proofCommands: [],
    filesWrite: [],
    directories: [],
    trackedFiles: [],
    ...overrides,
  };
}

function findingsOf(code: SatisfiabilityFinding['code'], findings: SatisfiabilityFinding[]) {
  return findings.filter(f => f.code === code);
}

// ─── Measured case 1: sprint-519 taxonomy task (2030) ─────────────────
// "the 2030 taxonomy task could not read the providers it had to classify" —
// the task's write authority never granted visibility into the provider
// catalog it was told to classify against.

describe('lintScopeSatisfiability — MENTIONED_NOT_READABLE (measured case: task 2030, taxonomy)', () => {
  it('WARNs when the description orders classifying a path outside read scope', () => {
    const input = base({
      description:
        'Classify each configured provider against the tiers defined in src/core/provider-catalog.ts and update the ranking table.',
      filesWrite: ['src/orchestra/tier-ranker.ts'],
    });
    const findings = findingsOf('MENTIONED_NOT_READABLE', lintScopeSatisfiability(input));
    expect(findings).toEqual([
      expect.objectContaining({
        severity: 'WARN',
        code: 'MENTIONED_NOT_READABLE',
        path: 'src/core/provider-catalog.ts',
      }),
    ]);
  });

  it('does not WARN once src/core/provider-catalog.ts is added to filesRead', () => {
    const input = base({
      description:
        'Classify each configured provider against the tiers defined in src/core/provider-catalog.ts and update the ranking table.',
      filesWrite: ['src/orchestra/tier-ranker.ts'],
      filesRead: ['src/core/provider-catalog.ts'],
    });
    expect(findingsOf('MENTIONED_NOT_READABLE', lintScopeSatisfiability(input))).toEqual([]);
  });
});

// ─── Measured case 2: sprint-520 tenant task (4021) ────────────────────
// "the 4021 tenant task could not read the principal resolver it was ordered
// to consume" — the task's write authority never granted visibility into the
// principal resolver that drives the tenant lookup chain it had to build.

describe('lintScopeSatisfiability — MENTIONED_NOT_READABLE (measured case: task 4021, tenant)', () => {
  it('WARNs when the description orders consuming a path outside read scope', () => {
    const input = base({
      description:
        'Consume the principal resolution logic in src/core/principal-resolver.ts to drive the new tenant lookup chain.',
      filesWrite: ['src/orchestra/tenant-chain.ts'],
    });
    const findings = findingsOf('MENTIONED_NOT_READABLE', lintScopeSatisfiability(input));
    expect(findings).toEqual([
      expect.objectContaining({
        severity: 'WARN',
        code: 'MENTIONED_NOT_READABLE',
        path: 'src/core/principal-resolver.ts',
      }),
    ]);
  });

  it('does not WARN once src/core/ is covered by a scoped directory', () => {
    const input = base({
      description:
        'Consume the principal resolution logic in src/core/principal-resolver.ts to drive the new tenant lookup chain.',
      filesWrite: ['src/orchestra/tenant-chain.ts'],
      directories: ['src/core/'],
    });
    expect(findingsOf('MENTIONED_NOT_READABLE', lintScopeSatisfiability(input))).toEqual([]);
  });
});

// ─── Visibility escapes ─────────────────────────────────────────────────

describe('lintScopeSatisfiability — MENTIONED_NOT_READABLE visibility escapes', () => {
  it('does not WARN when the mentioned path is itself in filesWrite (write implies read)', () => {
    const input = base({
      description: 'Read src/orchestra/scope-satisfiability.ts before extending its rules.',
      filesWrite: ['src/orchestra/scope-satisfiability.ts'],
    });
    expect(findingsOf('MENTIONED_NOT_READABLE', lintScopeSatisfiability(input))).toEqual([]);
  });
});

// ─── Negative controls ───────────────────────────────────────────────────

describe('lintScopeSatisfiability — MENTIONED_NOT_READABLE negative controls', () => {
  it('does not WARN when no read verb is adjacent to the mention', () => {
    const input = base({
      description: 'src/core/provider-catalog.ts exists in the repository for historical reasons.',
      filesWrite: ['src/orchestra/tier-ranker.ts'],
    });
    expect(findingsOf('MENTIONED_NOT_READABLE', lintScopeSatisfiability(input))).toEqual([]);
  });

  it('negation guard suppresses an otherwise-valid WARN in the same sentence', () => {
    const input = base({
      description:
        'Consume src/core/principal-resolver.ts is NOT what we want here — do not touch it, hot-file.',
      filesWrite: ['src/orchestra/tenant-chain.ts'],
    });
    expect(findingsOf('MENTIONED_NOT_READABLE', lintScopeSatisfiability(input))).toEqual([]);
  });

  it('positive control: the same sentence minus the negation DOES fire', () => {
    // Proves the guard above is suppressing a real would-be finding, not a
    // vacuous one — mirrors the write-side rule 1b positive control.
    const input = base({
      description:
        'Consume src/core/principal-resolver.ts as part of this change, it drives the lookup chain.',
      filesWrite: ['src/orchestra/tenant-chain.ts'],
    });
    const findings = findingsOf('MENTIONED_NOT_READABLE', lintScopeSatisfiability(input));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.path).toBe('src/core/principal-resolver.ts');
  });

  it('bare filename mentions are gated the same way as the write-side rule (root-tracked only)', () => {
    const input = base({
      description: 'This references catalog.txt informally, not a real repo file, while we classify things.',
      trackedFiles: ['README.md'],
    });
    expect(findingsOf('MENTIONED_NOT_READABLE', lintScopeSatisfiability(input))).toEqual([]);
  });

  it('no finding at all — including this rule — on prose that names no path', () => {
    // NO-GO guard: a description that uses read-verb vocabulary ("consume",
    // "classify", "read") without naming any concrete path must stay clean.
    const input = base({
      description:
        'Consume the upstream feedback, classify it by severity, and read through the backlog before planning.',
      filesWrite: ['src/orchestra/tier-ranker.ts'],
    });
    expect(lintScopeSatisfiability(input)).toEqual([]);
  });
});

// ─── Today's passing plans stay finding-free ───────────────────────────

describe('lintScopeSatisfiability — MENTIONED_NOT_READABLE does not regress clean tasks', () => {
  it('produces zero findings for a fully self-consistent task (no read-only mentions)', () => {
    const cleanTask: SatisfiabilityInput = {
      description:
        'Add a new helper function to src/core/utils.ts and export it from there; write a matching test.',
      goCriteria: 'src/core/utils.ts exports the new helper; tests/core/utils.test.ts covers it.',
      proofCommands: ['npx vitest run tests/core/utils.test.ts'],
      filesWrite: ['src/core/utils.ts', 'tests/core/utils.test.ts'],
      directories: [],
      trackedFiles: ['src/core/utils.ts', 'tests/core/utils.test.ts', 'package.json'],
    };
    expect(lintScopeSatisfiability(cleanTask)).toEqual([]);
  });

  it('a task consuming only its own filesWrite/directories never triggers MENTIONED_NOT_READABLE', () => {
    const input = base({
      description: 'Read src/orchestra/ thoroughly, then consume tests/orchestra/ fixtures to extend the gate.',
      directories: ['src/orchestra/', 'tests/orchestra/'],
      filesWrite: ['src/orchestra/scope-satisfiability.ts'],
    });
    expect(findingsOf('MENTIONED_NOT_READABLE', lintScopeSatisfiability(input))).toEqual([]);
  });
});

// ─── Warning-class only (NO-GO guard: no blocking-class findings) ─────────

describe('lintScopeSatisfiability — MENTIONED_NOT_READABLE is warning-class only', () => {
  it('never emits a BLOCK severity, across every fixture in this file that fires', () => {
    const firingInputs: SatisfiabilityInput[] = [
      base({
        description:
          'Classify each configured provider against the tiers defined in src/core/provider-catalog.ts and update the ranking table.',
        filesWrite: ['src/orchestra/tier-ranker.ts'],
      }),
      base({
        description:
          'Consume the principal resolution logic in src/core/principal-resolver.ts to drive the new tenant lookup chain.',
        filesWrite: ['src/orchestra/tenant-chain.ts'],
      }),
    ];
    for (const input of firingInputs) {
      const findings = findingsOf('MENTIONED_NOT_READABLE', lintScopeSatisfiability(input));
      expect(findings.length).toBeGreaterThan(0);
      expect(findings.every(f => f.severity === 'WARN')).toBe(true);
    }
  });
});

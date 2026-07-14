/**
 * Tests for scope-satisfiability lint (G1b) — Sprint 399, Task 399-004.
 *
 * Covers:
 * (1) Rule MENTIONED_NOT_WRITABLE — 1a (goCriteria, unconditional BLOCK) and
 *     1b (description, verb-adjacent WARN + negation-guard), including the
 *     root-file OR-clause and the directories escape.
 * (2) Rule PROOF_PATH_MISSING — BLOCK when a proof-command path resolves to
 *     neither trackedFiles, filesWrite, nor directories; tracked/filesWrite/
 *     directories escapes; glob tokens are structurally skipped.
 * (3) Rule UNCHANGED_IN_WRITE — WARN when a declared-unchanged file is also
 *     in filesWrite; no finding when there's no such contradiction.
 * (4) The 3 real sprint-397 fixtures (007/011/012), loaded statically — no
 *     git calls at runtime (hermetic).
 * (5) A clean task → zero findings.
 * (6) The mandatory negation-guard fixture, styled on this task's own
 *     "planner.ts:973 — ona DOKUNMA" phrasing — proven non-vacuous via a
 *     positive-control sibling that DOES fire without the negation.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  lintScopeSatisfiability,
  type SatisfiabilityInput,
  type SatisfiabilityFinding,
} from '../../src/orchestra/scope-satisfiability.js';

function loadFixture(name: string): SatisfiabilityInput {
  const raw = readFileSync(
    new URL(`../fixtures/prompt-contract-397/${name}`, import.meta.url),
    'utf-8',
  );
  const { _source, ...input } = JSON.parse(raw);
  void _source;
  return input as SatisfiabilityInput;
}

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

// ─── Rule 1a: MENTIONED_NOT_WRITABLE (goCriteria, unconditional) ──────

describe('lintScopeSatisfiability — rule 1a (goCriteria)', () => {
  it('BLOCKs a goCriteria-mentioned path outside filesWrite/directories', () => {
    const input = base({
      goCriteria: 'src/foo/bar.ts exports the new helper and is fully green.',
      filesWrite: ['src/foo/other.ts'],
    });
    const findings = lintScopeSatisfiability(input);
    expect(findings).toEqual([
      expect.objectContaining({
        severity: 'BLOCK',
        code: 'MENTIONED_NOT_WRITABLE',
        path: 'src/foo/bar.ts',
      }),
    ]);
  });

  it('does not BLOCK when the mentioned path is covered by directories', () => {
    const input = base({
      goCriteria: 'src/foo/bar.ts exports the new helper and is fully green.',
      directories: ['src/foo/'],
    });
    expect(lintScopeSatisfiability(input)).toEqual([]);
  });

  it('does not BLOCK when the mentioned path is in filesWrite', () => {
    const input = base({
      goCriteria: 'src/foo/bar.ts exports the new helper and is fully green.',
      filesWrite: ['src/foo/bar.ts'],
    });
    expect(lintScopeSatisfiability(input)).toEqual([]);
  });

  it('root-file OR-clause: a bare root filename mention resolves via trackedFiles', () => {
    const input = base({
      goCriteria: 'CHANGELOG.md is refreshed and fully green.',
      trackedFiles: ['CHANGELOG.md'],
    });
    const findings = findingsOf('MENTIONED_NOT_WRITABLE', lintScopeSatisfiability(input));
    expect(findings).toEqual([
      expect.objectContaining({ severity: 'BLOCK', path: 'CHANGELOG.md' }),
    ]);
  });

  it('root-file OR-clause does not false-positive on a non-tracked bare word+dot token', () => {
    const input = base({
      goCriteria: 'This references example.txt informally, not a real repo file.',
      trackedFiles: ['README.md'],
    });
    expect(lintScopeSatisfiability(input)).toEqual([]);
  });

  it('root-file OR-clause requires the trackedFiles entry to be root-level (no slash)', () => {
    const input = base({
      goCriteria: 'planner.ts must stay green.',
      trackedFiles: ['src/orchestra/planner.ts'],
    });
    // "planner.ts" bare mention does NOT equal any ROOT (slash-free) trackedFiles
    // entry — src/orchestra/planner.ts is nested, so the OR-clause never gates it in.
    expect(lintScopeSatisfiability(input)).toEqual([]);
  });
});

// ─── Rule 1b: MENTIONED_NOT_WRITABLE (description, verb+negation gated) ──

describe('lintScopeSatisfiability — rule 1b (description)', () => {
  it('WARNs when a positive verb sits next to an unauthorized path mention', () => {
    const input = base({
      description: 'Update src/foo/bar.ts to add the new branch.',
      filesWrite: ['src/foo/other.ts'],
    });
    const findings = lintScopeSatisfiability(input);
    expect(findings).toEqual([
      expect.objectContaining({
        severity: 'WARN',
        code: 'MENTIONED_NOT_WRITABLE',
        path: 'src/foo/bar.ts',
      }),
    ]);
  });

  it('does not WARN when no verb is adjacent to the mention', () => {
    const input = base({
      description: 'src/foo/bar.ts exists in the repository for historical reasons.',
      filesWrite: ['src/foo/other.ts'],
    });
    expect(lintScopeSatisfiability(input)).toEqual([]);
  });

  it('negation guard suppresses an otherwise-valid WARN in the same sentence', () => {
    const input = base({
      description: 'Update src/foo/bar.ts is NOT what we want here — do not touch it, hot-file.',
      filesWrite: ['src/foo/other.ts'],
    });
    expect(lintScopeSatisfiability(input)).toEqual([]);
  });

  it('positive control: the same sentence minus the negation DOES fire', () => {
    // Proves the guard above is suppressing a real would-be finding, not a vacuous one.
    const input = base({
      description: 'Update src/foo/bar.ts as part of this change, it needs the new branch.',
      filesWrite: ['src/foo/other.ts'],
    });
    const findings = findingsOf('MENTIONED_NOT_WRITABLE', lintScopeSatisfiability(input));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.path).toBe('src/foo/bar.ts');
  });

  it("negation guard suppresses even with English negation lemmas (don't modify)", () => {
    const input = base({
      description: "We could update src/foo/bar.ts but don't modify it in this task.",
      filesWrite: ['src/foo/other.ts'],
    });
    expect(lintScopeSatisfiability(input)).toEqual([]);
  });
});

// ─── Rule 2: PROOF_PATH_MISSING ────────────────────────────────────────

describe('lintScopeSatisfiability — rule 2 (proofCommands)', () => {
  it('BLOCKs a proof-command path that is neither tracked, writable, nor scoped', () => {
    const input = base({
      proofCommands: ['npx vitest run tests/orphan/missing.test.ts'],
    });
    const findings = lintScopeSatisfiability(input);
    expect(findings).toEqual([
      expect.objectContaining({
        severity: 'BLOCK',
        code: 'PROOF_PATH_MISSING',
        path: 'tests/orphan/missing.test.ts',
      }),
    ]);
  });

  it('does not BLOCK a proof-command path that is already tracked', () => {
    const input = base({
      proofCommands: ['npx vitest run tests/real/existing.test.ts'],
      trackedFiles: ['tests/real/existing.test.ts'],
    });
    expect(lintScopeSatisfiability(input)).toEqual([]);
  });

  it('does not BLOCK a proof-command path the task is itself creating (filesWrite)', () => {
    const input = base({
      proofCommands: ['npx vitest run tests/new/generated.test.ts'],
      filesWrite: ['tests/new/generated.test.ts'],
    });
    expect(lintScopeSatisfiability(input)).toEqual([]);
  });

  it('does not BLOCK a proof-command path covered by directories', () => {
    const input = base({
      proofCommands: ['npx vitest run tests/scoped/whatever.test.ts'],
      directories: ['tests/scoped/'],
    });
    expect(lintScopeSatisfiability(input)).toEqual([]);
  });

  it('skips glob-wildcard proof-command arguments (no fuzzy resolution)', () => {
    const input = base({
      proofCommands: ['npx vitest run tests/cli/chat-tool-exec*.test.ts'],
    });
    expect(lintScopeSatisfiability(input)).toEqual([]);
  });
});

// ─── Rule 3: UNCHANGED_IN_WRITE ─────────────────────────────────────────

describe('lintScopeSatisfiability — rule 3 (unchanged declaration ∩ filesWrite)', () => {
  it('WARNs when a file declared unchanged is also present in filesWrite', () => {
    const input = base({
      description: 'ci-baseline-detect.test AYNEN kalır.',
      filesWrite: ['tests/scripts/ci-baseline-detect.test.ts'],
    });
    const findings = lintScopeSatisfiability(input);
    expect(findings).toEqual([
      expect.objectContaining({
        severity: 'WARN',
        code: 'UNCHANGED_IN_WRITE',
        path: 'tests/scripts/ci-baseline-detect.test.ts',
      }),
    ]);
  });

  it('does not WARN when the declared-unchanged file is not in filesWrite', () => {
    const input = base({
      description: 'ci-baseline-detect.test AYNEN kalır.',
      filesWrite: ['README.md'],
    });
    expect(lintScopeSatisfiability(input)).toEqual([]);
  });

  it('recognizes the English "must remain" declaration form', () => {
    const input = base({
      description: 'src/core/config.ts must remain untouched by this task.',
      filesWrite: ['src/core/config.ts'],
    });
    const findings = findingsOf('UNCHANGED_IN_WRITE', lintScopeSatisfiability(input));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.path).toBe('src/core/config.ts');
  });

  it('does not conflate an unrelated file mentioned earlier in the same clause', () => {
    // README.md is legitimately being written to; ci-baseline-detect.test is the
    // one declared unchanged. Only the latter should produce a finding — this is
    // the real sprint-397 shape (see task-011.json).
    const input = base({
      description: 'K4: restore the badge into README.md — ci-baseline-detect.test AYNEN kalır.',
      filesWrite: ['README.md', 'tests/scripts/ci-baseline-detect.test.ts'],
    });
    const findings = findingsOf('UNCHANGED_IN_WRITE', lintScopeSatisfiability(input));
    expect(findings).toEqual([
      expect.objectContaining({ path: 'tests/scripts/ci-baseline-detect.test.ts' }),
    ]);
  });
});

// ─── Clean task — zero findings ────────────────────────────────────────

describe('lintScopeSatisfiability — clean task', () => {
  it('produces zero findings for a fully self-consistent task', () => {
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
});

// ─── Mandatory negation-guard fixture ──────────────────────────────────
// Styled on this very task's own description text ("ölü validateGoCriteriaScope
// (planner.ts:973 — ona DOKUNMA, hot-file; disposition Brain'de)") — a sentence
// like this must never produce a finding, or the gate would have blocked its
// own authoring sprint.

describe('lintScopeSatisfiability — mandatory negation-guard fixture', () => {
  it('a "path + verb + DOKUNMA" sentence (399-004 own style) produces no finding', () => {
    const input = base({
      description:
        "Ölü kod olan src/orchestra/planner.ts dosyasını güncelle ya da taşı DEME — ona DOKUNMA, hot-file (disposition Brain'de).",
      filesWrite: ['src/orchestra/scope-satisfiability.ts'],
      trackedFiles: ['src/orchestra/planner.ts', 'src/orchestra/scope-satisfiability.ts'],
    });
    expect(lintScopeSatisfiability(input)).toEqual([]);
  });

  it('the literal bare "planner.ts:973 — ona DOKUNMA" phrasing produces no finding either', () => {
    // Bare (no directory prefix) — doesn't even reach a path-regex match, so this
    // is a belt-and-suspenders check that nothing crashes or false-fires on it.
    const input = base({
      description:
        "Ölü validateGoCriteriaScope (planner.ts:973 — ona DOKUNMA, hot-file; disposition Brain'de) yalnız test-path kontrolü yapıyor.",
      trackedFiles: ['src/orchestra/planner.ts'],
    });
    expect(lintScopeSatisfiability(input)).toEqual([]);
  });
});

// ─── Real sprint-397 fixtures (hermetic — no git calls) ────────────────

describe('lintScopeSatisfiability — real sprint-397 fixtures', () => {
  it('task-007 (T7-ELOOP): the typo test-path is self-consistently declared in its own filesWrite', () => {
    // Ground truth (.analysis/prompt-contract-verification-2026-07-10.md §1):
    // 397-007's real on-disk scope.filesWrite ALSO carried the typo'd
    // "tests/cli/error-handling-unification.test.ts" — the same string the Kanıt
    // line references. Faithfully extracted, that means the mention is
    // self-declared writable: this module catches inconsistency between text and
    // scope, not a semantic "is this the RIGHT path" typo (that needs fuzzy/
    // did-you-mean matching, out of scope for this pure syntactic lint — see
    // SAN-2 in the cross-reference analysis for that follow-up). Zero findings
    // here is the correct, honest output, not a gap in this fixture's coverage —
    // rules 1/2 are independently proven above and via the 011/012 fixtures below.
    const input = loadFixture('task-007.json');
    expect(lintScopeSatisfiability(input)).toEqual([]);
  });

  it('task-011 (T11-DOCS-SAYILAR): catches the unlisted scripts/validate-publish.mjs rewrite', () => {
    const input = loadFixture('task-011.json');
    const findings = findingsOf('MENTIONED_NOT_WRITABLE', lintScopeSatisfiability(input));
    expect(findings).toEqual([
      expect.objectContaining({ severity: 'WARN', path: 'scripts/validate-publish.mjs' }),
    ]);
  });

  it('task-011 (T11-DOCS-SAYILAR): catches ci-baseline-detect.test declared unchanged ∩ filesWrite', () => {
    const input = loadFixture('task-011.json');
    const findings = findingsOf('UNCHANGED_IN_WRITE', lintScopeSatisfiability(input));
    expect(findings).toEqual([
      expect.objectContaining({ severity: 'WARN', path: 'tests/scripts/ci-baseline-detect.test.ts' }),
    ]);
  });

  it('task-011: README.md itself is correctly NOT flagged (it is legitimately in filesWrite)', () => {
    const input = loadFixture('task-011.json');
    const findings = lintScopeSatisfiability(input);
    expect(findings.some(f => f.path === 'README.md')).toBe(false);
  });

  it('task-012 (T12-BASELINES): tracked run-targets inside backticked commands are EXEMPT from 1a', () => {
    // sprint-399 wiring fix: both script paths appear ONLY inside "`node …`" proof
    // commands and are tracked — they are run-targets governed by rule 2, not write
    // requirements. Pre-fix these produced 2 false-positive BLOCKs that would have
    // blocked the real (legitimate) 397-012 plan at the wired gate.
    const input = loadFixture('task-012.json');
    const findings = findingsOf('MENTIONED_NOT_WRITABLE', lintScopeSatisfiability(input));
    expect(findings).toEqual([]);
  });

  it('397-007 window: tracked run-target whose sentence implies CHANGING it → WARN', () => {
    // Advisor (sprint-399 BEFORE-done): "`npx vitest run X` yeni case ekle" — the task
    // must extend a file it cannot write; pure run-only proofs stay silent, but a
    // positive change-verb in the same sentence surfaces a WARN.
    const input = loadFixture('task-012.json');
    const changed = {
      ...input,
      goCriteria: '`npx vitest run scripts/lint-no-spawnsync.mjs` koşusuna yeni case ekle ve yeşil kalsın.',
    };
    const findings = lintScopeSatisfiability(changed);
    expect(findings.some(
      f => f.code === 'MENTIONED_NOT_WRITABLE' && f.severity === 'WARN' && f.path === 'scripts/lint-no-spawnsync.mjs',
    )).toBe(true);
  });

  it('an UNTRACKED path inside a backticked run command still blocks (via rule 2, not 1a)', () => {
    const input = loadFixture('task-012.json');
    const tampered = {
      ...input,
      goCriteria: input.goCriteria + ' ve `node scripts/does-not-exist.mjs` EXIT 0',
      proofCommands: [...(input.proofCommands ?? []), 'node scripts/does-not-exist.mjs'],
    };
    const findings = lintScopeSatisfiability(tampered);
    expect(findings.some(
      f => f.code === 'PROOF_PATH_MISSING' && f.path === 'scripts/does-not-exist.mjs' && f.severity === 'BLOCK',
    )).toBe(true);
  });

  it('task-012: .secrets-baseline (legitimately in filesWrite) produces no finding', () => {
    const input = loadFixture('task-012.json');
    const findings = lintScopeSatisfiability(input);
    expect(findings.some(f => f.path === '.secrets-baseline')).toBe(false);
  });
});

// ─── Dot-directory mention parity (sprint-443 plan-gate live case) ─────
// PRIMARY_PATH_RE used to tokenize ".analysis/u4-olcum/notes.md" WITHOUT its
// leading dot ("analysis/…"), so the mention could never equal the real
// filesWrite entry and rule 1 fired a false MENTIONED_NOT_WRITABLE BLOCK on
// the U4 sprint's own DIRECTIVES. The dot now survives tokenization.

describe('lintScopeSatisfiability — leading-dot path mentions', () => {
  it('a goCriteria mention of a .analysis/ path in filesWrite produces no finding', () => {
    const input = base({
      goCriteria: 'sync finding documented in .analysis/u4-olcum/integration-notes.md; tests green.',
      filesWrite: ['.analysis/u4-olcum/integration-notes.md'],
    });
    expect(findingsOf('MENTIONED_NOT_WRITABLE', lintScopeSatisfiability(input))).toEqual([]);
  });

  it('a .deckent/ mention outside write authority still BLOCKs (with its dot intact)', () => {
    const input = base({
      goCriteria: 'write the flag into .deckent/config-extra.json and keep it stable.',
      filesWrite: ['src/core/config.ts'],
    });
    const found = findingsOf('MENTIONED_NOT_WRITABLE', lintScopeSatisfiability(input));
    expect(found).toEqual([
      expect.objectContaining({ severity: 'BLOCK', path: '.deckent/config-extra.json' }),
    ]);
  });

  it('the greedy-shorthand class stays dead: "agents.md/cli.md" never tokenizes as one path', () => {
    const input = base({
      goCriteria: 'update the agents.md/cli.md reference pages under docs/reference/.',
      filesWrite: ['docs/reference/agents.md', 'docs/reference/cli.md'],
    });
    const found = findingsOf('MENTIONED_NOT_WRITABLE', lintScopeSatisfiability(input));
    expect(found.map(f => f.path)).not.toContain('.md/cli.md');
    expect(found.map(f => f.path)).not.toContain('agents.md/cli.md');
  });
});

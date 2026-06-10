import { describe, it, expect } from 'vitest';
import {
  buildRefutePrompt,
  parseRefuteVerdict,
  type RefutePromptTask,
  type RefutePromptResult,
  type RefuteVerdict,
} from '../../src/core/cross-verify-prompt.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const baseTask: RefutePromptTask = {
  title: 'Harden JWT authentication flow',
  description: 'Add CSRF protection and validate JWT signatures before accepting requests.',
  goNogo: {
    goCriteria: 'CSRF token is validated; JWT signature verified; tests pass',
    noGoCriteria: 'Any auth bypass possible; tests skipped; no signature check',
    techDebtAcceptable: 'minor refactoring deferred',
  },
};

const baseResult: RefutePromptResult = {
  taskId: '276-004',
  filesChanged: ['src/auth/middleware.ts', 'tests/auth/middleware.test.ts'],
  selfAssessment: 'DONE',
  notes: 'Added CSRF middleware and JWT verify call. All tests green.',
};

// ─── buildRefutePrompt ───────────────────────────────────────────────────────

describe('cross-verify-prompt · buildRefutePrompt', () => {
  it('includes adversarial framing — instructs verifier to REFUTE not confirm', () => {
    const prompt = buildRefutePrompt(baseTask, baseResult);
    expect(prompt).toMatch(/REFUTE/);
    expect(prompt).toMatch(/adversarial/i);
    expect(prompt).toMatch(/skepticism|not to confirm|do NOT take/i);
  });

  it('injects the task goCriteria into the prompt', () => {
    const prompt = buildRefutePrompt(baseTask, baseResult);
    expect(prompt).toContain(baseTask.goNogo.goCriteria);
  });

  it('injects the task noGoCriteria into the prompt', () => {
    const prompt = buildRefutePrompt(baseTask, baseResult);
    expect(prompt).toContain(baseTask.goNogo.noGoCriteria);
  });

  it('injects files changed from the result', () => {
    const prompt = buildRefutePrompt(baseTask, baseResult);
    expect(prompt).toContain('src/auth/middleware.ts');
    expect(prompt).toContain('tests/auth/middleware.test.ts');
  });

  it('includes the task title and description', () => {
    const prompt = buildRefutePrompt(baseTask, baseResult);
    expect(prompt).toContain(baseTask.title!);
    expect(prompt).toContain('CSRF protection');
  });

  it('includes the mandatory VERDICT format instruction', () => {
    const prompt = buildRefutePrompt(baseTask, baseResult);
    expect(prompt).toMatch(/VERDICT:\s*REFUTED/);
    expect(prompt).toMatch(/VERDICT:\s*CONFIRMED/);
  });

  it('labels the verifier provider when opts.verifier is provided', () => {
    const prompt = buildRefutePrompt(baseTask, baseResult, { verifier: 'codex' });
    expect(prompt).toContain('verifier: codex');
  });

  it('handles a task with no title or description gracefully', () => {
    const minimal: RefutePromptTask = {
      goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: 't' },
    };
    const result: RefutePromptResult = {};
    const prompt = buildRefutePrompt(minimal, result);
    expect(prompt).toContain('(untitled)');
    expect(prompt).toContain('(no description)');
    expect(prompt).toContain('(none reported)'); // filesChanged
  });

  it('handles an empty filesChanged array with a readable placeholder', () => {
    const result: RefutePromptResult = { ...baseResult, filesChanged: [] };
    const prompt = buildRefutePrompt(baseTask, result);
    expect(prompt).toContain('(none reported)');
  });
});

// ─── parseRefuteVerdict ──────────────────────────────────────────────────────

describe('cross-verify-prompt · parseRefuteVerdict', () => {
  it('parses a REFUTED verdict (standard form)', () => {
    const result: RefuteVerdict = parseRefuteVerdict(
      'I examined the diff carefully.\nVERDICT: REFUTED JWT signature check is missing in edge case',
    );
    expect(result.verdict).toBe('refuted');
    expect(result.reason).toContain('JWT signature check is missing');
  });

  it('parses a CONFIRMED verdict (standard form)', () => {
    const result: RefuteVerdict = parseRefuteVerdict(
      'All criteria verified on disk.\nVERDICT: CONFIRMED CSRF token validated; tests cover the happy path and the bypass case',
    );
    expect(result.verdict).toBe('confirmed');
    expect(result.reason).toContain('CSRF token validated');
  });

  it('is case-insensitive for the VERDICT keyword and status', () => {
    const lower = parseRefuteVerdict('verdict: refuted some bug found');
    expect(lower.verdict).toBe('refuted');

    const mixed = parseRefuteVerdict('Verdict: Confirmed all checks passed');
    expect(mixed.verdict).toBe('confirmed');
  });

  it('returns unclear when no VERDICT line is present', () => {
    const result = parseRefuteVerdict('The code looks fine to me. No issues spotted.');
    expect(result.verdict).toBe('unclear');
    expect(result.reason).toMatch(/no VERDICT line/i);
  });

  it('returns unclear for empty output', () => {
    const result = parseRefuteVerdict('');
    expect(result.verdict).toBe('unclear');
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it('returns unclear for whitespace-only output', () => {
    const result = parseRefuteVerdict('   \n\t  ');
    expect(result.verdict).toBe('unclear');
  });

  it('extracts the reason text after the status word correctly', () => {
    const result = parseRefuteVerdict(
      'VERDICT: REFUTED missing null-check on line 42 of middleware.ts',
    );
    expect(result.reason).toBe('missing null-check on line 42 of middleware.ts');
  });

  it('includes a truncated output excerpt in unclear reason for debugging', () => {
    const result = parseRefuteVerdict('No verdict here, just some prose output from the model.');
    expect(result.verdict).toBe('unclear');
    expect(result.reason).toContain('output excerpt');
  });
});

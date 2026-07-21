import { describe, it, expect } from 'vitest';
import {
  buildRefutePrompt,
  CROSS_VERIFY_PROMPT_MAX_CHARS,
  parseRefuteVerdict,
  type RefutePromptTask,
  type RefutePromptResult,
  type RefuteVerdict,
} from '../../src/core/cross-verify-prompt.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const baseTask: RefutePromptTask = {
  title: 'Harden JWT authentication flow',
  description: 'Add CSRF protection and validate JWT signatures before accepting requests.',
  scope: {
    filesRead: ['src/auth/middleware.ts', 'tests/auth/middleware.test.ts'],
  },
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
    expect(prompt).toMatch(/VERDICT:\s*UNCLEAR/);
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
    const prompt = buildRefutePrompt({ ...baseTask, scope: { filesRead: [] } }, result);
    expect(prompt).toContain('(none reported)');
  });

  it('uses exact authored read files, dedupes them, and excludes self-reported extras', () => {
    const task: RefutePromptTask = {
      ...baseTask,
      scope: { filesRead: ['src/auth/middleware.ts', ' src/auth/middleware.ts '] },
    };
    const prompt = buildRefutePrompt(task, {
      ...baseResult,
      filesChanged: ['src/outside-authority.ts'],
    });

    expect(prompt.match(/src\/auth\/middleware\.ts/g)).toHaveLength(1);
    expect(prompt).not.toContain('src/outside-authority.ts');
  });

  it('renders a finite criteria-only protocol without repository-wide or repeated verification triggers', () => {
    const prompt = buildRefutePrompt(baseTask, baseResult);

    expect(prompt).toContain('Judge ONLY the written GO/NO-GO criteria');
    expect(prompt).toContain('ONE batched read-only evidence pass');
    expect(prompt).toContain('at most ONE additional targeted verification command');
    expect(prompt).toContain('After a VERDICT line, perform no');
    expect(prompt).toContain('Do not use a full-file Read tool');
    expect(prompt).not.toContain('Probe for hidden failures');
    expect(prompt).not.toContain('Security vulnerabilities');
  });

  it('dedupes repeated claim text and stays deterministic under the hard prompt ceiling', () => {
    const repeated = 'same evidence '.repeat(5_000);
    const task: RefutePromptTask = {
      ...baseTask,
      description: repeated,
      scope: { filesRead: Array.from({ length: 80 }, (_, i) => `src/repeated-${i}.ts`) },
      goNogo: {
        ...baseTask.goNogo,
        goCriteria: repeated,
        noGoCriteria: repeated,
      },
    };
    const result: RefutePromptResult = { ...baseResult, notes: repeated };

    const first = buildRefutePrompt(task, result);
    const second = buildRefutePrompt(task, result);
    expect(first).toBe(second);
    expect(first.length).toBeLessThanOrEqual(CROSS_VERIFY_PROMPT_MAX_CHARS);
    expect(first).toContain('HOST-TRUNCATED');
    expect(first).toContain('(same as task description or none)');
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

  it('parses an explicit UNCLEAR verdict as a terminal honest result', () => {
    const result = parseRefuteVerdict(
      'Bounded evidence did not contain the required receipt.\nVERDICT: UNCLEAR receipt evidence was not in scope',
    );
    expect(result.verdict).toBe('unclear');
    expect(result.reason).toBe('receipt evidence was not in scope');
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

  it('requires the verdict to be the last non-empty line', () => {
    const result = parseRefuteVerdict(
      'VERDICT: CONFIRMED evidence looked good\nI kept working after the verdict.',
    );
    expect(result.verdict).toBe('unclear');
    expect(result.reason).toMatch(/no VERDICT line/i);
  });
});

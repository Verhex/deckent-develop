import { describe, it, expect } from 'vitest';
import {
  deriveBaseCriteria,
  isNonBuildKind,
  cleanProofLine,
} from '../../src/core/criteria-deriver.js';

// ─── deriveBaseCriteria — test phrasing (Sprint 273 T-009) ──────────────────

describe('deriveBaseCriteria — code kind', () => {
  it('uses "targeted test file(s)" phrase when test command given but no testFiles', () => {
    const result = deriveBaseCriteria('code-development', 'typescript', {
      build: 'npx tsc',
      test: 'npx vitest run',
    });
    // Must NOT say `npx vitest run` passes (full suite implication)
    expect(result.goCriteria).not.toContain('`npx vitest run` passes');
    expect(result.goCriteria).toContain('targeted test file(s)');
    expect(result.goCriteria).toContain('`npx tsc` succeeds');
  });

  it('uses specific test file command when testFiles are provided', () => {
    const result = deriveBaseCriteria('code-development', 'typescript', {
      build: 'npx tsc',
      test: 'npx vitest run',
      testFiles: ['tests/core/criteria-deriver.test.ts'],
    });
    expect(result.goCriteria).toContain('`npx vitest run tests/core/criteria-deriver.test.ts` passes');
    expect(result.goCriteria).not.toContain('targeted test file(s)');
  });

  it('joins multiple testFiles with spaces in the command', () => {
    const result = deriveBaseCriteria('code-development', 'typescript', {
      test: 'npx vitest run',
      testFiles: ['tests/core/foo.test.ts', 'tests/core/bar.test.ts'],
    });
    expect(result.goCriteria).toContain(
      '`npx vitest run tests/core/foo.test.ts tests/core/bar.test.ts` passes',
    );
  });

  it('preserves build phrase when no testFiles', () => {
    const result = deriveBaseCriteria('code-development', 'typescript', {
      build: 'npx tsc',
      test: 'npx vitest run',
    });
    expect(result.goCriteria.startsWith('`npx tsc` succeeds')).toBe(true);
  });

  it('falls back to stack-neutral phrase when no commands at all', () => {
    const result = deriveBaseCriteria('code-development', 'typescript');
    expect(result.goCriteria).toContain('typescript stack');
  });

  it('uses generic phrase for generic stack with no commands', () => {
    const result = deriveBaseCriteria('code-development', 'generic');
    expect(result.goCriteria).toBe('Build succeeds; tests pass');
  });
});

// ─── deriveBaseCriteria — typecheck preference chain (Sprint 399 T-002) ─────
// STACK_COMMANDS.typescript.build = 'npx tsc' has no --noEmit + tsconfig has no noEmit/outDir
// guard, so a bare "`npx tsc` succeeds" goCriteria line instructs a dist-emit mid-sprint
// (ESM-cache hazard). When a dedicated `typecheck` command is supplied it must REPLACE the
// build proof line, never accompany it.

describe('deriveBaseCriteria — typecheck preference', () => {
  it('uses typecheck command instead of build when both are provided', () => {
    const result = deriveBaseCriteria('code-development', 'typescript', {
      build: 'npx tsc',
      typecheck: 'npx tsc --noEmit',
      test: 'npx vitest run',
    });
    expect(result.goCriteria).toContain('`npx tsc --noEmit` passes');
    expect(result.goCriteria).not.toContain('`npx tsc` succeeds');
  });

  it('falls back to build succeeds when typecheck is absent', () => {
    const result = deriveBaseCriteria('code-development', 'go', {
      build: 'go build ./...',
      test: 'go test ./...',
    });
    expect(result.goCriteria).toContain('`go build ./...` succeeds');
  });

  it('falls back to build succeeds when typecheck is an empty string (honest-empty stack)', () => {
    const result = deriveBaseCriteria('code-development', 'python', {
      build: '',
      typecheck: '',
      test: 'pytest',
    });
    expect(result.goCriteria).not.toContain('passes');
    expect(result.goCriteria).toContain('targeted test file(s)');
  });

  it('uses typecheck alone when build is absent', () => {
    const result = deriveBaseCriteria('code-development', 'rust', {
      typecheck: 'cargo check',
      test: 'cargo test',
    });
    expect(result.goCriteria).toContain('`cargo check` passes');
  });
});

// ─── deriveBaseCriteria — non-build kinds not affected ──────────────────────

describe('deriveBaseCriteria — non-build kinds', () => {
  it('documentation kind ignores test commands entirely', () => {
    const result = deriveBaseCriteria('documentation', 'typescript', {
      build: 'npx tsc',
      test: 'npx vitest run',
    });
    expect(result.goCriteria).toBe('Target file(s) written to disk with the required content');
    expect(result.goCriteria).not.toContain('vitest');
    expect(result.goCriteria).not.toContain('tsc');
  });

  it('audit kind produces findings-based criteria', () => {
    const result = deriveBaseCriteria('audit', 'typescript');
    expect(result.goCriteria).toContain('evidence');
  });
});

// ─── isNonBuildKind ──────────────────────────────────────────────────────────

describe('isNonBuildKind', () => {
  it('returns true for non-build kinds', () => {
    expect(isNonBuildKind('documentation')).toBe(true);
    expect(isNonBuildKind('audit')).toBe(true);
    expect(isNonBuildKind('data')).toBe(true);
  });

  it('returns false for code kinds', () => {
    expect(isNonBuildKind('code-development')).toBe(false);
    expect(isNonBuildKind('refactor')).toBe(false);
  });
});

// ─── cleanProofLine — Sprint 273 T-009 Kanıt artifact fix ───────────────────

describe('cleanProofLine', () => {
  it('strips well-formed **Kanıt:** prefix', () => {
    const result = cleanProofLine('**Kanıt:** `npx vitest run tests/core/foo.test.ts` yeşil');
    expect(result).toBe('`npx vitest run tests/core/foo.test.ts` yeşil');
  });

  it('strips asymmetric *Kanıt:** prefix (single leading star — the artifact)', () => {
    const result = cleanProofLine('*Kanıt:** `npx vitest run tests/core/foo.test.ts` yeşil');
    expect(result).toBe('`npx vitest run tests/core/foo.test.ts` yeşil');
    // Must not leave `*Kanıt:**` in the output
    expect(result).not.toContain('Kanıt');
  });

  it('strips list-marker + bold prefix: - **Proof:** content', () => {
    const result = cleanProofLine('- **Proof:** some verification command');
    expect(result).toBe('some verification command');
  });

  it('strips list marker without bold: - `grep foo`', () => {
    const result = cleanProofLine('- `grep foo src/bar.ts`');
    expect(result).toBe('`grep foo src/bar.ts`');
  });

  it('leaves plain content unchanged', () => {
    const result = cleanProofLine('`npx vitest run` passes');
    expect(result).toBe('`npx vitest run` passes');
  });

  it('strips **Verify:** prefix', () => {
    const result = cleanProofLine('**Verify:** the output matches');
    expect(result).toBe('the output matches');
  });

  it('trims surrounding whitespace', () => {
    const result = cleanProofLine('  **Kanıt:**  some content  ');
    expect(result).toBe('some content  ');
  });
});

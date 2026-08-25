/**
 * Scoped typecheck authority — cross-contamination regression (row 3277).
 *
 * Measured defect (sprint-487): a worker ran a repository-wide `tsc --noEmit`
 * while parallel writers were mid-change. Another task's partial source produced
 * a false NO_GO and consumed FIX retries; a supervisor rerun after quiescence
 * passed. The timing-dependent global judgment is the defect.
 *
 * Mechanism under test: the compile stays whole-program (so the analysis set is a
 * superset of the task scope and no in-scope error can be hidden), but the verdict
 * is restricted to diagnostics located inside the task's own write authority.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  verifyCompilation,
  runCompilationLoop,
  scopeAuthorityPaths,
  compilationErrorFilePath,
  partitionCompilationErrors,
} from '../../src/agents/worker-verify.js';
import type { TaskScope } from '../../src/core/types.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn((filePath: unknown) => {
    if (typeof filePath === 'string' && filePath.endsWith('package.json')) {
      return JSON.stringify({ devDependencies: { vitest: '^1.0.0', typescript: '^5.0.0' } });
    }
    return '';
  }),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  openSync: vi.fn(() => 42),
  closeSync: vi.fn(),
  renameSync: vi.fn(),
  fsyncSync: vi.fn(),
  constants: { O_WRONLY: 1, O_CREAT: 64, O_EXCL: 128 },
}));

import { execSync } from 'node:child_process';
const mockedExecSync = vi.mocked(execSync);

/** Task A's scope — the only files this worker may write. */
const TASK_A_SCOPE: TaskScope = {
  directories: ['src/agents/'],
  filesRead: ['src/agents/'],
  filesWrite: ['src/agents/worker-verify.ts'],
};

const FOREIGN_ERROR =
  `src/orchestra/planner.ts(42,7): error TS2322: Type 'string' is not assignable to type 'number'.`;
const IN_SCOPE_ERROR =
  `src/agents/worker-verify.ts(10,5): error TS2345: Argument of type 'string' is not assignable.`;

function tscFails(stdout: string): void {
  mockedExecSync.mockImplementation(() => {
    throw Object.assign(new Error('Command failed'), { stdout, stderr: '', status: 1 });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Cross-contamination regression ─────────────────────────────────

describe('scoped typecheck authority — cross-contamination', () => {
  it('stays green when an unrelated concurrent file holds the only type error', () => {
    tscFails(FOREIGN_ERROR);

    const result = verifyCompilation('/project', TASK_A_SCOPE);

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.foreignErrors).toEqual([FOREIGN_ERROR]);
  });

  it('still fails when the error is inside the task own scope', () => {
    tscFails(IN_SCOPE_ERROR);

    const result = verifyCompilation('/project', TASK_A_SCOPE);

    expect(result.success).toBe(false);
    expect(result.errors).toEqual([IN_SCOPE_ERROR]);
    expect(result.foreignErrors).toEqual([]);
  });

  it('fails on the in-scope error while ignoring a concurrent foreign one', () => {
    tscFails(`${FOREIGN_ERROR}\n${IN_SCOPE_ERROR}`);

    const result = verifyCompilation('/project', TASK_A_SCOPE);

    expect(result.success).toBe(false);
    expect(result.errors).toEqual([IN_SCOPE_ERROR]);
    expect(result.foreignErrors).toEqual([FOREIGN_ERROR]);
  });

  it('keeps the compile whole-program so in-scope errors cannot be hidden', () => {
    mockedExecSync.mockReturnValue('' as never);

    verifyCompilation('/project', TASK_A_SCOPE);

    expect(mockedExecSync).toHaveBeenCalledWith('npx tsc --noEmit', {
      cwd: '/project',
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120_000,
    });
  });

  it('attributes an error in a sibling file of the same scope directory as in-scope', () => {
    const siblingError = `src/agents/worker.ts(3,1): error TS2304: Cannot find name 'foo'.`;
    tscFails(siblingError);

    const result = verifyCompilation('/project', TASK_A_SCOPE);

    expect(result.success).toBe(false);
    expect(result.errors).toEqual([siblingError]);
  });

  it('judges every diagnostic when the scope declares no write authority', () => {
    tscFails(FOREIGN_ERROR);

    const result = verifyCompilation('/project');

    expect(result.success).toBe(false);
    expect(result.errors).toEqual([FOREIGN_ERROR]);
    expect(result.foreignErrors).toEqual([]);
  });

  it('treats a diagnostic with no file location as in-scope', () => {
    const locationless = `error TS5083: Cannot read file 'tsconfig.json'.`;
    tscFails(locationless);

    const result = verifyCompilation('/project', TASK_A_SCOPE);

    expect(result.success).toBe(false);
    expect(result.errors).toEqual([locationless]);
  });
});

// ─── Retry budget is not spent on foreign errors ────────────────────

describe('runCompilationLoop scope authority', () => {
  it('does not consume FIX retries on a concurrent foreign error', () => {
    tscFails(FOREIGN_ERROR);
    const onAttempt = vi.fn();

    const result = runCompilationLoop('/project', 'w-A', 't-A', 3, onAttempt, TASK_A_SCOPE);

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.errors).toEqual([]);
    expect(result.foreignErrors).toEqual([FOREIGN_ERROR]);
    expect(onAttempt).not.toHaveBeenCalled();
    expect(mockedExecSync).toHaveBeenCalledTimes(1);
  });

  it('still exhausts retries when the error is inside the task scope', () => {
    tscFails(IN_SCOPE_ERROR);
    const onAttempt = vi.fn();

    const result = runCompilationLoop('/project', 'w-A', 't-A', 3, onAttempt, TASK_A_SCOPE);

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(3);
    expect(result.errors).toEqual([IN_SCOPE_ERROR]);
    expect(onAttempt).toHaveBeenCalledTimes(3);
  });
});

// ─── Attribution primitives ─────────────────────────────────────────

describe('compilationErrorFilePath', () => {
  it('reads the piped tsc diagnostic format', () => {
    expect(compilationErrorFilePath(IN_SCOPE_ERROR)).toBe('src/agents/worker-verify.ts');
  });

  it('reads the pretty tsc diagnostic format', () => {
    const pretty = `src/agents/worker.ts:12:3 - error TS2322: Type mismatch.`;
    expect(compilationErrorFilePath(pretty)).toBe('src/agents/worker.ts');
  });

  it('normalises Windows separators', () => {
    const win = `src\\agents\\worker.ts(1,1): error TS2304: Cannot find name 'x'.`;
    expect(compilationErrorFilePath(win)).toBe('src/agents/worker.ts');
  });

  it('returns null for a line carrying no file location', () => {
    expect(compilationErrorFilePath('Found 3 errors.')).toBeNull();
    expect(compilationErrorFilePath(`error TS5083: Cannot read file.`)).toBeNull();
  });
});

describe('scopeAuthorityPaths', () => {
  it('unions filesWrite and directories, normalised and deduplicated', () => {
    const scope: TaskScope = {
      directories: ['./src/agents/', 'src/agents'],
      filesRead: [],
      filesWrite: ['src/agents/worker-verify.ts', ''],
    };
    expect(scopeAuthorityPaths(scope)).toEqual(['src/agents/worker-verify.ts', 'src/agents']);
  });

  it('returns an empty authority set for an undefined scope', () => {
    expect(scopeAuthorityPaths(undefined)).toEqual([]);
  });
});

describe('partitionCompilationErrors', () => {
  it('strips the project root from an absolute diagnostic path before matching', () => {
    const absolute = `/project/src/agents/worker-verify.ts(4,4): error TS2322: Type mismatch.`;
    const { inScope, foreign } = partitionCompilationErrors([absolute], TASK_A_SCOPE, '/project');

    expect(inScope).toEqual([absolute]);
    expect(foreign).toEqual([]);
  });

  it('does not treat a path prefix collision as in-scope', () => {
    const lookalike = `src/agents-legacy/worker.ts(1,1): error TS2304: Cannot find name 'x'.`;
    const { inScope, foreign } = partitionCompilationErrors([lookalike], TASK_A_SCOPE);

    expect(inScope).toEqual([]);
    expect(foreign).toEqual([lookalike]);
  });
});

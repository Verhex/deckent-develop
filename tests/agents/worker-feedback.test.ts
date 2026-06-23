import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseVitestFailedTests,
  verifyTests,
  runTestVerifyLoop,
  MAX_TEST_RETRIES,
  createFeedbackLoop,
  recordTscAttempt,
  recordTestAttempt,
  calculateSelfHealingRate,
  aggregateFeedbackLoops,
  verifyCompilation,
  parseCompilationErrors,
  runCompilationLoop,
  MAX_COMPILATION_RETRIES,
  calculateProgress,
} from '../../src/agents/worker.js';
import type { CompilationResult, CompilationLoopResult } from '../../src/agents/worker.js';
import type { TaskResult, FeedbackLoop } from '../../src/core/types.js';
import { AgentStatus } from '../../src/core/types.js';

// Mock child_process for verifyTests
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

// Mock node:fs (required by worker.ts imports)
vi.mock('node:fs', () => ({
  readFileSync: vi.fn((filePath: unknown) => {
    // Return a TypeScript/vitest package.json so stack detector can identify
    // the project as TypeScript and provide 'npx vitest run' as test command
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
  constants: { O_WRONLY: 1, O_CREAT: 64, O_EXCL: 128 },
}));

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
const mockedExecSync = vi.mocked(execSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── parseVitestFailedTests ──────────────────────────────────────────────

describe('parseVitestFailedTests', () => {
  it('should return empty arrays for passing test output', () => {
    const output = `
 ✓ tests/core/utils.test.ts (5)
 ✓ tests/agents/worker.test.ts (12)

 Tests  17 passed (17)
 Duration  2.34s
`;
    const result = parseVitestFailedTests(output);
    expect(result.failedTests).toEqual([]);
    expect(result.summary).toContain('passed');
  });

  it('should extract FAIL file-level markers', () => {
    const output = `
 FAIL  tests/agents/worker.test.ts
 ✓ tests/core/utils.test.ts (5)

 Tests  3 failed | 12 passed (15)
`;
    const result = parseVitestFailedTests(output);
    expect(result.failedTests).toContain('tests/agents/worker.test.ts');
  });

  it('should extract FAIL lines with test names', () => {
    const output = `
 FAIL tests/foo.test.ts > describe > should work
 FAIL tests/bar.test.ts > other test

 Tests  2 failed | 5 passed (7)
`;
    const result = parseVitestFailedTests(output);
    expect(result.failedTests).toContain('tests/foo.test.ts > describe > should work');
    expect(result.failedTests).toContain('tests/bar.test.ts > other test');
  });

  it('should extract × (cross mark) failure lines', () => {
    const output = `
 × should calculate correctly
 × should handle edge case

 Tests  2 failed (2)
`;
    const result = parseVitestFailedTests(output);
    expect(result.failedTests).toContain('should calculate correctly');
    expect(result.failedTests).toContain('should handle edge case');
  });

  it('should extract ✕ failure lines', () => {
    const output = `
 ✕ should validate input

 Tests  1 failed (1)
`;
    const result = parseVitestFailedTests(output);
    expect(result.failedTests).toContain('should validate input');
  });

  it('should deduplicate test names', () => {
    const output = `
 FAIL tests/foo.test.ts > should work
 FAIL tests/foo.test.ts > should work

 Tests  1 failed (1)
`;
    const result = parseVitestFailedTests(output);
    const count = result.failedTests.filter(t => t.includes('should work')).length;
    expect(count).toBe(1);
  });

  it('should extract summary line', () => {
    const output = `
 Tests  3 failed | 12 passed (15)
 Duration  1.23s
`;
    const result = parseVitestFailedTests(output);
    expect(result.summary).toBe('Tests  3 failed | 12 passed (15)');
  });

  it('should return empty summary when no summary line present', () => {
    const output = 'Error: Cannot find module';
    const result = parseVitestFailedTests(output);
    expect(result.summary).toBe('');
  });

  it('should handle empty output', () => {
    const result = parseVitestFailedTests('');
    expect(result.failedTests).toEqual([]);
    expect(result.summary).toBe('');
  });

  it('should handle output with only FAIL file markers and no test-level failures', () => {
    const output = `
 FAIL  tests/core/config.test.ts

 Tests  1 failed | 20 passed (21)
`;
    const result = parseVitestFailedTests(output);
    expect(result.failedTests).toHaveLength(1);
    expect(result.failedTests[0]).toBe('tests/core/config.test.ts');
  });

  it('should handle mixed FAIL markers and × failures', () => {
    const output = `
 FAIL  tests/agents/worker.test.ts
 × should claim task correctly
 ✓ should read task

 Tests  1 failed | 1 passed (2)
`;
    const result = parseVitestFailedTests(output);
    expect(result.failedTests.length).toBeGreaterThanOrEqual(1);
    expect(result.failedTests).toContain('should claim task correctly');
  });
});

// ─── verifyTests ────────────────────────────────────────────────────

describe('verifyTests', () => {
  it('should return success when vitest passes', () => {
    mockedExecSync.mockReturnValue('Tests  5 passed (5)\n');
    const result = verifyTests('/project');
    expect(result.success).toBe(true);
    expect(result.failedTests).toEqual([]);
    expect(result.output).toContain('passed');
  });

  it('should call execSync with correct command', () => {
    mockedExecSync.mockReturnValue('');
    verifyTests('/project');
    expect(mockedExecSync).toHaveBeenCalledWith(
      'npx vitest run --reporter=verbose',
      expect.objectContaining({
        cwd: '/project',
        encoding: 'utf-8',
      }),
    );
  });

  it('should include scope directories in command', () => {
    mockedExecSync.mockReturnValue('');
    verifyTests('/project', ['tests/agents/', 'tests/core/']);
    expect(mockedExecSync).toHaveBeenCalledWith(
      'npx vitest run --reporter=verbose tests/agents/ tests/core/',
      expect.anything(),
    );
  });

  it('should return failure when vitest throws (test failures)', () => {
    const error = new Error('vitest failed') as Error & { stdout: string; stderr: string };
    error.stdout = `
 FAIL tests/foo.test.ts > should work

 Tests  1 failed | 2 passed (3)
`;
    error.stderr = '';
    mockedExecSync.mockImplementation(() => { throw error; });

    const result = verifyTests('/project');
    expect(result.success).toBe(false);
    expect(result.failedTests.length).toBeGreaterThan(0);
  });

  it('should extract failed test names from error output', () => {
    const error = new Error('vitest failed') as Error & { stdout: string };
    error.stdout = `
 FAIL tests/agents/worker.test.ts > claimTask > should reject claimed task
 FAIL tests/core/utils.test.ts > formatDate > should format ISO

 Tests  2 failed | 10 passed (12)
`;
    mockedExecSync.mockImplementation(() => { throw error; });

    const result = verifyTests('/project');
    expect(result.failedTests).toContain('tests/agents/worker.test.ts > claimTask > should reject claimed task');
    expect(result.failedTests).toContain('tests/core/utils.test.ts > formatDate > should format ISO');
  });

  it('should handle error with only stderr', () => {
    const error = new Error('crash') as Error & { stderr: string };
    error.stderr = 'Error: Cannot resolve module vitest';
    mockedExecSync.mockImplementation(() => { throw error; });

    const result = verifyTests('/project');
    expect(result.success).toBe(false);
    expect(result.output).toContain('Cannot resolve module');
  });

  it('should handle error with no stdout/stderr', () => {
    const error = new Error('unknown error');
    mockedExecSync.mockImplementation(() => { throw error; });

    const result = verifyTests('/project');
    expect(result.success).toBe(false);
    expect(result.output).toContain('unknown error');
  });

  it('should pass empty scope as no scope args', () => {
    mockedExecSync.mockReturnValue('');
    verifyTests('/project', []);
    expect(mockedExecSync).toHaveBeenCalledWith(
      'npx vitest run --reporter=verbose',
      expect.anything(),
    );
  });

  it('should set timeout to 120 seconds', () => {
    mockedExecSync.mockReturnValue('');
    verifyTests('/project');
    expect(mockedExecSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        timeout: 120_000,
      }),
    );
  });

  it('should handle non-Error thrown values', () => {
    mockedExecSync.mockImplementation(() => { throw 'string error'; });
    const result = verifyTests('/project');
    expect(result.success).toBe(false);
    expect(result.output).toBe('string error');
  });
});

// ─── runTestVerifyLoop ──────────────────────────────────────────────

describe('runTestVerifyLoop', () => {
  it('should succeed on first attempt when tests pass', () => {
    mockedExecSync.mockReturnValue('Tests  5 passed (5)\n');
    const { result, attempts, failuresFixed } = runTestVerifyLoop('/project');
    expect(result.success).toBe(true);
    expect(attempts).toBe(1);
    expect(failuresFixed).toBe(0);
  });

  it('should retry on failure and succeed on second attempt', () => {
    const failError = new Error('fail') as Error & { stdout: string };
    failError.stdout = 'FAIL tests/foo.test.ts > bar\n\nTests  1 failed (1)';

    let callCount = 0;
    mockedExecSync.mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw failError;
      return 'Tests  5 passed (5)\n';
    });

    const fixFn = vi.fn();
    const { result, attempts, failuresFixed } = runTestVerifyLoop('/project', undefined, fixFn);
    expect(result.success).toBe(true);
    expect(attempts).toBe(2);
    expect(fixFn).toHaveBeenCalledTimes(1);
    expect(failuresFixed).toBeGreaterThan(0);
  });

  it('should retry up to MAX_TEST_RETRIES times', () => {
    const failError = new Error('fail') as Error & { stdout: string };
    failError.stdout = 'FAIL tests/foo.test.ts > bar\n\nTests  1 failed (1)';
    mockedExecSync.mockImplementation(() => { throw failError; });

    const fixFn = vi.fn();
    const { result, attempts } = runTestVerifyLoop('/project', undefined, fixFn);
    expect(result.success).toBe(false);
    expect(attempts).toBe(MAX_TEST_RETRIES);
  });

  it('should call fix callback with failed test names between retries', () => {
    const failError = new Error('fail') as Error & { stdout: string };
    failError.stdout = 'FAIL tests/agents/worker.test.ts > claim\n\nTests  1 failed (1)';
    mockedExecSync.mockImplementation(() => { throw failError; });

    const fixFn = vi.fn();
    runTestVerifyLoop('/project', undefined, fixFn);
    // Fix called MAX_TEST_RETRIES - 1 times (not after last failure)
    expect(fixFn).toHaveBeenCalledTimes(MAX_TEST_RETRIES - 1);
    expect(fixFn).toHaveBeenCalledWith(
      expect.arrayContaining([expect.stringContaining('worker.test.ts')]),
      expect.any(String),
    );
  });

  it('should not call fix callback after last failed attempt', () => {
    const failError = new Error('fail') as Error & { stdout: string };
    failError.stdout = 'Tests  1 failed (1)';
    mockedExecSync.mockImplementation(() => { throw failError; });

    const fixFn = vi.fn();
    runTestVerifyLoop('/project', undefined, fixFn);
    // MAX_TEST_RETRIES attempts, fix called MAX_TEST_RETRIES - 1 times
    expect(fixFn).toHaveBeenCalledTimes(MAX_TEST_RETRIES - 1);
  });

  it('should work without a fix callback', () => {
    const failError = new Error('fail') as Error & { stdout: string };
    failError.stdout = 'Tests  1 failed (1)';
    mockedExecSync.mockImplementation(() => { throw failError; });

    const { result, attempts } = runTestVerifyLoop('/project');
    expect(result.success).toBe(false);
    expect(attempts).toBe(MAX_TEST_RETRIES);
  });

  it('should pass scope to verifyTests', () => {
    mockedExecSync.mockReturnValue('Tests  5 passed (5)\n');
    runTestVerifyLoop('/project', ['tests/agents/']);
    expect(mockedExecSync).toHaveBeenCalledWith(
      expect.stringContaining('tests/agents/'),
      expect.anything(),
    );
  });

  it('should succeed on third attempt', () => {
    const failError = new Error('fail') as Error & { stdout: string };
    failError.stdout = 'FAIL tests/foo.test.ts > bar\n\nTests  1 failed (1)';

    let callCount = 0;
    mockedExecSync.mockImplementation(() => {
      callCount++;
      if (callCount < 3) throw failError;
      return 'Tests  5 passed (5)\n';
    });

    const fixFn = vi.fn();
    const { result, attempts } = runTestVerifyLoop('/project', undefined, fixFn);
    expect(result.success).toBe(true);
    expect(attempts).toBe(3);
    expect(fixFn).toHaveBeenCalledTimes(2);
  });

  it('should return correct failuresFixed count', () => {
    const failError = new Error('fail') as Error & { stdout: string };
    failError.stdout = 'FAIL tests/a.test.ts > x\nFAIL tests/b.test.ts > y\n\nTests  2 failed (2)';

    let callCount = 0;
    mockedExecSync.mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw failError;
      return 'Tests  5 passed (5)\n';
    });

    const fixFn = vi.fn();
    const { failuresFixed } = runTestVerifyLoop('/project', undefined, fixFn);
    // 4 entries: 2 FAIL lines match both test-name and file-level regexes
    expect(failuresFixed).toBe(4);
  });

  it('should accumulate failuresFixed across retries', () => {
    const failError1 = new Error('fail1') as Error & { stdout: string };
    failError1.stdout = 'FAIL tests/a.test.ts > x\nFAIL tests/b.test.ts > y\n\nTests  2 failed (2)';
    const failError2 = new Error('fail2') as Error & { stdout: string };
    failError2.stdout = 'FAIL tests/c.test.ts > z\n\nTests  1 failed (1)';

    let callCount = 0;
    mockedExecSync.mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw failError1;
      if (callCount === 2) throw failError2;
      return 'Tests  5 passed (5)\n';
    });

    const fixFn = vi.fn();
    const { failuresFixed, attempts } = runTestVerifyLoop('/project', undefined, fixFn);
    expect(attempts).toBe(3);
    // 4 from first attempt (2 FAIL lines × 2 regex matches) + 2 from second attempt
    expect(failuresFixed).toBe(6);
  });

  it('should return last result output when all retries fail', () => {
    const failError = new Error('fail') as Error & { stdout: string };
    failError.stdout = 'FAIL tests/z.test.ts > critical\n\nTests  1 failed (1)';
    mockedExecSync.mockImplementation(() => { throw failError; });

    const { result } = runTestVerifyLoop('/project');
    expect(result.output).toContain('FAIL tests/z.test.ts');
  });
});

// ─── MAX_TEST_RETRIES constant ──────────────────────────────────────

describe('MAX_TEST_RETRIES', () => {
  it('should be 3', () => {
    expect(MAX_TEST_RETRIES).toBe(3);
  });
});

// ─── MAX_COMPILATION_RETRIES constant ────────────────────────────────

describe('MAX_COMPILATION_RETRIES', () => {
  it('is set to 3', () => {
    expect(MAX_COMPILATION_RETRIES).toBe(3);
  });

  it('is a positive integer', () => {
    expect(Number.isInteger(MAX_COMPILATION_RETRIES)).toBe(true);
    expect(MAX_COMPILATION_RETRIES).toBeGreaterThan(0);
  });
});

// ─── parseCompilationErrors ──────────────────────────────────────────

describe('parseCompilationErrors', () => {
  it('extracts TypeScript error lines from stdout', () => {
    const err = {
      stdout: `src/foo.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
src/bar.ts(20,3): error TS2345: Argument of type 'boolean' is not assignable.`,
      stderr: '',
      status: 1,
    };
    const errors = parseCompilationErrors(err);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('TS2322');
    expect(errors[1]).toContain('TS2345');
  });

  it('extracts errors from stderr if stdout is empty', () => {
    const err = {
      stdout: '',
      stderr: `src/baz.ts(5,1): error TS1005: ';' expected.`,
    };
    const errors = parseCompilationErrors(err);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('TS1005');
  });

  it('falls back to message if stdout and stderr are empty', () => {
    const err = new Error('Command failed: npx tsc --noEmit');
    const errors = parseCompilationErrors(err);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('returns "Unknown compilation error" for null/undefined input', () => {
    expect(parseCompilationErrors(null)).toEqual(['Unknown compilation error']);
    expect(parseCompilationErrors(undefined)).toEqual(['Unknown compilation error']);
  });

  it('returns "Unknown compilation error" for empty string', () => {
    expect(parseCompilationErrors('')).toEqual(['Unknown compilation error']);
  });

  it('returns "Unknown compilation error" for object with all empty strings', () => {
    expect(parseCompilationErrors({ stdout: '', stderr: '', message: '' })).toEqual(['Unknown compilation error']);
  });

  it('handles plain string error input', () => {
    const errors = parseCompilationErrors('src/x.ts(1,1): error TS2304: Cannot find name "foo".');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('TS2304');
  });

  it('returns up to 20 non-TS-error lines when no TS pattern found', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `Line ${i}: some random output`);
    const errors = parseCompilationErrors(lines.join('\n'));
    expect(errors).toHaveLength(20);
  });

  it('filters out empty lines', () => {
    const err = {
      stdout: `\n\nsrc/a.ts(1,1): error TS2322: bad type\n\n\n`,
    };
    const errors = parseCompilationErrors(err);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('TS2322');
  });

  it('handles mixed TS errors and non-error lines', () => {
    const err = {
      stdout: `Found 2 errors in 2 files.
src/a.ts(1,1): error TS2322: Type mismatch
Some info line
src/b.ts(5,3): error TS2345: Argument mismatch`,
    };
    const errors = parseCompilationErrors(err);
    expect(errors).toHaveLength(2);
    expect(errors.every((e) => /error\s+TS\d+/.test(e))).toBe(true);
  });

  it('handles error TS pattern without file location', () => {
    const err = { stdout: 'error TS6053: File not found.' };
    const errors = parseCompilationErrors(err);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('TS6053');
  });
});

// ─── verifyCompilation ───────────────────────────────────────────────

describe('verifyCompilation', () => {
  it('returns success when tsc exits cleanly', () => {
    mockedExecSync.mockReturnValue('' as never);
    const result = verifyCompilation('/project');
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('calls tsc with correct arguments', () => {
    mockedExecSync.mockReturnValue('' as never);
    verifyCompilation('/my/project');
    expect(mockedExecSync).toHaveBeenCalledWith('npx tsc --noEmit', {
      cwd: '/my/project',
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120_000,
    });
  });

  it('returns failure with errors when tsc fails', () => {
    const tscError = Object.assign(new Error('Command failed'), {
      stdout: `src/foo.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.`,
      stderr: '',
      status: 1,
    });
    mockedExecSync.mockImplementation(() => { throw tscError; });
    const result = verifyCompilation('/project');
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('TS2322');
  });

  it('returns failure with parsed errors for multiple compilation errors', () => {
    const tscError = Object.assign(new Error('Command failed'), {
      stdout: `src/a.ts(1,1): error TS2322: bad
src/b.ts(2,2): error TS2345: bad
src/c.ts(3,3): error TS2304: bad`,
      status: 1,
    });
    mockedExecSync.mockImplementation(() => { throw tscError; });
    const result = verifyCompilation('/project');
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(3);
  });

  it('handles timeout errors', () => {
    const timeoutError = Object.assign(new Error('ETIMEDOUT'), {
      killed: true,
      signal: 'SIGTERM',
    });
    mockedExecSync.mockImplementation(() => { throw timeoutError; });
    const result = verifyCompilation('/project');
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns CompilationResult shape', () => {
    mockedExecSync.mockReturnValue('' as never);
    const result: CompilationResult = verifyCompilation('/project');
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('errors');
    expect(typeof result.success).toBe('boolean');
    expect(Array.isArray(result.errors)).toBe(true);
  });
});

// ─── runCompilationLoop ──────────────────────────────────────────────

describe('runCompilationLoop', () => {
  it('returns success on first attempt when tsc passes', () => {
    mockedExecSync.mockReturnValue('' as never);
    const result = runCompilationLoop('/project', 'w-001', 't-001');
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it('writes heartbeat with VERIFYING status on each attempt', () => {
    mockedExecSync.mockReturnValue('' as never);
    runCompilationLoop('/project', 'w-001', 't-001');

    const hbCalls = mockedWriteFileSync.mock.calls.filter((call) => {
      const path = String(call[0]);
      return path.includes('.hb');
    });
    expect(hbCalls.length).toBeGreaterThanOrEqual(1);

    const hbContent = JSON.parse(hbCalls[0][1] as string);
    expect(hbContent.status).toBe('VERIFYING');
    expect(hbContent.currentAction).toContain('Type checking');
  });

  it('retries on failure and succeeds on second attempt', () => {
    const tscError = Object.assign(new Error('fail'), {
      stdout: `src/foo.ts(1,1): error TS2322: bad`,
      status: 1,
    });
    let callCount = 0;
    mockedExecSync.mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw tscError;
      return '' as never;
    });

    const result = runCompilationLoop('/project', 'w-001', 't-001');
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.errors).toEqual([]);
  });

  it('retries on failure and succeeds on third attempt', () => {
    const tscError = Object.assign(new Error('fail'), {
      stdout: `src/foo.ts(1,1): error TS2322: bad`,
      status: 1,
    });
    let callCount = 0;
    mockedExecSync.mockImplementation(() => {
      callCount++;
      if (callCount <= 2) throw tscError;
      return '' as never;
    });

    const result = runCompilationLoop('/project', 'w-001', 't-001');
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(3);
  });

  it('returns failure after max retries exhausted', () => {
    const tscError = Object.assign(new Error('fail'), {
      stdout: `src/foo.ts(1,1): error TS2322: Type 'string' not assignable`,
      status: 1,
    });
    mockedExecSync.mockImplementation(() => { throw tscError; });

    const result = runCompilationLoop('/project', 'w-001', 't-001');
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(3);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('enforces max retries = MAX_COMPILATION_RETRIES', () => {
    const tscError = Object.assign(new Error('fail'), {
      stdout: `error TS2322: bad`,
      status: 1,
    });
    mockedExecSync.mockImplementation(() => { throw tscError; });

    const result = runCompilationLoop('/project', 'w-001', 't-001');
    expect(result.attempts).toBe(MAX_COMPILATION_RETRIES);
    expect(mockedExecSync).toHaveBeenCalledTimes(MAX_COMPILATION_RETRIES);
  });

  it('calls onAttempt callback on each failed attempt', () => {
    const tscError = Object.assign(new Error('fail'), {
      stdout: `src/foo.ts(1,1): error TS2322: bad`,
      status: 1,
    });
    mockedExecSync.mockImplementation(() => { throw tscError; });

    const onAttempt = vi.fn();
    runCompilationLoop('/project', 'w-001', 't-001', 3, onAttempt);

    expect(onAttempt).toHaveBeenCalledTimes(3);
    expect(onAttempt).toHaveBeenCalledWith(1, 3, expect.any(Array));
    expect(onAttempt).toHaveBeenCalledWith(2, 3, expect.any(Array));
    expect(onAttempt).toHaveBeenCalledWith(3, 3, expect.any(Array));
  });

  it('does not call onAttempt on successful attempt', () => {
    mockedExecSync.mockReturnValue('' as never);
    const onAttempt = vi.fn();
    runCompilationLoop('/project', 'w-001', 't-001', 3, onAttempt);
    expect(onAttempt).not.toHaveBeenCalled();
  });

  it('heartbeat shows correct attempt number', () => {
    const tscError = Object.assign(new Error('fail'), {
      stdout: `error TS2322: bad`,
      status: 1,
    });
    mockedExecSync.mockImplementation(() => { throw tscError; });

    runCompilationLoop('/project', 'w-001', 't-001');

    const hbCalls = mockedWriteFileSync.mock.calls.filter((call) => {
      const path = String(call[0]);
      return path.includes('.hb');
    });

    expect(hbCalls.length).toBe(3);
    const hb1 = JSON.parse(hbCalls[0][1] as string);
    const hb2 = JSON.parse(hbCalls[1][1] as string);
    const hb3 = JSON.parse(hbCalls[2][1] as string);
    expect(hb1.currentAction).toBe('Type checking (attempt 1/3)');
    expect(hb2.currentAction).toBe('Type checking (attempt 2/3)');
    expect(hb3.currentAction).toBe('Type checking (attempt 3/3)');
  });

  it('respects custom maxRetries parameter', () => {
    const tscError = Object.assign(new Error('fail'), {
      stdout: `error TS2322: bad`,
      status: 1,
    });
    mockedExecSync.mockImplementation(() => { throw tscError; });

    const result = runCompilationLoop('/project', 'w-001', 't-001', 5);
    expect(result.attempts).toBe(5);
    expect(mockedExecSync).toHaveBeenCalledTimes(5);
  });

  it('returns errors from the last failed attempt', () => {
    let callCount = 0;
    mockedExecSync.mockImplementation(() => {
      callCount++;
      const err = Object.assign(new Error('fail'), {
        stdout: `src/foo.ts(${callCount},1): error TS2322: Error ${callCount}`,
        status: 1,
      });
      throw err;
    });

    const result = runCompilationLoop('/project', 'w-001', 't-001');
    expect(result.errors[0]).toContain('Error 3');
  });

  it('returns CompilationLoopResult shape on success', () => {
    mockedExecSync.mockReturnValue('' as never);
    const result: CompilationLoopResult = runCompilationLoop('/project', 'w-001', 't-001');
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('attempts');
    expect(result).toHaveProperty('errors');
  });

  it('returns CompilationLoopResult shape on failure', () => {
    const tscError = Object.assign(new Error('fail'), {
      stdout: `error TS2322: bad`,
      status: 1,
    });
    mockedExecSync.mockImplementation(() => { throw tscError; });
    const result: CompilationLoopResult = runCompilationLoop('/project', 'w-001', 't-001');
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('attempts');
    expect(result).toHaveProperty('errors');
  });

  it('works with maxRetries = 1 (no retries)', () => {
    const tscError = Object.assign(new Error('fail'), {
      stdout: `error TS2322: bad`,
      status: 1,
    });
    mockedExecSync.mockImplementation(() => { throw tscError; });

    const result = runCompilationLoop('/project', 'w-001', 't-001', 1);
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(1);
    expect(mockedExecSync).toHaveBeenCalledTimes(1);
  });

  it('heartbeat workerId and taskId match arguments', () => {
    mockedExecSync.mockReturnValue('' as never);
    runCompilationLoop('/project', 'worker-42', 'task-007');

    const hbCalls = mockedWriteFileSync.mock.calls.filter((call) =>
      String(call[0]).includes('.hb'),
    );
    const hb = JSON.parse(hbCalls[0][1] as string);
    expect(hb.workerId).toBe('worker-42');
    expect(hb.taskId).toBe('task-007');
  });

  it('creates .tasks/ directory if needed', () => {
    mockedExecSync.mockReturnValue('' as never);
    runCompilationLoop('/project', 'w-001', 't-001');
    expect(mkdirSync).toHaveBeenCalled();
  });
});

// ─── calculateProgress with VERIFYING ────────────────────────────────

describe('calculateProgress with VERIFYING status', () => {
  it('returns 65 for VERIFYING status', () => {
    expect(calculateProgress({ status: AgentStatus.VERIFYING })).toBe(65);
  });

  it('returns 65 for VERIFYING string', () => {
    expect(calculateProgress({ status: 'VERIFYING' })).toBe(65);
  });

  it('VERIFYING is between CODING and TESTING progress values', () => {
    const codingMax = calculateProgress({ status: 'CODING', filesChangedCount: 5 });
    const verifying = calculateProgress({ status: 'VERIFYING' });
    const testing = calculateProgress({ status: 'TESTING' });
    expect(verifying).toBeGreaterThan(codingMax);
    expect(verifying).toBeLessThan(testing);
  });
});

// ─── AgentStatus.VERIFYING enum value ────────────────────────────────

describe('AgentStatus.VERIFYING', () => {
  it('exists in AgentStatus enum', () => {
    expect(AgentStatus.VERIFYING).toBeDefined();
    expect(AgentStatus.VERIFYING).toBe('VERIFYING');
  });

  it('is a string value', () => {
    expect(typeof AgentStatus.VERIFYING).toBe('string');
  });
});

// ═══ Feedback Loop Metrics (Task 040-003) ════════════════════════════

function makeResult(
  overrides: Partial<TaskResult> & { feedbackLoop?: FeedbackLoop },
): TaskResult {
  return {
    taskId: 'test-001',
    workerId: 'w-test',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 90,
    selfAssessment: 'DONE',
    notes: '',
    ...overrides,
  };
}

// ─── createFeedbackLoop ──────────────────────────────────────────────

describe('createFeedbackLoop', () => {
  it('returns a fresh tracker with all zeros', () => {
    const loop = createFeedbackLoop();
    expect(loop).toEqual({
      tscAttempts: 0,
      testAttempts: 0,
      tscErrorsFixed: 0,
      testFailuresFixed: 0,
      totalRetryTimeMs: 0,
    });
  });

  it('returns independent instances', () => {
    const a = createFeedbackLoop();
    const b = createFeedbackLoop();
    a.tscAttempts = 5;
    expect(b.tscAttempts).toBe(0);
  });
});

// ─── recordTscAttempt ────────────────────────────────────────────────

describe('recordTscAttempt', () => {
  it('increments tscAttempts on first call', () => {
    const loop = createFeedbackLoop();
    recordTscAttempt(loop, false, 100);
    expect(loop.tscAttempts).toBe(1);
  });

  it('accumulates totalRetryTimeMs', () => {
    const loop = createFeedbackLoop();
    recordTscAttempt(loop, false, 100);
    recordTscAttempt(loop, false, 200);
    recordTscAttempt(loop, true, 150);
    expect(loop.totalRetryTimeMs).toBe(450);
  });

  it('does NOT count tscErrorsFixed on first attempt success', () => {
    const loop = createFeedbackLoop();
    recordTscAttempt(loop, true, 50);
    expect(loop.tscErrorsFixed).toBe(0);
  });

  it('counts tscErrorsFixed when success on retry', () => {
    const loop = createFeedbackLoop();
    recordTscAttempt(loop, false, 100);
    recordTscAttempt(loop, true, 100);
    expect(loop.tscErrorsFixed).toBe(1);
    expect(loop.tscAttempts).toBe(2);
  });

  it('does not count tscErrorsFixed on retry failure', () => {
    const loop = createFeedbackLoop();
    recordTscAttempt(loop, false, 100);
    recordTscAttempt(loop, false, 100);
    expect(loop.tscErrorsFixed).toBe(0);
  });
});

// ─── recordTestAttempt ───────────────────────────────────────────────

describe('recordTestAttempt', () => {
  it('increments testAttempts', () => {
    const loop = createFeedbackLoop();
    recordTestAttempt(loop, false, 200);
    expect(loop.testAttempts).toBe(1);
  });

  it('does NOT count testFailuresFixed on first attempt success', () => {
    const loop = createFeedbackLoop();
    recordTestAttempt(loop, true, 100);
    expect(loop.testFailuresFixed).toBe(0);
  });

  it('counts testFailuresFixed when success on retry', () => {
    const loop = createFeedbackLoop();
    recordTestAttempt(loop, false, 200);
    recordTestAttempt(loop, true, 200);
    expect(loop.testFailuresFixed).toBe(1);
  });

  it('accumulates totalRetryTimeMs alongside tsc attempts', () => {
    const loop = createFeedbackLoop();
    recordTscAttempt(loop, true, 100);
    recordTestAttempt(loop, false, 300);
    recordTestAttempt(loop, true, 200);
    expect(loop.totalRetryTimeMs).toBe(600);
  });
});

// ─── calculateSelfHealingRate ────────────────────────────────────────

describe('calculateSelfHealingRate', () => {
  it('returns 0 for empty results array', () => {
    expect(calculateSelfHealingRate([])).toBe(0);
  });

  it('returns 0 when no results have feedbackLoop', () => {
    expect(calculateSelfHealingRate([makeResult({})])).toBe(0);
  });

  it('returns 0 when all tasks pass on first try', () => {
    const results = [
      makeResult({
        feedbackLoop: { tscAttempts: 1, testAttempts: 1, tscErrorsFixed: 0, testFailuresFixed: 0, totalRetryTimeMs: 100 },
      }),
    ];
    expect(calculateSelfHealingRate(results)).toBe(0);
  });

  it('returns 100 when all retried tasks self-healed', () => {
    const results = [
      makeResult({
        selfAssessment: 'DONE',
        feedbackLoop: { tscAttempts: 2, testAttempts: 1, tscErrorsFixed: 1, testFailuresFixed: 0, totalRetryTimeMs: 200 },
      }),
      makeResult({
        taskId: 'test-002',
        selfAssessment: 'GO_WITH_TECH_DEBT',
        feedbackLoop: { tscAttempts: 1, testAttempts: 3, tscErrorsFixed: 0, testFailuresFixed: 1, totalRetryTimeMs: 600 },
      }),
    ];
    expect(calculateSelfHealingRate(results)).toBe(100);
  });

  it('returns correct rate for mixed outcomes', () => {
    const results = [
      makeResult({
        selfAssessment: 'DONE',
        feedbackLoop: { tscAttempts: 2, testAttempts: 1, tscErrorsFixed: 1, testFailuresFixed: 0, totalRetryTimeMs: 200 },
      }),
      makeResult({
        taskId: 'test-002',
        selfAssessment: 'NO_GO',
        feedbackLoop: { tscAttempts: 3, testAttempts: 0, tscErrorsFixed: 0, testFailuresFixed: 0, totalRetryTimeMs: 300 },
      }),
      makeResult({
        taskId: 'test-003',
        selfAssessment: 'DONE',
        feedbackLoop: { tscAttempts: 1, testAttempts: 1, tscErrorsFixed: 0, testFailuresFixed: 0, totalRetryTimeMs: 50 },
      }),
    ];
    expect(calculateSelfHealingRate(results)).toBe(50);
  });

  it('treats GO_WITH_TECH_DEBT as self-healed', () => {
    const results = [
      makeResult({
        selfAssessment: 'GO_WITH_TECH_DEBT',
        feedbackLoop: { tscAttempts: 2, testAttempts: 1, tscErrorsFixed: 1, testFailuresFixed: 0, totalRetryTimeMs: 150 },
      }),
    ];
    expect(calculateSelfHealingRate(results)).toBe(100);
  });

  it('returns 0 when single NO_GO result with retries', () => {
    const results = [
      makeResult({
        selfAssessment: 'NO_GO',
        feedbackLoop: { tscAttempts: 3, testAttempts: 3, tscErrorsFixed: 0, testFailuresFixed: 0, totalRetryTimeMs: 600 },
      }),
    ];
    expect(calculateSelfHealingRate(results)).toBe(0);
  });

  it('rounds to nearest integer', () => {
    const results = [
      makeResult({
        selfAssessment: 'DONE',
        feedbackLoop: { tscAttempts: 2, testAttempts: 1, tscErrorsFixed: 1, testFailuresFixed: 0, totalRetryTimeMs: 100 },
      }),
      makeResult({
        taskId: 'test-002',
        selfAssessment: 'NO_GO',
        feedbackLoop: { tscAttempts: 2, testAttempts: 1, tscErrorsFixed: 0, testFailuresFixed: 0, totalRetryTimeMs: 100 },
      }),
      makeResult({
        taskId: 'test-003',
        selfAssessment: 'NO_GO',
        feedbackLoop: { tscAttempts: 1, testAttempts: 2, tscErrorsFixed: 0, testFailuresFixed: 0, totalRetryTimeMs: 100 },
      }),
    ];
    expect(calculateSelfHealingRate(results)).toBe(33);
  });
});

// ─── aggregateFeedbackLoops ──────────────────────────────────────────

describe('aggregateFeedbackLoops', () => {
  it('returns zeros for empty results', () => {
    const agg = aggregateFeedbackLoops([]);
    expect(agg.totalTscAttempts).toBe(0);
    expect(agg.totalTestAttempts).toBe(0);
    expect(agg.tasksWithRetries).toBe(0);
    expect(agg.tasksFirstPassSuccess).toBe(0);
  });

  it('skips results without feedbackLoop', () => {
    const agg = aggregateFeedbackLoops([makeResult({}), makeResult({ taskId: 'test-002' })]);
    expect(agg.tasksWithRetries).toBe(0);
    expect(agg.tasksFirstPassSuccess).toBe(0);
  });

  it('correctly aggregates across multiple results', () => {
    const results = [
      makeResult({
        feedbackLoop: { tscAttempts: 2, testAttempts: 1, tscErrorsFixed: 1, testFailuresFixed: 0, totalRetryTimeMs: 200 },
      }),
      makeResult({
        taskId: 'test-002',
        feedbackLoop: { tscAttempts: 1, testAttempts: 3, tscErrorsFixed: 0, testFailuresFixed: 1, totalRetryTimeMs: 500 },
      }),
      makeResult({
        taskId: 'test-003',
        feedbackLoop: { tscAttempts: 1, testAttempts: 1, tscErrorsFixed: 0, testFailuresFixed: 0, totalRetryTimeMs: 100 },
      }),
    ];
    const agg = aggregateFeedbackLoops(results);
    expect(agg.totalTscAttempts).toBe(4);
    expect(agg.totalTestAttempts).toBe(5);
    expect(agg.totalTscErrorsFixed).toBe(1);
    expect(agg.totalTestFailuresFixed).toBe(1);
    expect(agg.totalRetryTimeMs).toBe(800);
    expect(agg.tasksWithRetries).toBe(2);
    expect(agg.tasksFirstPassSuccess).toBe(1);
  });

  it('counts task as first-pass when both tsc and test are 1 attempt', () => {
    const agg = aggregateFeedbackLoops([
      makeResult({
        feedbackLoop: { tscAttempts: 1, testAttempts: 1, tscErrorsFixed: 0, testFailuresFixed: 0, totalRetryTimeMs: 50 },
      }),
    ]);
    expect(agg.tasksFirstPassSuccess).toBe(1);
    expect(agg.tasksWithRetries).toBe(0);
  });

  it('counts task as retry when tsc > 1 even if test = 1', () => {
    const agg = aggregateFeedbackLoops([
      makeResult({
        feedbackLoop: { tscAttempts: 3, testAttempts: 1, tscErrorsFixed: 1, testFailuresFixed: 0, totalRetryTimeMs: 300 },
      }),
    ]);
    expect(agg.tasksWithRetries).toBe(1);
    expect(agg.tasksFirstPassSuccess).toBe(0);
  });
});

// ─── FeedbackLoop in TaskResult integration ──────────────────────────

describe('feedbackLoop in TaskResult', () => {
  it('feedbackLoop is optional — undefined is valid', () => {
    const result = makeResult({});
    expect(result.feedbackLoop).toBeUndefined();
  });

  it('feedbackLoop can be attached via createFeedbackLoop + record*', () => {
    const loop = createFeedbackLoop();
    recordTscAttempt(loop, false, 100);
    recordTscAttempt(loop, true, 150);
    recordTestAttempt(loop, true, 200);

    const result = makeResult({ feedbackLoop: loop });
    expect(result.feedbackLoop).toBeDefined();
    expect(result.feedbackLoop!.tscAttempts).toBe(2);
    expect(result.feedbackLoop!.tscErrorsFixed).toBe(1);
    expect(result.feedbackLoop!.testAttempts).toBe(1);
    expect(result.feedbackLoop!.totalRetryTimeMs).toBe(450);
  });

  it('feedbackLoop serializes to JSON correctly', () => {
    const result = makeResult({
      feedbackLoop: {
        tscAttempts: 3, testAttempts: 2,
        tscErrorsFixed: 1, testFailuresFixed: 1,
        totalRetryTimeMs: 1500,
      },
    });
    const parsed = JSON.parse(JSON.stringify(result)) as TaskResult;
    expect(parsed.feedbackLoop).toEqual({
      tscAttempts: 3, testAttempts: 2,
      tscErrorsFixed: 1, testFailuresFixed: 1,
      totalRetryTimeMs: 1500,
    });
  });
});

// ─── Feedback loop edge cases ────────────────────────────────────────

describe('feedback loop edge cases', () => {
  it('recordTscAttempt works with 0ms duration', () => {
    const loop = createFeedbackLoop();
    recordTscAttempt(loop, true, 0);
    expect(loop.tscAttempts).toBe(1);
    expect(loop.totalRetryTimeMs).toBe(0);
  });

  it('recordTestAttempt works with large duration', () => {
    const loop = createFeedbackLoop();
    recordTestAttempt(loop, false, 120_000);
    expect(loop.totalRetryTimeMs).toBe(120_000);
  });

  it('aggregateFeedbackLoops with mix of feedback and no-feedback results', () => {
    const results = [
      makeResult({}),
      makeResult({
        taskId: 'test-002',
        feedbackLoop: { tscAttempts: 1, testAttempts: 1, tscErrorsFixed: 0, testFailuresFixed: 0, totalRetryTimeMs: 50 },
      }),
      makeResult({ taskId: 'test-003' }),
    ];
    const agg = aggregateFeedbackLoops(results);
    expect(agg.tasksFirstPassSuccess).toBe(1);
    expect(agg.totalTscAttempts).toBe(1);
  });
});

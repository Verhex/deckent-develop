import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getVerifyCommands,
  isDocOnlyScope,
  parseVitestOutput,
  parseCompilationErrors,
  MAX_TEST_RETRIES,
  MAX_COMPILATION_RETRIES,
} from '../../src/agents/worker-verify.js';
import type { TaskScope } from '../../src/core/types.js';

vi.mock('../../src/core/stack-detector.js', () => ({
  detectFullStack: vi.fn(() => ({
    language: 'typescript',
    buildTool: 'tsc',
    commands: { build: 'npx tsc', test: 'npx vitest run' },
  })),
  STACK_COMMANDS: {
    typescript: { build: 'npx tsc', test: 'npx vitest run' },
    python: { build: '', test: 'pytest' },
  },
}));

// Mock worker.js to avoid circular dependency during test
vi.mock('../../src/agents/worker.js', () => ({
  createHeartbeat: vi.fn(() => ({
    workerId: 'w1', taskId: 't1', status: 'VERIFYING',
    currentAction: 'test', timestamp: new Date().toISOString(),
    filesChangedCount: 0, sequence: 0, progress: 65,
  })),
  writeHeartbeat: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getVerifyCommands', () => {
  it('returns TypeScript build and test commands', () => {
    const cmds = getVerifyCommands('/project');
    expect(cmds.build).toBe('npx tsc');
    expect(cmds.test).toBe('npx vitest run');
  });
});

describe('isDocOnlyScope', () => {
  it('returns false for empty directories', () => {
    expect(isDocOnlyScope({ directories: [], filesRead: [], filesWrite: [] })).toBe(false);
  });

  it('returns true for docs-only scope', () => {
    const scope: TaskScope = { directories: ['docs/', '.brain/'], filesRead: [], filesWrite: [] };
    expect(isDocOnlyScope(scope)).toBe(true);
  });

  it('returns false when scope includes src/', () => {
    const scope: TaskScope = { directories: ['src/', 'docs/'], filesRead: [], filesWrite: [] };
    expect(isDocOnlyScope(scope)).toBe(false);
  });

  it('returns false when scope includes tests/', () => {
    const scope: TaskScope = { directories: ['tests/'], filesRead: [], filesWrite: [] };
    expect(isDocOnlyScope(scope)).toBe(false);
  });

  it('returns false for exact "src"', () => {
    const scope: TaskScope = { directories: ['src'], filesRead: [], filesWrite: [] };
    expect(isDocOnlyScope(scope)).toBe(false);
  });

  it('returns undefined/false for no scope', () => {
    expect(isDocOnlyScope(undefined)).toBe(false);
  });
});

describe('parseVitestOutput', () => {
  it('parses FAIL lines', () => {
    const output = `
 FAIL tests/foo.test.ts > suite > should work
 FAIL tests/bar.test.ts > another test
    `;
    const { failedTests } = parseVitestOutput(output);
    expect(failedTests.length).toBeGreaterThanOrEqual(2);
  });

  it('extracts summary line', () => {
    const output = `Tests  3 failed | 12 passed (15)`;
    const { summary } = parseVitestOutput(output);
    expect(summary).toContain('3 failed');
    expect(summary).toContain('12 passed');
  });

  it('returns empty for clean output', () => {
    const { failedTests, summary } = parseVitestOutput('All tests passed\n');
    expect(failedTests).toEqual([]);
    expect(summary).toBe('');
  });

  it('deduplicates failed test names', () => {
    const output = `
 FAIL tests/foo.test.ts > test a
 FAIL tests/foo.test.ts > test a
    `;
    const { failedTests } = parseVitestOutput(output);
    const unique = new Set(failedTests);
    expect(failedTests.length).toBe(unique.size);
  });
});

describe('parseCompilationErrors', () => {
  it('extracts TS error lines', () => {
    const err = { stdout: 'src/foo.ts(10,5): error TS2304: Cannot find name\n' };
    const errors = parseCompilationErrors(err);
    expect(errors[0]).toContain('TS2304');
  });

  it('falls back to first 20 lines if no TS pattern', () => {
    const err = { stdout: 'line1\nline2\nline3\n' };
    const errors = parseCompilationErrors(err);
    expect(errors.length).toBe(3);
  });

  it('handles unknown error', () => {
    const errors = parseCompilationErrors(null);
    expect(errors).toEqual(['Unknown compilation error']);
  });

  it('handles string error', () => {
    const errors = parseCompilationErrors('some error text');
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('constants', () => {
  it('MAX_TEST_RETRIES is 3', () => {
    expect(MAX_TEST_RETRIES).toBe(3);
  });

  it('MAX_COMPILATION_RETRIES is 3', () => {
    expect(MAX_COMPILATION_RETRIES).toBe(3);
  });
});

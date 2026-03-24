import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isDocOnlyScope,
  verifyCompilation,
  verifyTests,
  runCompilationLoop,
  runTestVerifyLoop,
} from '../../src/agents/worker.js';
import type { TaskScope } from '../../src/core/types.js';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  appendFileSync: vi.fn(),
  openSync: vi.fn(() => 42),
  closeSync: vi.fn(),
  constants: { O_WRONLY: 1, O_CREAT: 64, O_EXCL: 128 },
}));

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('../../src/core/stack-detector.js', () => ({
  detectFullStack: vi.fn(() => ({ language: 'typescript', buildTool: 'tsc' })),
  STACK_COMMANDS: {
    typescript: { build: 'npx tsc', test: 'npx vitest run' },
  },
}));


import { execSync } from 'node:child_process';

const mockedExecSync = vi.mocked(execSync);

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── isDocOnlyScope ─────────────────────────────────────────────────

describe('isDocOnlyScope', () => {
  it('returns false for undefined scope', () => {
    expect(isDocOnlyScope(undefined)).toBe(false);
  });

  it('returns false for empty directories array', () => {
    const scope: TaskScope = { directories: [], filesRead: [], filesWrite: [] };
    expect(isDocOnlyScope(scope)).toBe(false);
  });

  it('returns false for src/ directory', () => {
    const scope: TaskScope = { directories: ['src/'], filesRead: [], filesWrite: [] };
    expect(isDocOnlyScope(scope)).toBe(false);
  });

  it('returns false for tests/ directory', () => {
    const scope: TaskScope = { directories: ['tests/core/'], filesRead: [], filesWrite: [] };
    expect(isDocOnlyScope(scope)).toBe(false);
  });

  it('returns false for lib/ directory', () => {
    const scope: TaskScope = { directories: ['lib/'], filesRead: [], filesWrite: [] };
    expect(isDocOnlyScope(scope)).toBe(false);
  });

  it('returns false for exact "src" directory', () => {
    const scope: TaskScope = { directories: ['src'], filesRead: [], filesWrite: [] };
    expect(isDocOnlyScope(scope)).toBe(false);
  });

  it('returns false for mixed doc and source directories', () => {
    const scope: TaskScope = { directories: ['docs/', 'src/core/'], filesRead: [], filesWrite: [] };
    expect(isDocOnlyScope(scope)).toBe(false);
  });

  it('returns true for docs/ directory only', () => {
    const scope: TaskScope = { directories: ['docs/'], filesRead: [], filesWrite: [] };
    expect(isDocOnlyScope(scope)).toBe(true);
  });

  it('returns true for multiple non-source directories', () => {
    const scope: TaskScope = { directories: ['docs/', '.brain/', './'], filesRead: [], filesWrite: [] };
    expect(isDocOnlyScope(scope)).toBe(true);
  });

  it('returns true for root directory scope', () => {
    const scope: TaskScope = { directories: ['./'], filesRead: [], filesWrite: [] };
    expect(isDocOnlyScope(scope)).toBe(true);
  });
});

// ─── verifyCompilation with doc-only scope ──────────────────────────

describe('verifyCompilation doc-only skip', () => {
  it('skips compilation for doc-only scope', () => {
    const docScope: TaskScope = { directories: ['docs/'], filesRead: [], filesWrite: ['docs/README.md'] };
    const result = verifyCompilation('/project', docScope);
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(mockedExecSync).not.toHaveBeenCalled();
  });

  it('runs compilation when scope includes source dirs', () => {
    const srcScope: TaskScope = { directories: ['src/core/'], filesRead: [], filesWrite: [] };
    mockedExecSync.mockReturnValue('' as never);
    const result = verifyCompilation('/project', srcScope);
    expect(result.success).toBe(true);
    expect(mockedExecSync).toHaveBeenCalled();
  });

  it('runs compilation when no scope provided', () => {
    mockedExecSync.mockReturnValue('' as never);
    const result = verifyCompilation('/project');
    expect(result.success).toBe(true);
    expect(mockedExecSync).toHaveBeenCalled();
  });
});

// ─── verifyTests with doc-only scope ────────────────────────────────

describe('verifyTests doc-only skip', () => {
  it('skips tests for doc-only scope', () => {
    const docScope: TaskScope = { directories: ['docs/'], filesRead: [], filesWrite: [] };
    const result = verifyTests('/project', undefined, docScope);
    expect(result.success).toBe(true);
    expect(result.failedTests).toEqual([]);
    expect(result.output).toBe('');
    expect(mockedExecSync).not.toHaveBeenCalled();
  });

  it('runs tests when scope includes source dirs', () => {
    const srcScope: TaskScope = { directories: ['src/agents/'], filesRead: [], filesWrite: [] };
    mockedExecSync.mockReturnValue('' as never);
    const result = verifyTests('/project', undefined, srcScope);
    expect(result.success).toBe(true);
    expect(mockedExecSync).toHaveBeenCalled();
  });
});

// ─── runCompilationLoop with doc-only scope ─────────────────────────

describe('runCompilationLoop doc-only skip', () => {
  it('skips compilation loop for doc-only scope and returns 0 attempts', () => {
    const docScope: TaskScope = { directories: ['docs/', '.brain/'], filesRead: [], filesWrite: [] };
    const result = runCompilationLoop('/project', 'w-001', '001', 3, undefined, docScope);
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(0);
    expect(result.errors).toEqual([]);
    expect(mockedExecSync).not.toHaveBeenCalled();
  });
});

// ─── runTestVerifyLoop with doc-only scope ──────────────────────────

describe('runTestVerifyLoop doc-only skip', () => {
  it('skips test verify loop for doc-only scope and returns 0 attempts', () => {
    const docScope: TaskScope = { directories: ['docs/'], filesRead: [], filesWrite: [] };
    const result = runTestVerifyLoop('/project', undefined, undefined, docScope);
    expect(result.result.success).toBe(true);
    expect(result.attempts).toBe(0);
    expect(result.failuresFixed).toBe(0);
    expect(mockedExecSync).not.toHaveBeenCalled();
  });
});

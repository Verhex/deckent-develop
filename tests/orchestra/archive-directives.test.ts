/**
 * tests/orchestra/archive-directives.test.ts
 *
 * Tests for archiveDirectives() — DIRECTIVES.md auto-archive feature.
 * Covers: (a) archive happy path, (b) placeholder content,
 *         (c) config flag off behavior, (d) mkdir when dir missing,
 *         (e) missing DIRECTIVES.md graceful skip.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  copyFileSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 2, mtimeMs: 0 })),
  appendFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  // Sprint 139 async I/O migration: sprint-finalizer and other modules use
  // `import { promises as fsPromises } from 'node:fs'`. Bind async impls via
  // `vi.fn(async () => ...)` so vi.clearAllMocks preserves them.
  promises: {
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    appendFile: vi.fn(async () => undefined),
    access: vi.fn(async () => undefined),
    stat: vi.fn(async () => ({ size: 0 })),
  },
}));

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(),
}));

vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/utils.js')>();
  return {
    ...actual,
    debugLog: vi.fn(),
    parseDebtTable: vi.fn().mockReturnValue([]),
  };
});

vi.mock('../../src/core/model-registry.js', () => ({
  // cost-ledger.ts (418-001) imports these from model-registry at module load —
  // factory mocks must cover newly-consumed exports (SETTINGS_DIR-class gotcha).
  registerCodexParityModels: vi.fn(),
  BUILTIN_MODELS: [],
  modelRegistry: {
    get: vi.fn(),
    has: vi.fn().mockReturnValue(true),
    resolveApiId: vi.fn().mockReturnValue('claude-sonnet-4-20250514'),
    getAllProviders: vi.fn().mockReturnValue(['claude', 'codex', 'gemini']),
    getByProvider: vi.fn().mockReturnValue([]),
    getAllModelIds: vi.fn().mockReturnValue(['opus', 'sonnet', 'haiku']),
    getAllModels: vi.fn().mockReturnValue([]),
    getByProviderAndTier: vi.fn().mockReturnValue({ id: 'opus' }),
  },
}));

vi.mock('../../src/orchestra/result-collector.js', () => ({
  buildResultsMap: vi.fn().mockReturnValue(new Map()),
}));

vi.mock('../../src/orchestra/doc-updaters/registry.js', () => ({
  runAllUpdaters: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/orchestra/doc-updaters/index.js', () => ({}));

vi.mock('../../src/orchestra/managed-docs/managed-doc-runner.js', () => ({
  runManagedDocUpdates: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/core/ci-learning.js', () => ({
  analyzeCiLearnings: vi.fn(),
  buildCiLearningsSection: vi.fn().mockReturnValue([]),
  writeCiLearnings: vi.fn(),
}));

import { existsSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { archiveDirectives } from '../../src/orchestra/sprint-reporter.js';

const mockExistsSync = existsSync as ReturnType<typeof vi.fn>;
const mockMkdirSync = mkdirSync as ReturnType<typeof vi.fn>;
const mockCopyFileSync = copyFileSync as ReturnType<typeof vi.fn>;
const mockWriteFileSync = writeFileSync as ReturnType<typeof vi.fn>;

describe('archiveDirectives', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should archive DIRECTIVES.md and write placeholder (happy path)', () => {
    // DIRECTIVES.md exists
    mockExistsSync.mockReturnValue(true);

    // Sprint 168 C0a-4: legacy placeholder-overwrite behavior is now opt-in (BUG-CC fix)
    archiveDirectives('/project', 'sprint-133', 'COMPLETE', { autoArchive: true });

    // Should create archive dir
    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('.brain/archive'),
      { recursive: true },
    );

    // Should copy DIRECTIVES.md to archive
    expect(mockCopyFileSync).toHaveBeenCalledWith(
      expect.stringContaining('DIRECTIVES.md'),
      expect.stringContaining('DIRECTIVES-sprint-133.md'),
    );

    // Should write placeholder
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('DIRECTIVES.md'),
      expect.stringContaining('Sprint 134'),
    );
  });

  it('should write placeholder with correct next sprint number and references', () => {
    mockExistsSync.mockReturnValue(true);

    // Sprint 168 C0a-4: explicit autoArchive opt-in (default preserve, BUG-CC)
    archiveDirectives('/project', 'sprint-050', 'COMPLETE', { autoArchive: true });

    const writeCall = mockWriteFileSync.mock.calls[0];
    const content = writeCall?.[1] as string;

    // Placeholder should reference next sprint
    expect(content).toContain('Sprint 51');
    // Should reference the archive file
    expect(content).toContain('DIRECTIVES-sprint-050.md');
    // Should reference RETRO.md and MEMORY.md
    expect(content).toContain('RETRO.md');
    expect(content).toContain('MEMORY.md');
    // Should have task template
    expect(content).toContain('## Task 1:');
  });

  it('should skip archiving when DIRECTIVES.md does not exist', () => {
    mockExistsSync.mockReturnValue(false);

    archiveDirectives('/project', 'sprint-100');

    // Should NOT copy or write anything
    expect(mockCopyFileSync).not.toHaveBeenCalled();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(mockMkdirSync).not.toHaveBeenCalled();
  });

  it('should create .brain/archive/ directory if it does not exist', () => {
    // DIRECTIVES.md exists, archive dir will be created by mkdirSync recursive
    mockExistsSync.mockReturnValue(true);

    // Sprint 168 C0a-4: legacy placeholder-overwrite opt-in (BUG-CC default preserve)
    archiveDirectives('/project', 'sprint-010', 'COMPLETE', { autoArchive: true });

    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('.brain/archive'),
      { recursive: true },
    );

    // Verify the copy still happens after mkdir
    expect(mockCopyFileSync).toHaveBeenCalled();
    expect(mockWriteFileSync).toHaveBeenCalled();
  });

  it('should handle sprint IDs with leading zeros correctly', () => {
    mockExistsSync.mockReturnValue(true);

    // Sprint 168 C0a-4: legacy placeholder-overwrite opt-in (BUG-CC default preserve)
    archiveDirectives('/project', 'sprint-009', 'COMPLETE', { autoArchive: true });

    // Next sprint should be 10, not 010
    const writeCall = mockWriteFileSync.mock.calls[0];
    const content = writeCall?.[1] as string;
    expect(content).toContain('Sprint 10');
  });
});

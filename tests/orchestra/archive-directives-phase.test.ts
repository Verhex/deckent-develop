/**
 * tests/orchestra/archive-directives-phase.test.ts
 *
 * Sprint 146 Task 8: DIRECTIVES.md Mid-Sprint Silme Bug Fix
 * Tests phase guard on archiveDirectives() and emergencyRestoreDirectives().
 *
 * 7 tests:
 * 1-4. PLAN/EXECUTE/FIX/RETRO phases → REJECTED (no archive)
 * 5.   CLEANUP phase → archive proceeds
 * 6.   Emergency restore from task JSON
 * 7.   Sprint 145 scenario simulation: EXECUTE phase reject
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  copyFileSync: vi.fn(),
  statSync: vi.fn(),
  appendFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  rmdirSync: vi.fn(),
  promises: {
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    appendFile: vi.fn(async () => undefined),
    access: vi.fn(async () => undefined),
    stat: vi.fn(async () => ({ size: 0 })),
    readdir: vi.fn(async () => []),
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

import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { archiveDirectives, emergencyRestoreDirectives } from '../../src/orchestra/sprint-docs-updater.js';
import { debugLog } from '../../src/core/utils.js';

const mockExistsSync = existsSync as ReturnType<typeof vi.fn>;
const mockMkdirSync = mkdirSync as ReturnType<typeof vi.fn>;
const mockCopyFileSync = copyFileSync as ReturnType<typeof vi.fn>;
const mockWriteFileSync = writeFileSync as ReturnType<typeof vi.fn>;
const mockReadFileSync = readFileSync as ReturnType<typeof vi.fn>;
const mockReaddirSync = readdirSync as ReturnType<typeof vi.fn>;
const mockDebugLog = debugLog as ReturnType<typeof vi.fn>;

describe('archiveDirectives — phase guard (Sprint 146 T-008)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should REJECT archiving when called during PLAN phase', () => {
    mockExistsSync.mockReturnValue(true);

    archiveDirectives('/project', 'sprint-145', 'PLAN');

    expect(mockCopyFileSync).not.toHaveBeenCalled();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(mockDebugLog).toHaveBeenCalledWith('archiveDirectives', expect.stringContaining('REJECTED'));
  });

  it('should REJECT archiving when called during EXECUTE phase', () => {
    mockExistsSync.mockReturnValue(true);

    archiveDirectives('/project', 'sprint-145', 'EXECUTE');

    expect(mockCopyFileSync).not.toHaveBeenCalled();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(mockDebugLog).toHaveBeenCalledWith('archiveDirectives', expect.stringContaining('REJECTED'));
  });

  it('should REJECT archiving when called during FIX phase', () => {
    mockExistsSync.mockReturnValue(true);

    archiveDirectives('/project', 'sprint-145', 'FIX');

    expect(mockCopyFileSync).not.toHaveBeenCalled();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('should REJECT archiving when called during RETRO phase', () => {
    mockExistsSync.mockReturnValue(true);

    archiveDirectives('/project', 'sprint-145', 'RETRO');

    expect(mockCopyFileSync).not.toHaveBeenCalled();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('should ALLOW archiving when called during CLEANUP phase', () => {
    mockExistsSync.mockReturnValue(true);

    archiveDirectives('/project', 'sprint-145', 'CLEANUP');

    // Should create archive dir
    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('.brain/archive'),
      { recursive: true },
    );

    // Should copy DIRECTIVES.md to archive
    expect(mockCopyFileSync).toHaveBeenCalledWith(
      expect.stringContaining('DIRECTIVES.md'),
      expect.stringContaining('DIRECTIVES-sprint-145.md'),
    );

    // Should write placeholder
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('DIRECTIVES.md'),
      expect.stringContaining('Sprint 146'),
    );
  });
});

describe('emergencyRestoreDirectives (Sprint 146 T-008)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should restore DIRECTIVES.md from task JSON files when current is a placeholder', () => {
    // Current DIRECTIVES.md is a short placeholder template
    mockExistsSync.mockImplementation((p: string) => {
      if (typeof p === 'string' && p.includes('DIRECTIVES.md')) return true;
      if (typeof p === 'string' && p.includes('.tasks')) return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: string) => {
      if (typeof p === 'string' && p.includes('DIRECTIVES.md')) {
        return '# DIRECTIVES — Sprint 147\n\n## Task 1: [Task title]\n';
      }
      if (typeof p === 'string' && p.includes('task-146-001.json')) {
        return JSON.stringify({
          id: '146-001',
          title: 'Agent Truncation Bug Fix',
          description: 'Fix agent content truncation in prompt builder.',
          model: 'opus',
          effort: 'normal',
          scope: { directories: ['src/core/'], filesWrite: ['src/core/agent-pool.ts'] },
        });
      }
      if (typeof p === 'string' && p.includes('task-146-002.json')) {
        return JSON.stringify({
          id: '146-002',
          title: 'Agent Routing V2 Retrain',
          description: 'Refresh intent classifier and activation engine.',
          model: 'opus',
          effort: 'high',
          scope: { directories: ['src/orchestra/'] },
        });
      }
      return '';
    });
    mockReaddirSync.mockReturnValue([
      'task-146-001.json',
      'task-146-002.json',
      'task-146-001.hb',
    ]);

    const result = emergencyRestoreDirectives('/project', 'sprint-146');

    expect(result).toBe(true);
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const writtenContent = mockWriteFileSync.mock.calls[0]?.[1] as string;
    expect(writtenContent).toContain('Emergency Restore');
    expect(writtenContent).toContain('Agent Truncation Bug Fix');
    expect(writtenContent).toContain('Agent Routing V2 Retrain');
    expect(writtenContent).toContain('opus');
  });

  it('should simulate Sprint 145 08:14 TRT scenario: EXECUTE phase call is rejected', () => {
    // Sprint 145 bug: archiveDirectives was called during EXECUTE phase
    mockExistsSync.mockReturnValue(true);

    // Simulating the exact scenario: EXECUTE phase, sprint-145
    archiveDirectives('/project', 'sprint-145', 'EXECUTE');

    // DIRECTIVES.md should NOT be overwritten with placeholder
    expect(mockCopyFileSync).not.toHaveBeenCalled();
    expect(mockWriteFileSync).not.toHaveBeenCalled();

    // debugLog should confirm rejection
    expect(mockDebugLog).toHaveBeenCalledWith(
      'archiveDirectives',
      expect.stringContaining('REJECTED'),
    );
    expect(mockDebugLog).toHaveBeenCalledWith(
      'archiveDirectives',
      expect.stringContaining('EXECUTE'),
    );
  });
});

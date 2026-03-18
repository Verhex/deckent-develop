import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getNextSprintId, updateLastSprintId, parseDebtTable, generateDebtTable } from '../../src/core/utils.js';
import { DebtPriority } from '../../src/core/types.js';
import type { DebtItem } from '../../src/core/types.js';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

const mockExistsSync = vi.mocked(existsSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

// Helper: make existsSync return true for sprints dir, false for config
function mockSprintsDirOnly() {
  mockExistsSync.mockImplementation((p: any) => {
    const path = String(p);
    if (path.endsWith('sprints')) return true;
    return false;
  });
}

// Helper: make existsSync return false for sprints dir, true for config
function mockConfigOnly() {
  mockExistsSync.mockImplementation((p: any) => {
    const path = String(p);
    if (path.endsWith('config.json')) return true;
    return false;
  });
}

// Helper: make existsSync return true for both sprints dir and config
function mockBothSources() {
  mockExistsSync.mockReturnValue(true);
}

describe('getNextSprintId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns sprint-001 when sprints directory does not exist and no config', () => {
    mockExistsSync.mockReturnValue(false);
    expect(getNextSprintId('/project')).toBe('sprint-001');
  });

  it('returns sprint-001 when sprints directory is empty and no config', () => {
    mockSprintsDirOnly();
    mockReaddirSync.mockReturnValue([]);
    expect(getNextSprintId('/project')).toBe('sprint-001');
  });

  it('returns sprint-002 when sprint-001.md exists (no config)', () => {
    mockSprintsDirOnly();
    mockReaddirSync.mockReturnValue(['sprint-001.md'] as any);
    expect(getNextSprintId('/project')).toBe('sprint-002');
  });

  it('returns correct increment with multiple sprints (no config)', () => {
    mockSprintsDirOnly();
    mockReaddirSync.mockReturnValue([
      'sprint-001.md',
      'sprint-002.md',
      'sprint-003.md',
    ] as any);
    expect(getNextSprintId('/project')).toBe('sprint-004');
  });

  it('handles non-sequential sprint files (finds max)', () => {
    mockSprintsDirOnly();
    mockReaddirSync.mockReturnValue([
      'sprint-001.md',
      'sprint-005.md',
      'sprint-003.md',
    ] as any);
    expect(getNextSprintId('/project')).toBe('sprint-006');
  });

  it('ignores non-sprint files in directory', () => {
    mockSprintsDirOnly();
    mockReaddirSync.mockReturnValue([
      'sprint-002.md',
      'README.md',
      'notes.txt',
      '.gitkeep',
    ] as any);
    expect(getNextSprintId('/project')).toBe('sprint-003');
  });

  it('ignores files that do not match sprint-NNN.md pattern', () => {
    mockSprintsDirOnly();
    mockReaddirSync.mockReturnValue([
      'sprint-abc.md',
      'sprint-.md',
      'sprint-1.txt',
      'sprint-001.md',
    ] as any);
    expect(getNextSprintId('/project')).toBe('sprint-002');
  });

  it('pads sprint number to 3 digits', () => {
    mockSprintsDirOnly();
    mockReaddirSync.mockReturnValue(['sprint-009.md'] as any);
    expect(getNextSprintId('/project')).toBe('sprint-010');
  });

  it('handles large sprint numbers', () => {
    mockSprintsDirOnly();
    mockReaddirSync.mockReturnValue(['sprint-099.md'] as any);
    expect(getNextSprintId('/project')).toBe('sprint-100');
  });

  it('returns sprint-001 when directory has only non-matching files', () => {
    mockSprintsDirOnly();
    mockReaddirSync.mockReturnValue([
      'README.md',
      'notes.txt',
    ] as any);
    expect(getNextSprintId('/project')).toBe('sprint-001');
  });

  // ─── Config-based fallback tests ──────────────────────────────────

  it('reads from config when sprint files are missing', () => {
    mockConfigOnly();
    mockReadFileSync.mockReturnValue(JSON.stringify({ last_sprint_id: 'sprint-015' }));
    expect(getNextSprintId('/project')).toBe('sprint-016');
  });

  it('takes max of config and files (config higher)', () => {
    mockBothSources();
    mockReaddirSync.mockReturnValue(['sprint-005.md'] as any);
    mockReadFileSync.mockReturnValue(JSON.stringify({ last_sprint_id: 'sprint-015' }));
    expect(getNextSprintId('/project')).toBe('sprint-016');
  });

  it('takes max of config and files (files higher)', () => {
    mockBothSources();
    mockReaddirSync.mockReturnValue(['sprint-020.md'] as any);
    mockReadFileSync.mockReturnValue(JSON.stringify({ last_sprint_id: 'sprint-015' }));
    expect(getNextSprintId('/project')).toBe('sprint-021');
  });

  it('never goes backward when files are deleted but config persists', () => {
    // Simulate: sprint files cleaned up, only config remains
    mockConfigOnly();
    mockReadFileSync.mockReturnValue(JSON.stringify({ last_sprint_id: 'sprint-016' }));
    expect(getNextSprintId('/project')).toBe('sprint-017');
  });

  it('handles numeric last_sprint_id in config', () => {
    mockConfigOnly();
    mockReadFileSync.mockReturnValue(JSON.stringify({ last_sprint_id: 10 }));
    expect(getNextSprintId('/project')).toBe('sprint-011');
  });

  it('handles malformed config JSON gracefully', () => {
    mockExistsSync.mockImplementation((p: any) => {
      const path = String(p);
      if (path.endsWith('config.json')) return true;
      return false;
    });
    mockReadFileSync.mockReturnValue('NOT VALID JSON {{{');
    expect(getNextSprintId('/project')).toBe('sprint-001');
  });

  it('handles config without last_sprint_id field', () => {
    mockConfigOnly();
    mockReadFileSync.mockReturnValue(JSON.stringify({ mode: 'max_plan' }));
    expect(getNextSprintId('/project')).toBe('sprint-001');
  });

  it('handles config with invalid last_sprint_id string', () => {
    mockConfigOnly();
    mockReadFileSync.mockReturnValue(JSON.stringify({ last_sprint_id: 'not-a-sprint' }));
    expect(getNextSprintId('/project')).toBe('sprint-001');
  });
});

// ─── updateLastSprintId tests ──────────────────────────────────────

describe('updateLastSprintId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes sprint ID to existing config', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ mode: 'max_plan', projectName: 'test' }));
    updateLastSprintId('/project', 'sprint-016');
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const written = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string);
    expect(written.last_sprint_id).toBe('sprint-016');
    expect(written.mode).toBe('max_plan');
    expect(written.projectName).toBe('test');
  });

  it('creates config if missing', () => {
    mockExistsSync.mockReturnValue(false);
    updateLastSprintId('/project', 'sprint-005');
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const written = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string);
    expect(written.last_sprint_id).toBe('sprint-005');
  });

  it('preserves existing config fields when updating', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      mode: 'max_plan',
      language: 'tr',
      last_sprint_id: 'sprint-010',
    }));
    updateLastSprintId('/project', 'sprint-016');
    const written = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string);
    expect(written.last_sprint_id).toBe('sprint-016');
    expect(written.mode).toBe('max_plan');
    expect(written.language).toBe('tr');
  });

  it('handles write errors gracefully (no throw)', () => {
    mockExistsSync.mockReturnValue(false);
    mockWriteFileSync.mockImplementation(() => { throw new Error('EACCES'); });
    // Should not throw
    expect(() => updateLastSprintId('/project', 'sprint-001')).not.toThrow();
  });

  it('handles malformed existing config gracefully', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('NOT VALID JSON');
    // Should not throw — creates fresh config
    expect(() => updateLastSprintId('/project', 'sprint-001')).not.toThrow();
  });
});

// ─── Sprint 12: parseDebtTable + generateDebtTable round-trip ─────
describe('parseDebtTable / generateDebtTable round-trip (3A)', () => {
  const sampleItems: DebtItem[] = [
    {
      id: 'debt-001',
      description: 'Missing tests for auth',
      originTaskId: '001-001',
      originSprintId: 'sprint-001',
      priority: DebtPriority.NORMAL,
      sprintsOpen: 1,
      resolved: false,
      createdAt: '2026-03-17T00:00:00Z',
    },
    {
      id: 'debt-002',
      description: 'Refactor config loader',
      originTaskId: '001-002',
      originSprintId: 'sprint-001',
      priority: DebtPriority.HIGH,
      sprintsOpen: 3,
      resolved: true,
      resolvedInSprintId: 'sprint-003',
      createdAt: '2026-03-16T00:00:00Z',
    },
  ];

  it('generates and parses debt table round-trip', () => {
    const table = generateDebtTable(sampleItems);
    const parsed = parseDebtTable(table);

    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.id).toBe('debt-001');
    expect(parsed[0]!.priority).toBe(DebtPriority.NORMAL);
    expect(parsed[0]!.resolved).toBe(false);
    expect(parsed[0]!.resolvedInSprintId).toBeUndefined();
    expect(parsed[1]!.id).toBe('debt-002');
    expect(parsed[1]!.resolved).toBe(true);
    expect(parsed[1]!.resolvedInSprintId).toBe('sprint-003');
    expect(parsed[1]!.sprintsOpen).toBe(3);
  });

  it('returns empty array for content with no table', () => {
    expect(parseDebtTable('# No table here')).toEqual([]);
  });

  it('skips rows with fewer than 9 columns', () => {
    const table = '| ID | Description |\n|---|---|\n| debt-x | short |';
    expect(parseDebtTable(table)).toEqual([]);
  });
});

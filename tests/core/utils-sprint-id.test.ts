import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getNextSprintId } from '../../src/core/utils.js';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    readFileSync: actual.readFileSync,
  };
});

import { existsSync, readdirSync } from 'node:fs';

const mockExistsSync = vi.mocked(existsSync);
const mockReaddirSync = vi.mocked(readdirSync);

describe('getNextSprintId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns sprint-001 when sprints directory does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    expect(getNextSprintId('/project')).toBe('sprint-001');
  });

  it('returns sprint-001 when sprints directory is empty', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([]);
    expect(getNextSprintId('/project')).toBe('sprint-001');
  });

  it('returns sprint-002 when sprint-001.md exists', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['sprint-001.md'] as any);
    expect(getNextSprintId('/project')).toBe('sprint-002');
  });

  it('returns correct increment with multiple sprints', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([
      'sprint-001.md',
      'sprint-002.md',
      'sprint-003.md',
    ] as any);
    expect(getNextSprintId('/project')).toBe('sprint-004');
  });

  it('handles non-sequential sprint files (finds max)', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([
      'sprint-001.md',
      'sprint-005.md',
      'sprint-003.md',
    ] as any);
    expect(getNextSprintId('/project')).toBe('sprint-006');
  });

  it('ignores non-sprint files in directory', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([
      'sprint-002.md',
      'README.md',
      'notes.txt',
      '.gitkeep',
    ] as any);
    expect(getNextSprintId('/project')).toBe('sprint-003');
  });

  it('ignores files that do not match sprint-NNN.md pattern', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([
      'sprint-abc.md',
      'sprint-.md',
      'sprint-1.txt',
      'sprint-001.md',
    ] as any);
    expect(getNextSprintId('/project')).toBe('sprint-002');
  });

  it('pads sprint number to 3 digits', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['sprint-009.md'] as any);
    expect(getNextSprintId('/project')).toBe('sprint-010');
  });

  it('handles large sprint numbers', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['sprint-099.md'] as any);
    expect(getNextSprintId('/project')).toBe('sprint-100');
  });

  it('returns sprint-001 when directory has only non-matching files', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([
      'README.md',
      'notes.txt',
    ] as any);
    expect(getNextSprintId('/project')).toBe('sprint-001');
  });
});

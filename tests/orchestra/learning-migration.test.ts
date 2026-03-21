import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';

import {
  migratePatternsToLearning,
  exportLearningData,
  importLearningData,
  inferTaskType,
} from '../../src/orchestra/learning-migration.js';
import type { LearningEntry } from '../../src/orchestra/pattern-recorder.js';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(),
  };
});

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockReaddirSync = vi.mocked(readdirSync);

describe('inferTaskType', () => {
  it('infers testing for test-related patterns', () => {
    expect(inferTaskType('test failures')).toBe('testing');
    expect(inferTaskType('coverage drop')).toBe('testing');
    expect(inferTaskType('vitest errors')).toBe('testing');
  });

  it('infers documentation for doc-related patterns', () => {
    expect(inferTaskType('doc update needed')).toBe('documentation');
    expect(inferTaskType('readme outdated')).toBe('documentation');
  });

  it('infers bugfix for fix-related patterns', () => {
    expect(inferTaskType('bug in parser')).toBe('bugfix');
    expect(inferTaskType('error handling')).toBe('bugfix');
  });

  it('infers monitoring for heartbeat patterns', () => {
    expect(inferTaskType('stale_heartbeat')).toBe('monitoring');
    expect(inferTaskType('health check')).toBe('monitoring');
  });

  it('infers concurrency for lock patterns', () => {
    expect(inferTaskType('deadlock detected')).toBe('concurrency');
    expect(inferTaskType('circular dependency')).toBe('concurrency');
  });

  it('returns null for unrecognized patterns', () => {
    expect(inferTaskType('xyz_unknown_pattern')).toBeNull();
    expect(inferTaskType('')).toBeNull();
  });
});

describe('migratePatternsToLearning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns zeros when PATTERNS.md does not exist', () => {
    mockExistsSync.mockReturnValueOnce(false);
    const result = migratePatternsToLearning('/repo');
    expect(result.migrated).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it('returns zeros for non-array JSON', () => {
    mockExistsSync.mockReturnValueOnce(true);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify({ not: 'array' }));

    const result = migratePatternsToLearning('/repo');
    expect(result.migrated).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it('returns zeros for malformed JSON', () => {
    mockExistsSync.mockReturnValueOnce(true);
    mockReadFileSync.mockReturnValueOnce('not json');

    const result = migratePatternsToLearning('/repo');
    expect(result.migrated).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it('migrates patterns with recognizable keywords', () => {
    mockExistsSync.mockReturnValueOnce(true); // PATTERNS.md exists
    mockReadFileSync.mockReturnValueOnce(JSON.stringify([
      {
        pattern: 'stale_heartbeat',
        occurrences: 5,
        firstDetectedInSprint: 'sprint-001',
        lastDetectedInSprint: 'sprint-010',
        resolved: false,
      },
    ]));
    mockExistsSync.mockReturnValueOnce(false); // learning dir does not exist
    mockExistsSync.mockReturnValueOnce(false); // sprint file does not exist

    const result = migratePatternsToLearning('/repo');
    expect(result.migrated).toBe(1);
    expect(result.skipped).toBe(0);
    expect(mockMkdirSync).toHaveBeenCalled();
    expect(mockWriteFileSync).toHaveBeenCalled();
  });

  it('skips patterns with no matching keywords', () => {
    mockExistsSync.mockReturnValueOnce(true);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify([
      {
        pattern: 'xyz_unknown_pattern',
        occurrences: 1,
        firstDetectedInSprint: 'sprint-001',
        lastDetectedInSprint: 'sprint-001',
        resolved: false,
      },
    ]));
    mockExistsSync.mockReturnValueOnce(true); // learning dir exists

    const result = migratePatternsToLearning('/repo');
    expect(result.migrated).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('sets evaluation to DONE for resolved patterns', () => {
    mockExistsSync.mockReturnValueOnce(true);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify([
      {
        pattern: 'test failure',
        occurrences: 2,
        firstDetectedInSprint: 'sprint-001',
        lastDetectedInSprint: 'sprint-005',
        resolved: true,
      },
    ]));
    mockExistsSync.mockReturnValueOnce(true); // learning dir exists
    mockExistsSync.mockReturnValueOnce(false); // sprint file

    migratePatternsToLearning('/repo');

    const written = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string) as LearningEntry[];
    expect(written[0]!.evaluation).toBe('DONE');
  });

  it('sets evaluation to NO_GO for unresolved patterns', () => {
    mockExistsSync.mockReturnValueOnce(true);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify([
      {
        pattern: 'stale_heartbeat',
        occurrences: 3,
        firstDetectedInSprint: 'sprint-001',
        lastDetectedInSprint: 'sprint-010',
        resolved: false,
      },
    ]));
    mockExistsSync.mockReturnValueOnce(true); // learning dir
    mockExistsSync.mockReturnValueOnce(false); // sprint file

    migratePatternsToLearning('/repo');

    const written = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string) as LearningEntry[];
    expect(written[0]!.evaluation).toBe('NO_GO');
  });
});

describe('exportLearningData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty sprints when directory does not exist', () => {
    mockExistsSync.mockReturnValueOnce(false);
    const result = JSON.parse(exportLearningData('/repo'));
    expect(result.sprints).toEqual({});
  });

  it('exports all sprint files as JSON', () => {
    mockExistsSync.mockReturnValueOnce(true);
    mockReaddirSync.mockReturnValueOnce(['sprint-001.json'] as unknown as ReturnType<typeof readdirSync>);
    const entries: LearningEntry[] = [{
      taskType: 'feature',
      agent: null,
      skills: [],
      model: 'opus',
      effort: 'high',
      evaluation: 'DONE',
      coverage: 90,
      durationMs: 5000,
      sprintId: 'sprint-001',
      recordedAt: '2026-01-01T00:00:00.000Z',
    }];
    mockReadFileSync.mockReturnValueOnce(JSON.stringify(entries));

    const result = JSON.parse(exportLearningData('/repo'));
    expect(result.sprints['sprint-001']).toHaveLength(1);
    expect(result.sprints['sprint-001'][0].taskType).toBe('feature');
  });

  it('excludes summary.json from export', () => {
    mockExistsSync.mockReturnValueOnce(true);
    mockReaddirSync.mockReturnValueOnce(['sprint-001.json', 'summary.json'] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify([]));

    const result = JSON.parse(exportLearningData('/repo'));
    expect(Object.keys(result.sprints)).toEqual(['sprint-001']);
  });
});

describe('importLearningData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns zero imported for invalid JSON', () => {
    const result = importLearningData('/repo', 'not json');
    expect(result.imported).toBe(0);
  });

  it('returns zero imported for non-object JSON', () => {
    const result = importLearningData('/repo', '"string"');
    expect(result.imported).toBe(0);
  });

  it('returns zero imported when sprints key is missing', () => {
    const result = importLearningData('/repo', JSON.stringify({ data: 'no sprints' }));
    expect(result.imported).toBe(0);
  });

  it('imports entries from valid backup data', () => {
    mockExistsSync.mockReturnValueOnce(false); // learning dir does not exist
    mockExistsSync.mockReturnValueOnce(false); // sprint file does not exist

    const data = JSON.stringify({
      sprints: {
        'sprint-001': [{
          taskType: 'feature',
          agent: null,
          skills: [],
          model: 'opus',
          effort: 'high',
          evaluation: 'DONE',
          coverage: 85,
          durationMs: 5000,
          sprintId: 'sprint-001',
          recordedAt: '2026-01-01T00:00:00.000Z',
        }],
      },
    });

    const result = importLearningData('/repo', data);
    expect(result.imported).toBe(1);
    expect(mockWriteFileSync).toHaveBeenCalled();
  });

  it('creates learning directory if it does not exist', () => {
    mockExistsSync.mockReturnValueOnce(false); // learning dir
    mockExistsSync.mockReturnValueOnce(false); // sprint file

    const data = JSON.stringify({
      sprints: {
        'sprint-001': [{
          taskType: 'feature',
          sprintId: 'sprint-001',
          agent: null,
          skills: [],
          model: 'opus',
          effort: 'high',
          evaluation: 'DONE',
          coverage: 0,
          durationMs: 0,
          recordedAt: '',
        }],
      },
    });

    importLearningData('/repo', data);
    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('.brain/learning'),
      { recursive: true },
    );
  });

  it('skips non-array sprint entries', () => {
    mockExistsSync.mockReturnValueOnce(true); // learning dir
    const data = JSON.stringify({
      sprints: {
        'sprint-001': 'not an array',
      },
    });

    const result = importLearningData('/repo', data);
    expect(result.imported).toBe(0);
  });

  it('filters out invalid entries during import', () => {
    mockExistsSync.mockReturnValueOnce(true); // learning dir
    mockExistsSync.mockReturnValueOnce(false); // sprint file

    const data = JSON.stringify({
      sprints: {
        'sprint-001': [
          { taskType: 'feature', sprintId: 'sprint-001' },  // valid (minimal)
          null,  // invalid
          'string',  // invalid
        ],
      },
    });

    const result = importLearningData('/repo', data);
    expect(result.imported).toBe(1);
  });
});

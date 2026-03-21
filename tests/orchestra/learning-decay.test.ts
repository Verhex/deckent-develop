import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs';

import { decayLearningData, compactPatterns, type SummaryData } from '../../src/orchestra/learning-decay.js';
import type { LearningEntry } from '../../src/orchestra/pattern-recorder.js';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    readdirSync: vi.fn(),
  };
});

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockUnlinkSync = vi.mocked(unlinkSync);
const mockReaddirSync = vi.mocked(readdirSync);

function makeEntry(overrides: Partial<LearningEntry> = {}): LearningEntry {
  return {
    taskType: 'feature',
    agent: 'worker-1',
    skills: ['typescript'],
    model: 'opus',
    effort: 'high',
    evaluation: 'DONE',
    coverage: 85,
    durationMs: 60000,
    sprintId: 'sprint-001',
    recordedAt: '2026-03-22T00:00:00.000Z',
    ...overrides,
  };
}

describe('decayLearningData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty arrays when learning directory does not exist', () => {
    mockExistsSync.mockReturnValueOnce(false);
    const result = decayLearningData('/repo');
    expect(result.removed).toEqual([]);
    expect(result.kept).toEqual([]);
  });

  it('keeps all files when count is within limit', () => {
    mockExistsSync.mockReturnValueOnce(true);
    mockReaddirSync.mockReturnValueOnce([
      'sprint-001.json', 'sprint-002.json', 'sprint-003.json',
    ] as unknown as ReturnType<typeof readdirSync>);

    const result = decayLearningData('/repo', 10);
    expect(result.removed).toEqual([]);
    expect(result.kept).toHaveLength(3);
  });

  it('removes oldest files when count exceeds limit', () => {
    mockExistsSync.mockReturnValueOnce(true);
    mockReaddirSync.mockReturnValueOnce([
      'sprint-001.json', 'sprint-002.json', 'sprint-003.json',
      'sprint-004.json', 'sprint-005.json',
    ] as unknown as ReturnType<typeof readdirSync>);

    const result = decayLearningData('/repo', 3);
    expect(result.removed).toEqual(['sprint-001', 'sprint-002']);
    expect(result.kept).toEqual(['sprint-003', 'sprint-004', 'sprint-005']);
  });

  it('calls unlinkSync for each removed file', () => {
    mockExistsSync.mockReturnValueOnce(true);
    mockReaddirSync.mockReturnValueOnce([
      'sprint-001.json', 'sprint-002.json', 'sprint-003.json',
    ] as unknown as ReturnType<typeof readdirSync>);

    decayLearningData('/repo', 1);
    expect(mockUnlinkSync).toHaveBeenCalledTimes(2);
    expect(mockUnlinkSync.mock.calls[0]![0]).toContain('sprint-001.json');
    expect(mockUnlinkSync.mock.calls[1]![0]).toContain('sprint-002.json');
  });

  it('uses default maxSprintsToKeep of 10', () => {
    mockExistsSync.mockReturnValueOnce(true);
    const files: string[] = [];
    for (let i = 1; i <= 12; i++) {
      files.push(`sprint-${String(i).padStart(3, '0')}.json`);
    }
    mockReaddirSync.mockReturnValueOnce(files as unknown as ReturnType<typeof readdirSync>);

    const result = decayLearningData('/repo');
    expect(result.removed).toHaveLength(2);
    expect(result.kept).toHaveLength(10);
  });

  it('excludes summary.json from decay consideration', () => {
    mockExistsSync.mockReturnValueOnce(true);
    mockReaddirSync.mockReturnValueOnce([
      'sprint-001.json', 'sprint-002.json', 'summary.json',
    ] as unknown as ReturnType<typeof readdirSync>);

    const result = decayLearningData('/repo', 2);
    expect(result.kept).toEqual(['sprint-001', 'sprint-002']);
    expect(result.removed).toEqual([]);
  });

  it('does not throw when unlinkSync fails', () => {
    mockExistsSync.mockReturnValueOnce(true);
    mockReaddirSync.mockReturnValueOnce([
      'sprint-001.json', 'sprint-002.json',
    ] as unknown as ReturnType<typeof readdirSync>);
    mockUnlinkSync.mockImplementation(() => { throw new Error('EPERM'); });

    expect(() => decayLearningData('/repo', 1)).not.toThrow();
  });

  it('keeps exactly maxSprintsToKeep files', () => {
    mockExistsSync.mockReturnValueOnce(true);
    const files = Array.from({ length: 20 }, (_, i) =>
      `sprint-${String(i + 1).padStart(3, '0')}.json`,
    );
    mockReaddirSync.mockReturnValueOnce(files as unknown as ReturnType<typeof readdirSync>);

    const result = decayLearningData('/repo', 5);
    expect(result.kept).toHaveLength(5);
    expect(result.removed).toHaveLength(15);
  });
});

describe('compactPatterns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns zero combination count when directory does not exist', () => {
    mockExistsSync.mockReturnValueOnce(false);
    const result = compactPatterns('/repo');
    expect(result.combinationCount).toBe(0);
  });

  it('creates summary.json from entries', () => {
    mockExistsSync.mockReturnValueOnce(true);
    mockReaddirSync.mockReturnValueOnce(['sprint-001.json'] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify([
      makeEntry({ taskType: 'feature', model: 'opus', evaluation: 'DONE' }),
    ]));

    compactPatterns('/repo');
    expect(mockWriteFileSync).toHaveBeenCalledOnce();
    const writePath = mockWriteFileSync.mock.calls[0]![0] as string;
    expect(writePath).toContain('summary.json');
  });

  it('groups entries by combo key', () => {
    mockExistsSync.mockReturnValueOnce(true);
    mockReaddirSync.mockReturnValueOnce(['sprint-001.json'] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify([
      makeEntry({ taskType: 'feature', agent: 'w1', skills: ['ts'], model: 'opus', evaluation: 'DONE', coverage: 90 }),
      makeEntry({ taskType: 'feature', agent: 'w1', skills: ['ts'], model: 'opus', evaluation: 'DONE', coverage: 80 }),
      makeEntry({ taskType: 'bugfix', agent: 'w2', skills: [], model: 'sonnet', evaluation: 'NO_GO', coverage: 0 }),
    ]));

    const result = compactPatterns('/repo');
    expect(result.combinationCount).toBe(2);

    const written = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string) as SummaryData;
    const featureKey = 'feature|w1|ts|opus';
    expect(written[featureKey]).toBeDefined();
    expect(written[featureKey]!.uses).toBe(2);
    expect(written[featureKey]!.successes).toBe(2);
    expect(written[featureKey]!.avgCoverage).toBe(85);
  });

  it('counts successes and failures correctly', () => {
    mockExistsSync.mockReturnValueOnce(true);
    mockReaddirSync.mockReturnValueOnce(['sprint-001.json'] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify([
      makeEntry({ evaluation: 'DONE' }),
      makeEntry({ evaluation: 'DONE' }),
      makeEntry({ evaluation: 'NO_GO' }),
      makeEntry({ evaluation: 'GO_WITH_TECH_DEBT' }),
    ]));

    compactPatterns('/repo');
    const written = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string) as SummaryData;
    const key = 'feature|worker-1|typescript|opus';
    expect(written[key]!.uses).toBe(4);
    expect(written[key]!.successes).toBe(2);
    expect(written[key]!.failures).toBe(1);
  });

  it('reads entries across multiple sprint files', () => {
    mockExistsSync.mockReturnValueOnce(true);
    mockReaddirSync.mockReturnValueOnce([
      'sprint-001.json', 'sprint-002.json',
    ] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify([makeEntry()]));
    mockReadFileSync.mockReturnValueOnce(JSON.stringify([makeEntry()]));

    const result = compactPatterns('/repo');
    expect(result.combinationCount).toBe(1);

    const written = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string) as SummaryData;
    const key = 'feature|worker-1|typescript|opus';
    expect(written[key]!.uses).toBe(2);
  });
});

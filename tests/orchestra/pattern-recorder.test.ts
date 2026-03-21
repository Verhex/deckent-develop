import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';

import { PatternRecorder, type LearningEntry } from '../../src/orchestra/pattern-recorder.js';

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

describe('PatternRecorder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('record', () => {
    it('creates learning directory if it does not exist', () => {
      mockExistsSync.mockReturnValueOnce(false); // ensureDir check
      mockExistsSync.mockReturnValueOnce(false); // readSprintFile check
      const recorder = new PatternRecorder('/repo');
      recorder.record(makeEntry());

      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.brain/learning'),
        { recursive: true },
      );
    });

    it('writes new entry to sprint file when file does not exist', () => {
      mockExistsSync.mockReturnValueOnce(true);  // ensureDir — dir exists
      mockExistsSync.mockReturnValueOnce(false);  // readSprintFile — file doesn't exist
      const recorder = new PatternRecorder('/repo');
      const entry = makeEntry();
      recorder.record(entry);

      expect(mockWriteFileSync).toHaveBeenCalledOnce();
      const written = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string);
      expect(written).toHaveLength(1);
      expect(written[0].taskType).toBe('feature');
    });

    it('appends to existing sprint file', () => {
      const existing = [makeEntry({ taskType: 'bugfix' })];
      mockExistsSync.mockReturnValueOnce(true);  // ensureDir
      mockExistsSync.mockReturnValueOnce(true);  // readSprintFile — file exists
      mockReadFileSync.mockReturnValueOnce(JSON.stringify(existing));

      const recorder = new PatternRecorder('/repo');
      recorder.record(makeEntry({ taskType: 'feature' }));

      const written = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string);
      expect(written).toHaveLength(2);
      expect(written[0].taskType).toBe('bugfix');
      expect(written[1].taskType).toBe('feature');
    });

    it('writes to correct sprint file path', () => {
      mockExistsSync.mockReturnValueOnce(true);
      mockExistsSync.mockReturnValueOnce(false);
      const recorder = new PatternRecorder('/repo');
      recorder.record(makeEntry({ sprintId: 'sprint-042' }));

      const writePath = mockWriteFileSync.mock.calls[0]![0] as string;
      expect(writePath).toContain('sprint-042.json');
    });

    it('handles malformed existing file by treating as empty', () => {
      mockExistsSync.mockReturnValueOnce(true);
      mockExistsSync.mockReturnValueOnce(true);
      mockReadFileSync.mockReturnValueOnce('not valid json');

      const recorder = new PatternRecorder('/repo');
      recorder.record(makeEntry());

      const written = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string);
      expect(written).toHaveLength(1);
    });

    it('handles non-array existing file by treating as empty', () => {
      mockExistsSync.mockReturnValueOnce(true);
      mockExistsSync.mockReturnValueOnce(true);
      mockReadFileSync.mockReturnValueOnce(JSON.stringify({ not: 'an array' }));

      const recorder = new PatternRecorder('/repo');
      recorder.record(makeEntry());

      const written = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string);
      expect(written).toHaveLength(1);
    });

    it('preserves all fields from the entry', () => {
      mockExistsSync.mockReturnValueOnce(true);
      mockExistsSync.mockReturnValueOnce(false);
      const recorder = new PatternRecorder('/repo');
      const entry = makeEntry({
        agent: null,
        skills: ['react', 'testing'],
        coverage: 92.5,
      });
      recorder.record(entry);

      const written = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string);
      expect(written[0].agent).toBeNull();
      expect(written[0].skills).toEqual(['react', 'testing']);
      expect(written[0].coverage).toBe(92.5);
    });
  });

  describe('readSprint', () => {
    it('returns empty array when sprint file does not exist', () => {
      mockExistsSync.mockReturnValueOnce(false);
      const recorder = new PatternRecorder('/repo');
      expect(recorder.readSprint('sprint-001')).toEqual([]);
    });

    it('returns entries from existing sprint file', () => {
      const entries = [makeEntry(), makeEntry({ taskType: 'bugfix' })];
      mockExistsSync.mockReturnValueOnce(true);
      mockReadFileSync.mockReturnValueOnce(JSON.stringify(entries));

      const recorder = new PatternRecorder('/repo');
      const result = recorder.readSprint('sprint-001');
      expect(result).toHaveLength(2);
      expect(result[0]!.taskType).toBe('feature');
      expect(result[1]!.taskType).toBe('bugfix');
    });

    it('returns empty array for malformed JSON', () => {
      mockExistsSync.mockReturnValueOnce(true);
      mockReadFileSync.mockReturnValueOnce('invalid');

      const recorder = new PatternRecorder('/repo');
      expect(recorder.readSprint('sprint-001')).toEqual([]);
    });

    it('returns empty array when readFileSync throws', () => {
      mockExistsSync.mockReturnValueOnce(true);
      mockReadFileSync.mockImplementationOnce(() => { throw new Error('ENOENT'); });

      const recorder = new PatternRecorder('/repo');
      expect(recorder.readSprint('sprint-001')).toEqual([]);
    });
  });

  describe('listSprints', () => {
    it('returns empty array when learning directory does not exist', () => {
      mockExistsSync.mockReturnValueOnce(false);
      const recorder = new PatternRecorder('/repo');
      expect(recorder.listSprints()).toEqual([]);
    });

    it('lists sprint IDs from files', () => {
      mockExistsSync.mockReturnValueOnce(true);
      mockReaddirSync.mockReturnValueOnce(['sprint-001.json', 'sprint-002.json', 'sprint-003.json'] as unknown as ReturnType<typeof readdirSync>);

      const recorder = new PatternRecorder('/repo');
      const result = recorder.listSprints();
      expect(result).toEqual(['sprint-001', 'sprint-002', 'sprint-003']);
    });

    it('excludes summary.json from list', () => {
      mockExistsSync.mockReturnValueOnce(true);
      mockReaddirSync.mockReturnValueOnce(['sprint-001.json', 'summary.json'] as unknown as ReturnType<typeof readdirSync>);

      const recorder = new PatternRecorder('/repo');
      expect(recorder.listSprints()).toEqual(['sprint-001']);
    });

    it('excludes non-JSON files', () => {
      mockExistsSync.mockReturnValueOnce(true);
      mockReaddirSync.mockReturnValueOnce(['sprint-001.json', 'README.md', '.gitkeep'] as unknown as ReturnType<typeof readdirSync>);

      const recorder = new PatternRecorder('/repo');
      expect(recorder.listSprints()).toEqual(['sprint-001']);
    });

    it('returns sorted sprint IDs', () => {
      mockExistsSync.mockReturnValueOnce(true);
      mockReaddirSync.mockReturnValueOnce(['sprint-003.json', 'sprint-001.json', 'sprint-002.json'] as unknown as ReturnType<typeof readdirSync>);

      const recorder = new PatternRecorder('/repo');
      expect(recorder.listSprints()).toEqual(['sprint-001', 'sprint-002', 'sprint-003']);
    });

    it('returns empty array when readdirSync throws', () => {
      mockExistsSync.mockReturnValueOnce(true);
      mockReaddirSync.mockImplementationOnce(() => { throw new Error('EPERM'); });

      const recorder = new PatternRecorder('/repo');
      expect(recorder.listSprints()).toEqual([]);
    });
  });
});

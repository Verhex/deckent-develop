import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProgressPersistence } from '../../../src/cli/helpers/progress-persistence.js';
import type { FsAdapter, ProgressState } from '../../../src/cli/helpers/progress-persistence.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeState(overrides: Partial<ProgressState> = {}): ProgressState {
  return {
    sprintId: 'sprint-001',
    phase: 'EXECUTE',
    tasksTotal: 10,
    tasksDone: 3,
    tasksActive: 2,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeMockFs(files: Record<string, string> = {}): FsAdapter {
  const store = new Map<string, string>(Object.entries(files));
  const dirs = new Set<string>();

  return {
    existsSync: vi.fn((path: string) => store.has(path) || dirs.has(path)),
    mkdirSync: vi.fn((path: string) => { dirs.add(path); }),
    readFileSync: vi.fn((path: string) => {
      const content = store.get(path);
      if (content === undefined) throw new Error(`ENOENT: no such file: ${path}`);
      return content;
    }),
    writeFileSync: vi.fn((path: string, data: string) => { store.set(path, data); }),
    unlinkSync: vi.fn((path: string) => { store.delete(path); }),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('ProgressPersistence', () => {
  let mockFs: FsAdapter;
  let persistence: ProgressPersistence;

  beforeEach(() => {
    mockFs = makeMockFs();
    persistence = new ProgressPersistence('/project/.tasks', mockFs);
  });

  // ─── save ─────────────────────────────────────────────────────────

  describe('save', () => {
    it('writes state to progress file', () => {
      const state = makeState();
      persistence.save(state);

      expect(mockFs.writeFileSync).toHaveBeenCalledTimes(1);
      const [path, data] = (mockFs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string, string];
      expect(path).toContain('.progress-state.json');
      const parsed = JSON.parse(data) as ProgressState;
      expect(parsed.sprintId).toBe('sprint-001');
    });

    it('creates directory if it does not exist', () => {
      persistence.save(makeState());
      expect(mockFs.mkdirSync).toHaveBeenCalled();
    });

    it('preserves all state fields', () => {
      const state = makeState({ tasksDone: 7, tasksActive: 1 });
      persistence.save(state);

      const data = (mockFs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;
      const parsed = JSON.parse(data) as ProgressState;
      expect(parsed.tasksDone).toBe(7);
      expect(parsed.tasksActive).toBe(1);
    });
  });

  // ─── load ─────────────────────────────────────────────────────────

  describe('load', () => {
    it('returns null when file does not exist', () => {
      const result = persistence.load();
      expect(result).toBeNull();
    });

    it('returns state when file exists', () => {
      const state = makeState();
      persistence.save(state);
      // Now mock existsSync to return true for the file path
      const filePath = persistence.getFilePath();
      const fs2 = makeMockFs({ [filePath]: JSON.stringify(state) });
      const p2 = new ProgressPersistence('/project/.tasks', fs2);
      const result = p2.load();
      expect(result).not.toBeNull();
      expect(result!.sprintId).toBe('sprint-001');
    });

    it('returns null for invalid JSON', () => {
      const filePath = persistence.getFilePath();
      const fs2 = makeMockFs({ [filePath]: 'not-json{{{' });
      const p2 = new ProgressPersistence('/project/.tasks', fs2);
      const result = p2.load();
      expect(result).toBeNull();
    });
  });

  // ─── isProgressStale ──────────────────────────────────────────────

  describe('isProgressStale', () => {
    it('returns true when no file exists', () => {
      expect(persistence.isProgressStale()).toBe(true);
    });

    it('returns true when state is older than 10 minutes', () => {
      const oldTime = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const state = makeState({ updatedAt: oldTime });
      const filePath = persistence.getFilePath();
      const fs2 = makeMockFs({ [filePath]: JSON.stringify(state) });
      const p2 = new ProgressPersistence('/project/.tasks', fs2);
      expect(p2.isProgressStale()).toBe(true);
    });

    it('returns false when state is fresh', () => {
      const freshTime = new Date().toISOString();
      const state = makeState({ updatedAt: freshTime });
      const filePath = persistence.getFilePath();
      const fs2 = makeMockFs({ [filePath]: JSON.stringify(state) });
      const p2 = new ProgressPersistence('/project/.tasks', fs2);
      expect(p2.isProgressStale()).toBe(false);
    });

    it('returns true for invalid updatedAt timestamp', () => {
      const state = makeState({ updatedAt: 'not-a-date' });
      const filePath = persistence.getFilePath();
      const fs2 = makeMockFs({ [filePath]: JSON.stringify(state) });
      const p2 = new ProgressPersistence('/project/.tasks', fs2);
      expect(p2.isProgressStale()).toBe(true);
    });

    it('accepts custom nowMs parameter', () => {
      const updatedAt = '2026-03-22T10:00:00.000Z';
      const state = makeState({ updatedAt });
      const filePath = persistence.getFilePath();
      const fs2 = makeMockFs({ [filePath]: JSON.stringify(state) });
      const p2 = new ProgressPersistence('/project/.tasks', fs2);

      // 5 minutes later -- not stale
      const fiveMinLater = new Date('2026-03-22T10:05:00.000Z').getTime();
      expect(p2.isProgressStale(fiveMinLater)).toBe(false);

      // 15 minutes later -- stale
      const fifteenMinLater = new Date('2026-03-22T10:15:00.000Z').getTime();
      expect(p2.isProgressStale(fifteenMinLater)).toBe(true);
    });
  });

  // ─── clear ────────────────────────────────────────────────────────

  describe('clear', () => {
    it('deletes the file when it exists', () => {
      const filePath = persistence.getFilePath();
      const fs2 = makeMockFs({ [filePath]: '{}' });
      const p2 = new ProgressPersistence('/project/.tasks', fs2);
      p2.clear();
      expect(fs2.unlinkSync).toHaveBeenCalledWith(filePath);
    });

    it('does nothing when file does not exist', () => {
      persistence.clear();
      expect(mockFs.unlinkSync).not.toHaveBeenCalled();
    });
  });

  // ─── getFilePath ──────────────────────────────────────────────────

  describe('getFilePath', () => {
    it('returns the expected path', () => {
      const filePath = persistence.getFilePath();
      expect(filePath).toContain('.tasks');
      expect(filePath).toContain('.progress-state.json');
    });
  });
});

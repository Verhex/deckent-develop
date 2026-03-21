import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

import * as fs from 'node:fs';
import { SelectiveRetry } from '../../../src/cli/helpers/selective-retry.js';
import type { Task } from '../../../src/core/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: '001',
    title: 'Test task',
    description: 'A test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: 'DONE' as any,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('SelectiveRetry', () => {
  let retry: SelectiveRetry;

  beforeEach(() => {
    vi.clearAllMocks();
    retry = new SelectiveRetry('/mock/.tasks');
  });

  describe('queueForRetry', () => {
    it('writes retry queue to file', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('not found'); });
      retry.queueForRetry(['001', '002'], 'sprint-001');
      expect(fs.writeFileSync).toHaveBeenCalled();
      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0]![1] as string);
      expect(written.taskIds).toEqual(['001', '002']);
      expect(written.sprintId).toBe('sprint-001');
    });

    it('merges with existing queue', () => {
      const existing = { sprintId: 'sprint-001', taskIds: ['001'], createdAt: '2026-01-01T00:00:00Z' };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existing));
      retry.queueForRetry(['002'], 'sprint-001');
      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0]![1] as string);
      expect(written.taskIds).toContain('001');
      expect(written.taskIds).toContain('002');
    });

    it('deduplicates task ids on merge', () => {
      const existing = { sprintId: 'sprint-001', taskIds: ['001'], createdAt: '2026-01-01T00:00:00Z' };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existing));
      retry.queueForRetry(['001', '002'], 'sprint-001');
      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0]![1] as string);
      expect(written.taskIds).toEqual(['001', '002']);
    });

    it('creates directory if not exists', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('not found'); });
      retry.queueForRetry(['001'], 'sprint-001');
      expect(fs.mkdirSync).toHaveBeenCalled();
    });
  });

  describe('getRetryQueue', () => {
    it('returns queue when file exists', () => {
      const queue = { sprintId: 'sprint-001', taskIds: ['001', '002'], createdAt: '2026-01-01T00:00:00Z' };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(queue));
      const result = retry.getRetryQueue('sprint-001');
      expect(result).not.toBeNull();
      expect(result!.taskIds).toEqual(['001', '002']);
    });

    it('returns null when file does not exist', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
      expect(retry.getRetryQueue('sprint-001')).toBeNull();
    });

    it('returns null for malformed JSON', () => {
      vi.mocked(fs.readFileSync).mockReturnValue('INVALID');
      expect(retry.getRetryQueue('sprint-001')).toBeNull();
    });
  });

  describe('clearRetryQueue', () => {
    it('deletes the queue file', () => {
      retry.clearRetryQueue('sprint-001');
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('does not throw when file does not exist', () => {
      vi.mocked(fs.unlinkSync).mockImplementation(() => { throw new Error('ENOENT'); });
      expect(() => retry.clearRetryQueue('sprint-001')).not.toThrow();
    });
  });

  describe('generateRetryDirectives', () => {
    it('generates directives for retry tasks', () => {
      const tasks = [
        makeTask({ id: '001', title: 'Fix API', description: 'Fix the API endpoint' }),
        makeTask({ id: '002', title: 'Add tests', description: 'Add unit tests' }),
      ];
      const result = retry.generateRetryDirectives(['001', '002'], tasks);
      expect(result).toContain('DIRECTIVES');
      expect(result).toContain('Retry');
      expect(result).toContain('Fix API (retry)');
      expect(result).toContain('Add tests (retry)');
    });

    it('handles unknown task ids gracefully', () => {
      const result = retry.generateRetryDirectives(['999'], []);
      expect(result).toContain('Retry task 999');
    });

    it('includes model and effort from original task', () => {
      const tasks = [makeTask({ id: '001', model: 'opus', effort: 'high' })];
      const result = retry.generateRetryDirectives(['001'], tasks);
      expect(result).toContain('opus');
      expect(result).toContain('high');
    });

    it('generates numbered tasks', () => {
      const tasks = [makeTask({ id: '001' }), makeTask({ id: '002' })];
      const result = retry.generateRetryDirectives(['001', '002'], tasks);
      expect(result).toContain('Task 1:');
      expect(result).toContain('Task 2:');
    });

    it('uses default model for unknown tasks', () => {
      const result = retry.generateRetryDirectives(['999'], []);
      expect(result).toContain('opus');
    });
  });
});

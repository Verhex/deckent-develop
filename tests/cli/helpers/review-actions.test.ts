import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import * as fs from 'node:fs';
import { ReviewActions } from '../../../src/cli/helpers/review-actions.js';

// ─── Tests ───────────────────────────────────────────────────────────

describe('ReviewActions', () => {
  let actions: ReviewActions;

  beforeEach(() => {
    vi.clearAllMocks();
    actions = new ReviewActions('/mock/.tasks');
  });

  describe('approveTask', () => {
    it('creates new review entry with approved decision', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('not found'); });
      vi.mocked(fs.existsSync).mockReturnValue(false);
      actions.approveTask('001', 'sprint-001');
      expect(fs.writeFileSync).toHaveBeenCalled();
      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0]![1] as string);
      expect(written.entries).toHaveLength(1);
      expect(written.entries[0].taskId).toBe('001');
      expect(written.entries[0].decision).toBe('approved');
    });

    it('updates existing review entry', () => {
      const existing = {
        sprintId: 'sprint-001',
        entries: [{ taskId: '001', decision: 'pending' }],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existing));
      actions.approveTask('001', 'sprint-001');
      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0]![1] as string);
      expect(written.entries).toHaveLength(1);
      expect(written.entries[0].decision).toBe('approved');
    });

    it('sets reviewedAt timestamp', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('not found'); });
      actions.approveTask('001', 'sprint-001');
      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0]![1] as string);
      expect(written.entries[0].reviewedAt).toBeDefined();
    });
  });

  describe('rejectTask', () => {
    it('creates rejected entry with reason', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('not found'); });
      actions.rejectTask('002', 'sprint-001', 'Tests failed');
      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0]![1] as string);
      expect(written.entries[0].decision).toBe('rejected');
      expect(written.entries[0].reason).toBe('Tests failed');
    });

    it('updates existing entry with rejection', () => {
      const existing = {
        sprintId: 'sprint-001',
        entries: [{ taskId: '002', decision: 'approved' }],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existing));
      actions.rejectTask('002', 'sprint-001', 'New bugs found');
      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0]![1] as string);
      expect(written.entries[0].decision).toBe('rejected');
      expect(written.entries[0].reason).toBe('New bugs found');
    });
  });

  describe('retryTask', () => {
    it('creates retry entry', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('not found'); });
      actions.retryTask('003', 'sprint-001', 'Flaky test');
      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0]![1] as string);
      expect(written.entries[0].decision).toBe('retry');
      expect(written.entries[0].reason).toBe('Flaky test');
    });
  });

  describe('getReviewStatus', () => {
    it('returns review entry for existing task', () => {
      const existing = {
        sprintId: 'sprint-001',
        entries: [{ taskId: '001', decision: 'approved', reviewedAt: '2026-01-01T00:00:00Z' }],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existing));
      const status = actions.getReviewStatus('001', 'sprint-001');
      expect(status).not.toBeNull();
      expect(status!.decision).toBe('approved');
    });

    it('returns null for non-existent task', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('not found'); });
      const status = actions.getReviewStatus('999', 'sprint-001');
      expect(status).toBeNull();
    });
  });

  describe('getAllReviewStatuses', () => {
    it('returns map of all statuses', () => {
      const existing = {
        sprintId: 'sprint-001',
        entries: [
          { taskId: '001', decision: 'approved' },
          { taskId: '002', decision: 'rejected' },
        ],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existing));
      const statuses = actions.getAllReviewStatuses('sprint-001');
      expect(statuses.get('001')).toBe('approved');
      expect(statuses.get('002')).toBe('rejected');
    });
  });

  describe('isReviewComplete', () => {
    it('returns false when entries are empty', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('not found'); });
      expect(actions.isReviewComplete('sprint-001')).toBe(false);
    });

    it('returns false when pending entries exist', () => {
      const state = {
        sprintId: 'sprint-001',
        entries: [
          { taskId: '001', decision: 'approved' },
          { taskId: '002', decision: 'pending' },
        ],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(state));
      expect(actions.isReviewComplete('sprint-001')).toBe(false);
    });

    it('returns true when all entries are decided', () => {
      const state = {
        sprintId: 'sprint-001',
        entries: [
          { taskId: '001', decision: 'approved' },
          { taskId: '002', decision: 'rejected' },
        ],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(state));
      expect(actions.isReviewComplete('sprint-001')).toBe(true);
    });

    it('counts retry as decided', () => {
      const state = {
        sprintId: 'sprint-001',
        entries: [
          { taskId: '001', decision: 'retry' },
        ],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(state));
      expect(actions.isReviewComplete('sprint-001')).toBe(true);
    });
  });

  describe('loadState', () => {
    it('returns fresh state when file does not exist', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
      const state = actions.loadState('sprint-001');
      expect(state.sprintId).toBe('sprint-001');
      expect(state.entries).toEqual([]);
    });

    it('returns parsed state when file exists', () => {
      const saved = {
        sprintId: 'sprint-001',
        entries: [{ taskId: '001', decision: 'approved' }],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(saved));
      const state = actions.loadState('sprint-001');
      expect(state.entries).toHaveLength(1);
    });
  });

  describe('saveState', () => {
    it('writes state to file', () => {
      const state = {
        sprintId: 'sprint-001',
        entries: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      actions.saveState(state);
      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });
});

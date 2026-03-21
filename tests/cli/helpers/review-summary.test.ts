import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import * as fs from 'node:fs';
import { ReviewSummary } from '../../../src/cli/helpers/review-summary.js';
import type { ReviewDecision } from '../../../src/cli/helpers/review-actions.js';

// ─── Tests ───────────────────────────────────────────────────────────

describe('ReviewSummary', () => {
  let summary: ReviewSummary;

  beforeEach(() => {
    vi.clearAllMocks();
    summary = new ReviewSummary();
  });

  describe('generate', () => {
    it('counts approved tasks correctly', () => {
      const statuses = new Map<string, ReviewDecision>([
        ['001', 'approved'],
        ['002', 'approved'],
        ['003', 'rejected'],
      ]);
      const result = summary.generate('sprint-001', statuses);
      expect(result.approvedCount).toBe(2);
      expect(result.rejectedCount).toBe(1);
    });

    it('counts pending tasks', () => {
      const statuses = new Map<string, ReviewDecision>([
        ['001', 'approved'],
        ['002', 'pending'],
      ]);
      const result = summary.generate('sprint-001', statuses);
      expect(result.pendingCount).toBe(1);
    });

    it('counts retry tasks', () => {
      const statuses = new Map<string, ReviewDecision>([
        ['001', 'retry'],
        ['002', 'retry'],
      ]);
      const result = summary.generate('sprint-001', statuses);
      expect(result.retryQueuedCount).toBe(2);
    });

    it('includes rejection reasons', () => {
      const statuses = new Map<string, ReviewDecision>([['001', 'rejected']]);
      const reasons = new Map([['001', 'Tests failed']]);
      const result = summary.generate('sprint-001', statuses, reasons);
      expect(result.rejectedTasks).toHaveLength(1);
      expect(result.rejectedTasks[0]!.reason).toBe('Tests failed');
    });

    it('includes retry task ids when provided', () => {
      const statuses = new Map<string, ReviewDecision>([['001', 'approved']]);
      const result = summary.generate('sprint-001', statuses, undefined, ['002', '003']);
      expect(result.retryTasks).toEqual(['002', '003']);
      expect(result.retryQueuedCount).toBe(2);
    });

    it('auto-collects retry tasks from statuses when no explicit list', () => {
      const statuses = new Map<string, ReviewDecision>([
        ['001', 'retry'],
        ['002', 'approved'],
      ]);
      const result = summary.generate('sprint-001', statuses);
      expect(result.retryTasks).toContain('001');
      expect(result.retryTasks).not.toContain('002');
    });

    it('returns total reviewed count', () => {
      const statuses = new Map<string, ReviewDecision>([
        ['001', 'approved'],
        ['002', 'rejected'],
        ['003', 'pending'],
      ]);
      const result = summary.generate('sprint-001', statuses);
      expect(result.totalReviewed).toBe(3);
    });

    it('returns sprint id', () => {
      const statuses = new Map<string, ReviewDecision>();
      const result = summary.generate('sprint-042', statuses);
      expect(result.sprintId).toBe('sprint-042');
    });

    it('handles empty status map', () => {
      const statuses = new Map<string, ReviewDecision>();
      const result = summary.generate('sprint-001', statuses);
      expect(result.totalReviewed).toBe(0);
      expect(result.approvedCount).toBe(0);
      expect(result.rejectedCount).toBe(0);
      expect(result.pendingCount).toBe(0);
    });
  });

  describe('formatReviewSummary', () => {
    it('includes sprint id in output', () => {
      const data = summary.generate(
        'sprint-001',
        new Map([['001', 'approved' as ReviewDecision]]),
      );
      const output = summary.formatReviewSummary(data);
      expect(output).toContain('sprint-001');
    });

    it('includes counts in output', () => {
      const data = summary.generate(
        'sprint-001',
        new Map<string, ReviewDecision>([
          ['001', 'approved'],
          ['002', 'rejected'],
        ]),
      );
      const output = summary.formatReviewSummary(data);
      expect(output).toContain('Approved: 1');
      expect(output).toContain('Rejected: 1');
    });

    it('lists rejected tasks with reasons', () => {
      const statuses = new Map<string, ReviewDecision>([['001', 'rejected']]);
      const reasons = new Map([['001', 'Coverage too low']]);
      const data = summary.generate('sprint-001', statuses, reasons);
      const output = summary.formatReviewSummary(data);
      expect(output).toContain('001');
      expect(output).toContain('Coverage too low');
    });

    it('lists retry queued tasks', () => {
      const statuses = new Map<string, ReviewDecision>([['001', 'approved']]);
      const data = summary.generate('sprint-001', statuses, undefined, ['002']);
      const output = summary.formatReviewSummary(data);
      expect(output).toContain('Retry queued');
      expect(output).toContain('002');
    });

    it('does not show sections when no rejected or retry', () => {
      const data = summary.generate(
        'sprint-001',
        new Map([['001', 'approved' as ReviewDecision]]),
      );
      const output = summary.formatReviewSummary(data);
      expect(output).not.toContain('Rejected tasks:');
      expect(output).not.toContain('Retry queued:');
    });
  });

  describe('writeReviewReport', () => {
    it('writes markdown report to file', () => {
      const data = summary.generate(
        'sprint-001',
        new Map<string, ReviewDecision>([
          ['001', 'approved'],
          ['002', 'rejected'],
        ]),
        new Map([['002', 'Tests failed']]),
      );
      summary.writeReviewReport(data, '/mock/.brain/reviews/sprint-001.md');
      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
      const written = vi.mocked(fs.writeFileSync).mock.calls[0]![1] as string;
      expect(written).toContain('# Review Report: sprint-001');
      expect(written).toContain('Approved: 1');
      expect(written).toContain('Rejected: 1');
      expect(written).toContain('Tests failed');
    });

    it('includes retry queue in report', () => {
      const data = summary.generate(
        'sprint-001',
        new Map([['001', 'approved' as ReviewDecision]]),
        undefined,
        ['003', '004'],
      );
      summary.writeReviewReport(data, '/mock/.brain/reviews/sprint-001.md');
      const written = vi.mocked(fs.writeFileSync).mock.calls[0]![1] as string;
      expect(written).toContain('## Retry Queue');
      expect(written).toContain('003');
      expect(written).toContain('004');
    });

    it('creates directory recursively', () => {
      const data = summary.generate('sprint-001', new Map());
      summary.writeReviewReport(data, '/mock/.brain/reviews/sprint-001.md');
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('reviews'),
        { recursive: true },
      );
    });

    it('writes valid markdown with header', () => {
      const data = summary.generate('sprint-042', new Map());
      summary.writeReviewReport(data, '/mock/output.md');
      const written = vi.mocked(fs.writeFileSync).mock.calls[0]![1] as string;
      expect(written.startsWith('# Review Report: sprint-042')).toBe(true);
    });
  });
});

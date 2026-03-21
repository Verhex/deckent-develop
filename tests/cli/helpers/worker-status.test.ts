import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { WorkerStatusTracker } from '../../../src/cli/helpers/worker-status.js';

vi.mock('node:fs');

const mockedFs = vi.mocked(fs);

describe('WorkerStatusTracker', () => {
  const tracker = new WorkerStatusTracker(120000); // 2 min threshold

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── statusToProgress ─────────────────────────────────────────────

  describe('statusToProgress', () => {
    it('returns 25 for CODING', () => {
      expect(tracker.statusToProgress('CODING')).toBe(25);
    });

    it('returns 40 for EXECUTING', () => {
      expect(tracker.statusToProgress('EXECUTING')).toBe(40);
    });

    it('returns 65 for TESTING', () => {
      expect(tracker.statusToProgress('TESTING')).toBe(65);
    });

    it('returns 90 for DOCUMENTING', () => {
      expect(tracker.statusToProgress('DOCUMENTING')).toBe(90);
    });

    it('returns 100 for DONE', () => {
      expect(tracker.statusToProgress('DONE')).toBe(100);
    });

    it('returns 0 for unknown status', () => {
      expect(tracker.statusToProgress('UNKNOWN')).toBe(0);
    });

    it('returns 0 for IDLE', () => {
      expect(tracker.statusToProgress('IDLE')).toBe(0);
    });
  });

  // ─── isStale ──────────────────────────────────────────────────────

  describe('isStale', () => {
    it('returns false for recent timestamp', () => {
      const recent = new Date().toISOString();
      expect(tracker.isStale(recent)).toBe(false);
    });

    it('returns true for old timestamp', () => {
      const old = new Date(Date.now() - 300000).toISOString(); // 5 min ago
      expect(tracker.isStale(old)).toBe(true);
    });

    it('returns false for timestamp exactly at threshold boundary', () => {
      // Just under 2 min
      const borderline = new Date(Date.now() - 119000).toISOString();
      expect(tracker.isStale(borderline)).toBe(false);
    });
  });

  // ─── parseHeartbeat ───────────────────────────────────────────────

  describe('parseHeartbeat', () => {
    it('parses valid heartbeat file', () => {
      const hbData = JSON.stringify({
        workerId: 'w1',
        taskId: 't1',
        status: 'CODING',
        currentFile: 'src/foo.ts',
        timestamp: new Date().toISOString(),
      });
      mockedFs.readFileSync.mockReturnValue(hbData);

      const entry = tracker.parseHeartbeat('/tmp/task-001.hb');
      expect(entry).not.toBeNull();
      expect(entry!.taskId).toBe('t1');
      expect(entry!.workerId).toBe('w1');
      expect(entry!.status).toBe('CODING');
      expect(entry!.currentFile).toBe('src/foo.ts');
    });

    it('returns null for invalid JSON', () => {
      mockedFs.readFileSync.mockReturnValue('not json');
      const entry = tracker.parseHeartbeat('/tmp/bad.hb');
      expect(entry).toBeNull();
    });

    it('returns null when file read fails', () => {
      mockedFs.readFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      const entry = tracker.parseHeartbeat('/tmp/missing.hb');
      expect(entry).toBeNull();
    });

    it('marks stale worker with STALE status', () => {
      const hbData = JSON.stringify({
        workerId: 'w2',
        taskId: 't2',
        status: 'CODING',
        timestamp: new Date(Date.now() - 300000).toISOString(), // 5 min ago
      });
      mockedFs.readFileSync.mockReturnValue(hbData);

      const entry = tracker.parseHeartbeat('/tmp/task-002.hb');
      expect(entry!.status).toBe('STALE');
    });

    it('uses "generic" for missing agentId', () => {
      const hbData = JSON.stringify({
        workerId: 'w3',
        taskId: 't3',
        status: 'TESTING',
        timestamp: new Date().toISOString(),
      });
      mockedFs.readFileSync.mockReturnValue(hbData);

      const entry = tracker.parseHeartbeat('/tmp/task-003.hb');
      expect(entry!.agentName).toBe('generic');
    });

    it('uses agentId when present', () => {
      const hbData = JSON.stringify({
        workerId: 'w4',
        taskId: 't4',
        status: 'CODING',
        timestamp: new Date().toISOString(),
        agentId: 'security-auditor',
      });
      mockedFs.readFileSync.mockReturnValue(hbData);

      const entry = tracker.parseHeartbeat('/tmp/task-004.hb');
      expect(entry!.agentName).toBe('security-auditor');
    });
  });

  // ─── pollWorkerStatus ─────────────────────────────────────────────

  describe('pollWorkerStatus', () => {
    it('returns entries for .hb files', () => {
      mockedFs.readdirSync.mockReturnValue(['task-001.hb', 'task-002.hb'] as unknown as fs.Dirent[]);
      const hbData = JSON.stringify({
        workerId: 'w1',
        taskId: 't1',
        status: 'CODING',
        timestamp: new Date().toISOString(),
      });
      mockedFs.readFileSync.mockReturnValue(hbData);

      const entries = tracker.pollWorkerStatus('/tmp/tasks');
      expect(entries).toHaveLength(2);
    });

    it('skips non-.hb files', () => {
      mockedFs.readdirSync.mockReturnValue(['task-001.json', 'task-001.hb'] as unknown as fs.Dirent[]);
      const hbData = JSON.stringify({
        workerId: 'w1',
        taskId: 't1',
        status: 'TESTING',
        timestamp: new Date().toISOString(),
      });
      mockedFs.readFileSync.mockReturnValue(hbData);

      const entries = tracker.pollWorkerStatus('/tmp/tasks');
      expect(entries).toHaveLength(1);
    });

    it('returns empty array when directory read fails', () => {
      mockedFs.readdirSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      const entries = tracker.pollWorkerStatus('/nonexistent');
      expect(entries).toEqual([]);
    });

    it('skips unparseable heartbeat files', () => {
      mockedFs.readdirSync.mockReturnValue(['good.hb', 'bad.hb'] as unknown as fs.Dirent[]);
      mockedFs.readFileSync
        .mockReturnValueOnce(JSON.stringify({
          workerId: 'w1',
          taskId: 't1',
          status: 'CODING',
          timestamp: new Date().toISOString(),
        }))
        .mockReturnValueOnce('invalid');

      const entries = tracker.pollWorkerStatus('/tmp/tasks');
      expect(entries).toHaveLength(1);
    });

    it('returns empty array for empty directory', () => {
      mockedFs.readdirSync.mockReturnValue([] as unknown as fs.Dirent[]);
      const entries = tracker.pollWorkerStatus('/tmp/tasks');
      expect(entries).toEqual([]);
    });
  });
});

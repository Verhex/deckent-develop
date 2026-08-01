/**
 * tests/orchestra/sprint-pid-manager.test.ts
 *
 * Tests for Sprint PID Manager: coordinator resilience via PID tracking,
 * state snapshots, and orphan detection.
 * Covers: writePid, readPid, clearPid, writeStateSnapshot, readStateSnapshot,
 *         detectOrphan, isProcessAlive, archiveOrphan, listPidFiles
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync, mkdirSync, existsSync, readFileSync,
  writeFileSync, readdirSync, rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  writePid,
  readPid,
  clearPid,
  writeStateSnapshot,
  readStateSnapshot,
  detectOrphan,
  isProcessAlive,
  archiveOrphan,
  listPidFiles,
  terminateOwnedSprintProcess,
  terminateOwnedSprintProcessAndWait,
} from '../../src/orchestra/sprint-pid-manager.js';
import type { SprintStateSnapshot, OrphanInfo } from '../../src/orchestra/sprint-pid-manager.js';

describe('sprint-pid-manager', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'pid-manager-test-'));
    mkdirSync(join(tmpRoot, '.deckent'), { recursive: true });
    mkdirSync(join(tmpRoot, '.brain'), { recursive: true });
  });

  afterEach(() => {
    try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  // ── Test 1: writePid happy path + collision handling ────────────

  describe('writePid', () => {
    it('should write a PID file with current process PID', () => {
      writePid(tmpRoot, 'sprint-100');

      const pid = readPid(tmpRoot, 'sprint-100');
      expect(pid).toBe(process.pid);

      // Verify the PID file exists on disk
      const pidPath = join(tmpRoot, '.deckent', 'pids', 'sprint-100.pid');
      expect(existsSync(pidPath)).toBe(true);

      const content = JSON.parse(readFileSync(pidPath, 'utf-8'));
      expect(content.pid).toBe(process.pid);
      expect(content.sprintId).toBe('sprint-100');
      expect(content.startedAt).toBeDefined();
    });

    it('returns and persists one exact coordinator lifetime authority', () => {
      const startedAt = '2026-08-01T07:00:00.000Z';
      const record = writePid(tmpRoot, 'sprint-authority', startedAt);
      const persisted = JSON.parse(readFileSync(
        join(tmpRoot, '.deckent', 'pids', 'sprint-authority.pid'),
        'utf-8',
      ));

      expect(record.startedAt).toBe(startedAt);
      expect(persisted).toEqual(record);
      expect(record.startToken === null || typeof record.startToken === 'string').toBe(true);
      expect(record.leaseId).toMatch(/^[0-9a-f-]{36}$/u);
    });

    it('wires the exact PID authority into both production snapshot paths', () => {
      const source = readFileSync(
        new URL('../../src/orchestra/sprint-controller.ts', import.meta.url),
        'utf-8',
      );
      expect(source.match(/coordinatorPidRecord = writePid\(projectRoot, sprint\.id, sprint\.startedAt\)/gu))
        .toHaveLength(2);
      expect(source).toContain('startToken: coordinatorPidRecord?.startToken ?? null');
      expect(source).toContain('leaseId: coordinatorPidRecord?.leaseId');
      expect(source).toContain('startedAt: coordinatorPidRecord?.startedAt ?? sprint.startedAt!');
    });

    it('should overwrite PID file if previous process is dead', () => {
      // Write a fake PID file with a dead process (PID 99999999)
      const pidDir = join(tmpRoot, '.deckent', 'pids');
      mkdirSync(pidDir, { recursive: true });
      writeFileSync(
        join(pidDir, 'sprint-100.pid'),
        JSON.stringify({ pid: 99999999, sprintId: 'sprint-100', startedAt: '2026-01-01T00:00:00Z' }),
        'utf-8',
      );

      // Should succeed — old process is dead
      writePid(tmpRoot, 'sprint-100');

      const pid = readPid(tmpRoot, 'sprint-100');
      expect(pid).toBe(process.pid);
    });

    it('should throw if the existing PID belongs to a live process', () => {
      // Write current PID (our own process — definitely alive)
      writePid(tmpRoot, 'sprint-100');

      // Try to write again — should throw because we're alive
      expect(() => writePid(tmpRoot, 'sprint-100')).toThrow(/already has a live coordinator/);
    });
  });

  // ── Test 2: readPid missing file → null ─────────────────────────

  describe('readPid', () => {
    it('should return null when no PID file exists', () => {
      const pid = readPid(tmpRoot, 'sprint-nonexistent');
      expect(pid).toBeNull();
    });

    it('should return null for malformed PID file', () => {
      const pidDir = join(tmpRoot, '.deckent', 'pids');
      mkdirSync(pidDir, { recursive: true });
      writeFileSync(join(pidDir, 'sprint-bad.pid'), 'not json', 'utf-8');

      const pid = readPid(tmpRoot, 'sprint-bad');
      expect(pid).toBeNull();
    });
  });

  // ── Test 3: writeStateSnapshot atomic rename verification ───────

  describe('writeStateSnapshot', () => {
    it('should write snapshot atomically (no .tmp file left behind)', () => {
      const snap: SprintStateSnapshot = {
        sprintId: 'sprint-100',
        pid: process.pid,
        startedAt: '2026-04-12T10:00:00Z',
        currentWave: 1,
        taskStatuses: { '100-001': 'EXECUTING', '100-002': 'PENDING' },
        metricsJsonlSize: 5,
        lastHeartbeat: '2026-04-12T10:01:00Z',
      };

      writeStateSnapshot(tmpRoot, 'sprint-100', snap);

      // Verify snapshot exists
      const read = readStateSnapshot(tmpRoot, 'sprint-100');
      expect(read).not.toBeNull();
      expect(read!.sprintId).toBe('sprint-100');
      expect(read!.pid).toBe(process.pid);
      expect(read!.taskStatuses['100-001']).toBe('EXECUTING');
      expect(read!.metricsJsonlSize).toBe(5);

      // No .tmp file should remain
      const pidsDir = join(tmpRoot, '.deckent', 'pids');
      if (existsSync(pidsDir)) {
        const files = readdirSync(pidsDir);
        const tmpFiles = files.filter(f => f.includes('.tmp.'));
        expect(tmpFiles.length).toBe(0);
      }
    });
  });

  // ── Test 4: detectOrphan no pid → null ──────────────────────────

  describe('detectOrphan', () => {
    it('should return null when no PID file exists', () => {
      const orphan = detectOrphan(tmpRoot, 'sprint-ghost');
      expect(orphan).toBeNull();
    });

    // ── Test 5: detectOrphan live process → null ────────────────

    it('should return null when the coordinator process is alive', () => {
      // Write PID file with our own PID (alive)
      writePid(tmpRoot, 'sprint-alive');

      const orphan = detectOrphan(tmpRoot, 'sprint-alive');
      expect(orphan).toBeNull();
    });

    // ── Test 6: detectOrphan dead pid → OrphanInfo ──────────────

    it('should return OrphanInfo for a dead coordinator process', () => {
      const pidDir = join(tmpRoot, '.deckent', 'pids');
      mkdirSync(pidDir, { recursive: true });

      // Write a PID file with a definitely dead PID
      const deadPid = 99999999;
      writeFileSync(
        join(pidDir, 'sprint-dead.pid'),
        JSON.stringify({ pid: deadPid, sprintId: 'sprint-dead', startedAt: '2026-01-01T00:00:00Z' }),
        'utf-8',
      );

      const orphan = detectOrphan(tmpRoot, 'sprint-dead');
      expect(orphan).not.toBeNull();
      expect(orphan!.sprintId).toBe('sprint-dead');
      expect(orphan!.pid).toBe(deadPid);
      expect(orphan!.reason).toContain('no longer running');
    });

    it('should include last snapshot in OrphanInfo when available', () => {
      const pidDir = join(tmpRoot, '.deckent', 'pids');
      mkdirSync(pidDir, { recursive: true });

      const deadPid = 99999999;
      writeFileSync(
        join(pidDir, 'sprint-snap.pid'),
        JSON.stringify({ pid: deadPid, sprintId: 'sprint-snap', startedAt: '2026-01-01T00:00:00Z' }),
        'utf-8',
      );

      // Also write a snapshot
      const snap: SprintStateSnapshot = {
        sprintId: 'sprint-snap',
        pid: deadPid,
        startedAt: '2026-01-01T00:00:00Z',
        currentWave: 2,
        taskStatuses: { '001': 'EXECUTING' },
        metricsJsonlSize: 10,
        lastHeartbeat: '2026-01-01T00:05:00Z',
      };
      writeFileSync(
        join(pidDir, 'sprint-snap.snapshot.json'),
        JSON.stringify(snap, null, 2),
        'utf-8',
      );

      const orphan = detectOrphan(tmpRoot, 'sprint-snap');
      expect(orphan).not.toBeNull();
      expect(orphan!.lastSnapshot).not.toBeNull();
      expect(orphan!.lastSnapshot!.currentWave).toBe(2);
      expect(orphan!.snapshotPath).not.toBeNull();
    });
  });

  // ── Test 7: clearPid removes PID and snapshot files ─────────────

  describe('clearPid', () => {
    it('should remove PID and snapshot files', () => {
      writePid(tmpRoot, 'sprint-clear');

      const snap: SprintStateSnapshot = {
        sprintId: 'sprint-clear',
        pid: process.pid,
        startedAt: '2026-04-12T10:00:00Z',
        currentWave: 0,
        taskStatuses: {},
        metricsJsonlSize: 0,
        lastHeartbeat: '2026-04-12T10:00:00Z',
      };
      writeStateSnapshot(tmpRoot, 'sprint-clear', snap);

      // Verify files exist before clear
      const pidPath = join(tmpRoot, '.deckent', 'pids', 'sprint-clear.pid');
      const snapPath = join(tmpRoot, '.deckent', 'pids', 'sprint-clear.snapshot.json');
      expect(existsSync(pidPath)).toBe(true);
      expect(existsSync(snapPath)).toBe(true);

      clearPid(tmpRoot, 'sprint-clear');

      expect(existsSync(pidPath)).toBe(false);
      expect(existsSync(snapPath)).toBe(false);
    });

    it('should not throw if files do not exist', () => {
      expect(() => clearPid(tmpRoot, 'sprint-nothing')).not.toThrow();
    });
  });

  // ── Test 8: archiveOrphan moves files to .brain/archive/ ───────

  describe('archiveOrphan', () => {
    it('should move orphan artifacts to .brain/archive/', () => {
      const pidDir = join(tmpRoot, '.deckent', 'pids');
      mkdirSync(pidDir, { recursive: true });

      const deadPid = 99999999;
      const pidPath = join(pidDir, 'sprint-archive.pid');
      const snapPath = join(pidDir, 'sprint-archive.snapshot.json');

      writeFileSync(pidPath, JSON.stringify({ pid: deadPid, sprintId: 'sprint-archive' }), 'utf-8');
      writeFileSync(snapPath, JSON.stringify({ sprintId: 'sprint-archive', pid: deadPid }), 'utf-8');

      // Also create a sprint-state.json
      writeFileSync(
        join(tmpRoot, '.deckent', 'sprint-state.json'),
        JSON.stringify({ sprintId: 'sprint-archive', phase: 'EXECUTE' }),
        'utf-8',
      );

      const orphan: OrphanInfo = {
        sprintId: 'sprint-archive',
        pid: deadPid,
        pidFilePath: pidPath,
        snapshotPath: snapPath,
        lastSnapshot: null,
        reason: 'test',
      };

      archiveOrphan(tmpRoot, orphan);

      // Original files should be gone
      expect(existsSync(pidPath)).toBe(false);
      expect(existsSync(snapPath)).toBe(false);
      expect(existsSync(join(tmpRoot, '.deckent', 'sprint-state.json'))).toBe(false);

      // Archive directory should have files (archiveOrphan writes under .brain/archive/sprints/)
      const archiveDir = join(tmpRoot, '.brain', 'archive', 'sprints');
      expect(existsSync(archiveDir)).toBe(true);
      const archiveFiles = readdirSync(archiveDir);
      expect(archiveFiles.length).toBeGreaterThanOrEqual(2);
      expect(archiveFiles.some(f => f.includes('sprint-archive') && f.endsWith('.pid'))).toBe(true);
      expect(archiveFiles.some(f => f.includes('sprint-archive') && f.includes('.snapshot.json'))).toBe(true);
    });
  });

  // ── Test 9: isProcessAlive ──────────────────────────────────────

  describe('isProcessAlive', () => {
    it('should return true for current process', () => {
      expect(isProcessAlive(process.pid)).toBe(true);
    });

    it('should return false for a fake dead PID', () => {
      expect(isProcessAlive(99999999)).toBe(false);
    });
  });

  // ── Test 10: listPidFiles ───────────────────────────────────────

  describe('listPidFiles', () => {
    it('should list sprint IDs with PID files', () => {
      writePid(tmpRoot, 'sprint-a');

      const pidDir = join(tmpRoot, '.deckent', 'pids');
      writeFileSync(
        join(pidDir, 'sprint-b.pid'),
        JSON.stringify({ pid: 99999999, sprintId: 'sprint-b' }),
        'utf-8',
      );

      const ids = listPidFiles(tmpRoot);
      expect(ids).toContain('sprint-a');
      expect(ids).toContain('sprint-b');
    });

    it('should return empty array when no pids directory exists', () => {
      const emptyRoot = mkdtempSync(join(tmpdir(), 'pid-empty-'));
      const ids = listPidFiles(emptyRoot);
      expect(ids).toEqual([]);
      try { rmSync(emptyRoot, { recursive: true, force: true }); } catch { /* ignore */ }
    });
  });

  // ── Test 11: readStateSnapshot missing → null ───────────────────

  describe('readStateSnapshot', () => {
    it('should return null when no snapshot exists', () => {
      expect(readStateSnapshot(tmpRoot, 'sprint-none')).toBeNull();
    });
  });

  // ── P0-C: orphan-on-finalize-force termination ──────────────────
  describe('terminateOwnedSprintProcess (P0-C)', () => {
    it('SIGTERMs an owned, alive sprint process', () => {
      writePid(tmpRoot, 'sprint-x'); // records this process's PID → owned + alive
      const killed: Array<{ pid: number; sig: NodeJS.Signals }> = [];
      const res = terminateOwnedSprintProcess(tmpRoot, 'sprint-x', {
        isAlive: () => true,
        kill: (pid, sig) => { killed.push({ pid, sig }); },
      });
      expect(res.action).toBe('killed');
      expect(killed).toHaveLength(1);
      expect(killed[0]!.sig).toBe('SIGTERM');
      expect(killed[0]!.pid).toBe(res.pid);
    });

    it('does NOT signal when no PID is recorded', () => {
      const killed: number[] = [];
      const res = terminateOwnedSprintProcess(tmpRoot, 'sprint-none', {
        isAlive: () => true,
        kill: (pid) => { killed.push(pid); },
      });
      expect(res.action).toBe('not-alive');
      expect(killed).toHaveLength(0);
    });

    it('does NOT signal a recorded-but-dead process', () => {
      writePid(tmpRoot, 'sprint-dead');
      const killed: number[] = [];
      const res = terminateOwnedSprintProcess(tmpRoot, 'sprint-dead', {
        isAlive: () => false, // process already exited
        kill: (pid) => { killed.push(pid); },
      });
      expect(res.action).toBe('not-alive');
      expect(killed).toHaveLength(0);
    });
  });

  describe('terminateOwnedSprintProcessAndWait — verified containment', () => {
    const sprintId = 'sprint-verified';
    const pid = 424_242;
    const policy = {
      coordinator_termination_grace_ms: 200,
      termination_poll_interval_ms: 100,
      forced_termination_verify_ms: 200,
    };

    function seedRecordedPid(): void {
      const pidDir = join(tmpRoot, '.deckent', 'pids');
      mkdirSync(pidDir, { recursive: true });
      writeFileSync(
        join(pidDir, `${sprintId}.pid`),
        JSON.stringify({ pid, sprintId, startToken: 's-fixture' }),
        'utf-8',
      );
    }

    it('proves graceful SIGTERM exit before reporting terminated', async () => {
      seedRecordedPid();
      let alive = true;
      const signals: NodeJS.Signals[] = [];

      const result = await terminateOwnedSprintProcessAndWait(
        tmpRoot,
        sprintId,
        policy,
        {
          isAlive: () => alive,
          verifyOwnership: () => 'owned',
          kill: (_pid, signal) => { signals.push(signal); },
          wait: async () => { alive = false; },
        },
      );

      expect(result).toEqual({ action: 'terminated', pid, escalation: 'sigterm' });
      expect(signals).toEqual(['SIGTERM']);
    });

    it('escalates after grace and proves SIGKILL exit', async () => {
      seedRecordedPid();
      let alive = true;
      const signals: NodeJS.Signals[] = [];
      let waits = 0;

      const result = await terminateOwnedSprintProcessAndWait(
        tmpRoot,
        sprintId,
        policy,
        {
          isAlive: () => alive,
          verifyOwnership: () => 'owned',
          kill: (_pid, signal) => {
            signals.push(signal);
            if (signal === 'SIGKILL') alive = false;
          },
          wait: async () => { waits++; },
        },
      );

      expect(result).toEqual({ action: 'terminated', pid, escalation: 'sigkill' });
      expect(signals).toEqual(['SIGTERM', 'SIGKILL']);
      expect(waits).toBeGreaterThanOrEqual(2);
    });

    it('holds without signalling when ownership is unverified', async () => {
      seedRecordedPid();
      const signals: NodeJS.Signals[] = [];

      const result = await terminateOwnedSprintProcessAndWait(
        tmpRoot,
        sprintId,
        policy,
        {
          isAlive: () => true,
          verifyOwnership: () => 'unknown',
          kill: (_pid, signal) => { signals.push(signal); },
        },
      );

      expect(result).toEqual({
        action: 'ownership-unverified',
        pid,
        escalation: 'none',
      });
      expect(signals).toEqual([]);
    });

    it('does not claim success while the PID remains alive after SIGKILL', async () => {
      seedRecordedPid();
      const result = await terminateOwnedSprintProcessAndWait(
        tmpRoot,
        sprintId,
        policy,
        {
          isAlive: () => true,
          verifyOwnership: () => 'owned',
          kill: () => undefined,
          wait: async () => undefined,
        },
      );

      expect(result).toEqual({ action: 'still-alive', pid, escalation: 'sigkill' });
    });
  });
});

// ═══ Event Stream Emit Wire Tests ═════════════════════════════════
// Sprint 144 — Task 015: ADR-035 event emissions for Brain, Worker, Auditor

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  writeEvent,
  readEvents,
  CHANNELS,
} from '../../src/orchestra/event-stream.js';

// ─── Helpers ─────────────────────────────────────────────────────

function createTestRoot(): string {
  const root = join(tmpdir(), `deckent-emit-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(root, '.deckent'), { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  return root;
}

function writeSprintState(root: string, sprintId: string): void {
  writeFileSync(
    join(root, '.deckent', 'sprint-state.json'),
    JSON.stringify({ sprintId }),
    'utf-8',
  );
}

describe('event-stream-emit (Sprint 144 Task 015)', () => {
  let testRoot: string;
  const sprintId = 'sprint-144';

  beforeEach(() => {
    testRoot = createTestRoot();
    writeSprintState(testRoot, sprintId);
  });

  afterEach(() => {
    try { rmSync(testRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  // ─── New Channel Constants ─────────────────────────────────────

  describe('CHANNELS constants', () => {
    it('should define SPRINT_START channel', () => {
      expect(CHANNELS.SPRINT_START).toBe('BRAIN→*:SPRINT_START');
    });

    it('should define SPRINT_END channel', () => {
      expect(CHANNELS.SPRINT_END).toBe('BRAIN→*:SPRINT_END');
    });

    it('should define FIX_CYCLE_START channel', () => {
      expect(CHANNELS.FIX_CYCLE_START).toBe('BRAIN→*:FIX_CYCLE_START');
    });

    it('should define TASK_CLAIM channel', () => {
      expect(CHANNELS.TASK_CLAIM).toBe('WORKER→BRAIN:TASK_CLAIM');
    });

    it('should define VERIFY_FAIL channel', () => {
      expect(CHANNELS.VERIFY_FAIL).toBe('WORKER→BRAIN:VERIFY_FAIL');
    });

    it('should define BOUNDARY_VIOLATION channel', () => {
      expect(CHANNELS.BOUNDARY_VIOLATION).toBe('AUDITOR→BRAIN:BOUNDARY_VIOLATION');
    });

    it('should define STALE_HEARTBEAT channel', () => {
      expect(CHANNELS.STALE_HEARTBEAT).toBe('AUDITOR→BRAIN:STALE_HEARTBEAT');
    });
  });

  // ─── Brain Events (SPRINT_START / SPRINT_END / FIX_CYCLE_START) ─

  describe('Brain event emissions', () => {
    it('should emit SPRINT_START with correct payload', () => {
      const event = writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.SPRINT_START, {
        sprintId,
        taskCount: 27,
        timestamp: '2026-04-17T14:00:00.000Z',
      });

      expect(event).not.toBeNull();
      expect(event!.source).toBe('brain');
      expect(event!.target).toBe('*');
      expect(event!.channel).toBe(CHANNELS.SPRINT_START);
      expect((event!.payload as Record<string, unknown>).sprintId).toBe(sprintId);
      expect((event!.payload as Record<string, unknown>).taskCount).toBe(27);

      const events = readEvents(testRoot, sprintId, { channel: CHANNELS.SPRINT_START });
      expect(events).toHaveLength(1);
    });

    it('should emit SPRINT_END with status and completedAt', () => {
      const event = writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.SPRINT_END, {
        sprintId,
        status: 'COMPLETE',
        taskCount: 27,
        completedAt: '2026-04-17T20:00:00.000Z',
      });

      expect(event).not.toBeNull();
      expect(event!.channel).toBe(CHANNELS.SPRINT_END);
      const payload = event!.payload as Record<string, unknown>;
      expect(payload.status).toBe('COMPLETE');
      expect(payload.completedAt).toBeDefined();
    });

    it('should emit SPRINT_PHASE_CHANGE for PLAN→SPAWN transition', () => {
      const event = writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, {
        fromPhase: 'PLAN', toPhase: 'SPAWN', sprintId,
      });

      expect(event).not.toBeNull();
      const payload = event!.payload as Record<string, unknown>;
      expect(payload.fromPhase).toBe('PLAN');
      expect(payload.toPhase).toBe('SPAWN');
    });

    it('should emit SPRINT_PHASE_CHANGE for SPAWN→EXECUTE transition', () => {
      const event = writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, {
        fromPhase: 'SPAWN', toPhase: 'EXECUTE', sprintId,
      });

      expect(event).not.toBeNull();
      const payload = event!.payload as Record<string, unknown>;
      expect(payload.fromPhase).toBe('SPAWN');
      expect(payload.toPhase).toBe('EXECUTE');
    });

    it('should emit FIX_CYCLE_START with NO_GO task info', () => {
      const event = writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.FIX_CYCLE_START, {
        sprintId,
        noGoTaskCount: 3,
        noGoTaskIds: ['144-001', '144-005', '144-012'],
        timestamp: '2026-04-17T18:00:00.000Z',
      });

      expect(event).not.toBeNull();
      expect(event!.channel).toBe(CHANNELS.FIX_CYCLE_START);
      const payload = event!.payload as Record<string, unknown>;
      expect(payload.noGoTaskCount).toBe(3);
      expect(payload.noGoTaskIds).toEqual(['144-001', '144-005', '144-012']);
    });
  });

  // ─── Worker Events (TASK_CLAIM / VERIFY_FAIL) ──────────────────

  describe('Worker event emissions', () => {
    it('should emit TASK_CLAIM with taskId and workerId', () => {
      const event = writeEvent(testRoot, sprintId, 'worker', 'brain', CHANNELS.TASK_CLAIM, {
        taskId: '144-015',
        workerId: 'w-144-015',
        timestamp: '2026-04-17T14:05:00.000Z',
      });

      expect(event).not.toBeNull();
      expect(event!.source).toBe('worker');
      expect(event!.target).toBe('brain');
      expect(event!.channel).toBe(CHANNELS.TASK_CLAIM);
      const payload = event!.payload as Record<string, unknown>;
      expect(payload.taskId).toBe('144-015');
      expect(payload.workerId).toBe('w-144-015');
    });

    it('should emit VERIFY_FAIL with phase, attempt, and error', () => {
      const event = writeEvent(testRoot, sprintId, 'worker', 'brain', CHANNELS.VERIFY_FAIL, {
        taskId: '144-015',
        phase: 'tsc',
        attempt: 2,
        errorSummary: 'TS2304: Cannot find name \'foo\'',
        timestamp: '2026-04-17T15:00:00.000Z',
      });

      expect(event).not.toBeNull();
      expect(event!.channel).toBe(CHANNELS.VERIFY_FAIL);
      const payload = event!.payload as Record<string, unknown>;
      expect(payload.phase).toBe('tsc');
      expect(payload.attempt).toBe(2);
      expect(payload.errorSummary).toContain('Cannot find name');
    });

    it('should emit VERIFY_FAIL for vitest phase', () => {
      const event = writeEvent(testRoot, sprintId, 'worker', 'brain', CHANNELS.VERIFY_FAIL, {
        taskId: '144-015',
        phase: 'vitest',
        attempt: 3,
        errorSummary: '5 tests failed in worker.test.ts',
      });

      expect(event).not.toBeNull();
      const payload = event!.payload as Record<string, unknown>;
      expect(payload.phase).toBe('vitest');
      expect(payload.attempt).toBe(3);
    });
  });

  // ─── Auditor Events (BOUNDARY_VIOLATION / STALE_HEARTBEAT) ─────

  describe('Auditor event emissions', () => {
    it('should emit BOUNDARY_VIOLATION with violation details', () => {
      const event = writeEvent(testRoot, sprintId, 'auditor', 'brain', CHANNELS.BOUNDARY_VIOLATION, {
        violationCount: 2,
        violations: [
          { type: 'file_outside_scope', agentId: 'w-001', detail: 'File outside scope: src/core/types.ts' },
          { type: 'file_outside_scope', agentId: 'w-002', detail: 'File outside scope: src/cli/index.ts' },
        ],
      });

      expect(event).not.toBeNull();
      expect(event!.source).toBe('auditor');
      expect(event!.target).toBe('brain');
      expect(event!.channel).toBe(CHANNELS.BOUNDARY_VIOLATION);
      const payload = event!.payload as Record<string, unknown>;
      expect(payload.violationCount).toBe(2);
      expect((payload.violations as unknown[]).length).toBe(2);
    });

    it('should emit STALE_HEARTBEAT with worker details', () => {
      const event = writeEvent(testRoot, sprintId, 'auditor', 'brain', CHANNELS.STALE_HEARTBEAT, {
        workerId: 'w-144-003',
        taskId: '144-003',
        staleDurationSec: 180,
      });

      expect(event).not.toBeNull();
      expect(event!.channel).toBe(CHANNELS.STALE_HEARTBEAT);
      const payload = event!.payload as Record<string, unknown>;
      expect(payload.workerId).toBe('w-144-003');
      expect(payload.taskId).toBe('144-003');
      expect(payload.staleDurationSec).toBe(180);
    });
  });

  // ─── Fail-safe Behavior ────────────────────────────────────────

  describe('fail-safe behavior', () => {
    it('should return null on write failure without throwing', () => {
      // Use an invalid path that will cause write failure
      const result = writeEvent(
        '/nonexistent-path-that-will-fail', sprintId,
        'brain', '*', CHANNELS.SPRINT_START,
        { sprintId },
      );
      // Should not throw, returns null
      expect(result).toBeNull();
    });
  });

  // ─── Event Filtering ──────────────────────────────────────────

  describe('event filtering for new channels', () => {
    it('should filter events by new channel codes', () => {
      // Write multiple event types
      writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.SPRINT_START, { sprintId });
      writeEvent(testRoot, sprintId, 'worker', 'brain', CHANNELS.TASK_CLAIM, { taskId: '001' });
      writeEvent(testRoot, sprintId, 'auditor', 'brain', CHANNELS.STALE_HEARTBEAT, { workerId: 'w-001' });
      writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.SPRINT_END, { sprintId });

      // Filter by source
      const brainEvents = readEvents(testRoot, sprintId, { source: 'brain' });
      expect(brainEvents.length).toBe(2);

      // Filter by channel
      const claimEvents = readEvents(testRoot, sprintId, { channel: CHANNELS.TASK_CLAIM });
      expect(claimEvents.length).toBe(1);
      expect((claimEvents[0]!.payload as Record<string, unknown>).taskId).toBe('001');

      // Filter by target
      const broadcastEvents = readEvents(testRoot, sprintId, { target: '*' });
      expect(broadcastEvents.length).toBe(2);
    });

    it('should sequence new channel events correctly', () => {
      writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.SPRINT_START, {});
      writeEvent(testRoot, sprintId, 'worker', 'brain', CHANNELS.TASK_CLAIM, {});
      writeEvent(testRoot, sprintId, 'worker', 'brain', CHANNELS.VERIFY_FAIL, {});
      writeEvent(testRoot, sprintId, 'auditor', 'brain', CHANNELS.BOUNDARY_VIOLATION, {});
      writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.SPRINT_END, {});

      const events = readEvents(testRoot, sprintId);
      expect(events.length).toBe(5);
      // Verify monotonic sequence
      for (let i = 1; i < events.length; i++) {
        expect(events[i]!.sequence).toBeGreaterThan(events[i - 1]!.sequence);
      }
    });
  });
});

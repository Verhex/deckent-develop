// ═══ Event Stream Emit Wire Tests ═════════════════════════════════
// Sprint 144 — Task 015: ADR-035 event emissions for Brain, Worker, Auditor
// Updated Sprint 148: aligned to actual CHANNELS export

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

  // ─── Existing Channel Constants ───────────────────────────────

  describe('CHANNELS constants', () => {
    it('should define SPRINT_PHASE_CHANGE channel', () => {
      expect(CHANNELS.SPRINT_PHASE_CHANGE).toBe('BRAIN→*:SPRINT_PHASE_CHANGE');
    });

    it('pins completed-checkpoint recovery observability channels', () => {
      expect(CHANNELS.RECOVERY_TERMINALIZATION_STARTED)
        .toBe('BRAIN→*:RECOVERY_TERMINALIZATION_STARTED');
      expect(CHANNELS.RECOVERY_EVIDENCE_REUSED)
        .toBe('BRAIN→*:RECOVERY_EVIDENCE_REUSED');
      expect(CHANNELS.RECOVERY_RECEIPT_AUTHORIZED)
        .toBe('BRAIN→*:RECOVERY_RECEIPT_AUTHORIZED');
      expect(CHANNELS.RECOVERY_CLEANUP_SETTLED)
        .toBe('BRAIN→*:RECOVERY_CLEANUP_SETTLED');
      expect(CHANNELS.RECOVERY_TERMINALIZATION_COMPLETED)
        .toBe('BRAIN→*:RECOVERY_TERMINALIZATION_COMPLETED');
      expect(CHANNELS.RECOVERY_TERMINALIZATION_HELD)
        .toBe('BRAIN→*:RECOVERY_TERMINALIZATION_HELD');
    });

    it('should define TASK_ASSIGN channel', () => {
      expect(CHANNELS.TASK_ASSIGN).toBe('BRAIN→WORKER:TASK_ASSIGN');
    });

    it('should define HEARTBEAT channel', () => {
      expect(CHANNELS.HEARTBEAT).toBe('WORKER→BRAIN:HEARTBEAT');
    });

    it('should define RESULT channel', () => {
      expect(CHANNELS.RESULT).toBe('WORKER→BRAIN:RESULT');
    });

    it('should define SCOPE_COLLISION_DETECTED channel', () => {
      expect(CHANNELS.SCOPE_COLLISION_DETECTED).toBe('AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED');
    });

    it('should define ADR_VIOLATION channel', () => {
      expect(CHANNELS.ADR_VIOLATION).toBe('AUDITOR→BRAIN:ADR_VIOLATION');
    });

    it('should define NOTIFY channel', () => {
      expect(CHANNELS.NOTIFY).toBe('DECKENT→USER:NOTIFY');
    });
  });

  // ─── Brain Events (SPRINT_PHASE_CHANGE) ───────────────────────

  describe('Brain event emissions', () => {
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

    it('should emit TASK_ASSIGN with correct payload', () => {
      const event = writeEvent(testRoot, sprintId, 'brain', 'worker', CHANNELS.TASK_ASSIGN, {
        taskId: '144-001',
        workerId: 'w-144-001',
      });

      expect(event).not.toBeNull();
      expect(event!.source).toBe('brain');
      expect(event!.channel).toBe(CHANNELS.TASK_ASSIGN);
      const payload = event!.payload as Record<string, unknown>;
      expect(payload.taskId).toBe('144-001');
    });

    it('should emit FIX_REQUEST with NO_GO task info', () => {
      const event = writeEvent(testRoot, sprintId, 'brain', 'worker', CHANNELS.FIX_REQUEST, {
        sprintId,
        taskId: '144-001',
      });

      expect(event).not.toBeNull();
      expect(event!.channel).toBe(CHANNELS.FIX_REQUEST);
      const payload = event!.payload as Record<string, unknown>;
      expect(payload.taskId).toBe('144-001');
    });
  });

  // ─── Worker Events (HEARTBEAT / RESULT) ────────────────────────

  describe('Worker event emissions', () => {
    it('should emit HEARTBEAT with workerId', () => {
      const event = writeEvent(testRoot, sprintId, 'worker', 'brain', CHANNELS.HEARTBEAT, {
        taskId: '144-015',
        workerId: 'w-144-015',
        timestamp: '2026-04-17T14:05:00.000Z',
      });

      expect(event).not.toBeNull();
      expect(event!.source).toBe('worker');
      expect(event!.target).toBe('brain');
      expect(event!.channel).toBe(CHANNELS.HEARTBEAT);
      const payload = event!.payload as Record<string, unknown>;
      expect(payload.taskId).toBe('144-015');
      expect(payload.workerId).toBe('w-144-015');
    });

    it('should emit RESULT with task result', () => {
      const event = writeEvent(testRoot, sprintId, 'worker', 'brain', CHANNELS.RESULT, {
        taskId: '144-015',
        selfAssessment: 'DONE',
      });

      expect(event).not.toBeNull();
      expect(event!.channel).toBe(CHANNELS.RESULT);
      const payload = event!.payload as Record<string, unknown>;
      expect(payload.selfAssessment).toBe('DONE');
    });
  });

  // ─── Auditor Events (SCOPE_COLLISION / ADR_VIOLATION) ──────────

  describe('Auditor event emissions', () => {
    it('should emit SCOPE_COLLISION_DETECTED with details', () => {
      const event = writeEvent(testRoot, sprintId, 'auditor', 'brain', CHANNELS.SCOPE_COLLISION_DETECTED, {
        taskIds: ['144-001', '144-002'],
        files: ['src/core/types.ts'],
      });

      expect(event).not.toBeNull();
      expect(event!.source).toBe('auditor');
      expect(event!.target).toBe('brain');
      expect(event!.channel).toBe(CHANNELS.SCOPE_COLLISION_DETECTED);
      const payload = event!.payload as Record<string, unknown>;
      expect((payload.taskIds as string[]).length).toBe(2);
    });

    it('should emit ADR_VIOLATION with violation details', () => {
      const event = writeEvent(testRoot, sprintId, 'auditor', 'brain', CHANNELS.ADR_VIOLATION, {
        adrId: 'adr-008',
        workerId: 'w-144-003',
        detail: 'Worker imports from CLI module',
      });

      expect(event).not.toBeNull();
      expect(event!.channel).toBe(CHANNELS.ADR_VIOLATION);
      const payload = event!.payload as Record<string, unknown>;
      expect(payload.adrId).toBe('adr-008');
    });
  });

  // ─── Fail-safe Behavior ────────────────────────────────────────

  describe('fail-safe behavior', () => {
    it('should return null on write failure without throwing', () => {
      const result = writeEvent(
        '/nonexistent-path-that-will-fail', sprintId,
        'brain', '*', CHANNELS.SPRINT_PHASE_CHANGE,
        { sprintId },
      );
      expect(result).toBeNull();
    });
  });

  // ─── Event Filtering ──────────────────────────────────────────

  describe('event filtering for new channels', () => {
    it('should filter events by channel codes', () => {
      writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, { fromPhase: 'PLAN', toPhase: 'SPAWN' });
      writeEvent(testRoot, sprintId, 'worker', 'brain', CHANNELS.HEARTBEAT, { taskId: '001' });
      writeEvent(testRoot, sprintId, 'auditor', 'brain', CHANNELS.ADR_VIOLATION, { adrId: 'adr-008' });
      writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.METRIC_EMITTED, { name: 'coverage' });

      // Filter by source
      const brainEvents = readEvents(testRoot, sprintId, { source: 'brain' });
      expect(brainEvents.length).toBe(2);

      // Filter by channel
      const hbEvents = readEvents(testRoot, sprintId, { channel: CHANNELS.HEARTBEAT });
      expect(hbEvents.length).toBe(1);
      expect((hbEvents[0]!.payload as Record<string, unknown>).taskId).toBe('001');

      // Filter by target
      const broadcastEvents = readEvents(testRoot, sprintId, { target: '*' });
      expect(broadcastEvents.length).toBe(2);
    });

    it('should sequence events correctly', () => {
      writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, {});
      writeEvent(testRoot, sprintId, 'worker', 'brain', CHANNELS.HEARTBEAT, {});
      writeEvent(testRoot, sprintId, 'worker', 'brain', CHANNELS.RESULT, {});
      writeEvent(testRoot, sprintId, 'auditor', 'brain', CHANNELS.SCOPE_COLLISION_DETECTED, {});
      writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.METRIC_EMITTED, {});

      const events = readEvents(testRoot, sprintId);
      expect(events.length).toBe(5);
      for (let i = 1; i < events.length; i++) {
        expect(events[i]!.sequence).toBeGreaterThan(events[i - 1]!.sequence);
      }
    });
  });
});

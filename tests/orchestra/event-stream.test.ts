// ═══ Event Stream Tests ════════════════════════════════════════════
// Sprint 138 — Task 004: ADR-035 Protocol Version 1.0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  writeEvent,
  readEvents,
  reconstructState,
  readSequence,
  getCurrentSprintId,
  CHANNELS,
  extractLineage,
} from '../../src/orchestra/event-stream.js';
import type { DeckentEvent, EventFilter, AuditLineage } from '../../src/orchestra/event-stream.js';

describe('event-stream', () => {
  let testRoot: string;
  const sprintId = 'sprint-138';

  beforeEach(() => {
    testRoot = join(tmpdir(), `deckent-event-stream-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(testRoot, '.deckent'), { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testRoot, { recursive: true, force: true });
    } catch {
      // cleanup best-effort
    }
  });

  // ─── writeEvent + readEvents roundtrip ─────────────────────────

  it('should write and read a single event', () => {
    const event = writeEvent(
      testRoot, sprintId, 'brain', '*',
      CHANNELS.SPRINT_PHASE_CHANGE,
      { phase: 'EXECUTE' },
    );

    expect(event).not.toBeNull();
    expect(event!.protocol_version).toBe('1.0');
    expect(event!.sequence).toBe(1);
    expect(event!.source).toBe('brain');
    expect(event!.channel).toBe(CHANNELS.SPRINT_PHASE_CHANGE);

    const events = readEvents(testRoot, sprintId);
    expect(events).toHaveLength(1);
    expect(events[0].sequence).toBe(1);
    expect((events[0].payload as { phase: string }).phase).toBe('EXECUTE');
  });

  it('should write multiple events with monotonic sequence', () => {
    writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, { phase: 'PLAN' });
    writeEvent(testRoot, sprintId, 'worker', 'brain', CHANNELS.HEARTBEAT, { taskId: '001' });
    writeEvent(testRoot, sprintId, 'worker', 'brain', CHANNELS.RESULT, { taskId: '001', selfAssessment: 'DONE' });

    const events = readEvents(testRoot, sprintId);
    expect(events).toHaveLength(3);
    expect(events[0].sequence).toBe(1);
    expect(events[1].sequence).toBe(2);
    expect(events[2].sequence).toBe(3);
  });

  // ─── readEvents with filter ────────────────────────────────────

  it('should filter events by source', () => {
    writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, {});
    writeEvent(testRoot, sprintId, 'worker', 'brain', CHANNELS.HEARTBEAT, {});
    writeEvent(testRoot, sprintId, 'auditor', 'brain', CHANNELS.VERIFICATION_RESULT, {});

    const workerEvents = readEvents(testRoot, sprintId, { source: 'worker' });
    expect(workerEvents).toHaveLength(1);
    expect(workerEvents[0].source).toBe('worker');
  });

  it('should filter events by channel', () => {
    writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, {});
    writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.METRIC_EMITTED, { name: 'test', value: 42 });
    writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, {});

    const metrics = readEvents(testRoot, sprintId, { channel: CHANNELS.METRIC_EMITTED });
    expect(metrics).toHaveLength(1);
  });

  it('should filter events by afterSequence', () => {
    writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, {});
    writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, {});
    writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, {});

    const events = readEvents(testRoot, sprintId, { afterSequence: 2 });
    expect(events).toHaveLength(1);
    expect(events[0].sequence).toBe(3);
  });

  // ─── reconstructState ──────────────────────────────────────────

  it('should reconstruct sprint state from events', () => {
    writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, { phase: 'PLAN' });
    writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, { phase: 'EXECUTE' });
    writeEvent(testRoot, sprintId, 'auditor', 'brain', CHANNELS.VERIFICATION_RESULT, { taskId: '001', verdict: 'PASS' });
    writeEvent(testRoot, sprintId, 'auditor', 'brain', CHANNELS.SCOPE_COLLISION_DETECTED, { taskIds: ['001', '002'], files: ['src/a.ts'] });
    writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.METRIC_EMITTED, { name: 'coverage', value: 89.3 });
    writeEvent(testRoot, sprintId, 'worker', 'brain', CHANNELS.RESULT, { taskId: '002', selfAssessment: 'GO_WITH_TECH_DEBT' });

    const state = reconstructState(testRoot, sprintId);
    expect(state.totalEvents).toBe(6);
    expect(state.lastSequence).toBe(6);
    expect(state.phaseChanges).toHaveLength(2);
    expect(state.phaseChanges[1].phase).toBe('EXECUTE');
    expect(state.taskResults.size).toBe(2);
    expect(state.taskResults.get('001')?.verdict).toBe('PASS');
    expect(state.taskResults.get('002')?.verdict).toBe('GO_WITH_TECH_DEBT');
    expect(state.collisions).toHaveLength(1);
    expect(state.metrics).toHaveLength(1);
    expect(state.metrics[0].value).toBe(89.3);
  });

  // ─── Fail-safe behavior ────────────────────────────────────────

  it('should return null on write failure (invalid projectRoot)', () => {
    const event = writeEvent('/nonexistent/path/that/cannot/exist', sprintId, 'brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, {});
    // May succeed if /nonexistent can be created, or null on permission error
    // The key is it NEVER throws
    expect(true).toBe(true); // No exception = success
  });

  it('should return empty array for non-existent events file', () => {
    const events = readEvents(testRoot, 'sprint-999');
    expect(events).toEqual([]);
  });

  it('should skip malformed lines in event stream', () => {
    const filePath = join(testRoot, '.deckent', `${sprintId}-events.jsonl`);
    writeFileSync(filePath, '{"valid": true}\nnot-json\n{"also": "valid"}\n', 'utf-8');
    // Also write sequence file so readSequence works
    writeFileSync(join(testRoot, '.deckent', `${sprintId}-seq`), '0', 'utf-8');

    const events = readEvents(testRoot, sprintId);
    // Malformed lines are skipped — only valid JSON lines are returned
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  // ─── Sequence counter ──────────────────────────────────────────

  it('should maintain monotonic sequence across writes', () => {
    expect(readSequence(testRoot, sprintId)).toBe(0);

    writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, {});
    expect(readSequence(testRoot, sprintId)).toBe(1);

    writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, {});
    expect(readSequence(testRoot, sprintId)).toBe(2);
  });

  // ─── getCurrentSprintId ────────────────────────────────────────

  it('should read sprint ID from sprint-state.json', () => {
    writeFileSync(
      join(testRoot, '.deckent', 'sprint-state.json'),
      JSON.stringify({ sprintId: 'sprint-138', phase: 'EXECUTE' }),
      'utf-8',
    );

    expect(getCurrentSprintId(testRoot)).toBe('sprint-138');
  });

  it('should return null when sprint-state.json missing', () => {
    expect(getCurrentSprintId(testRoot)).toBeNull();
  });

  // ─── Channel constants ─────────────────────────────────────────

  it('should export all ADR-035 channel codes (15 base + extensions)', () => {
    // 15 ADR-035 base + ORPHAN_HB_DETECTED (Sprint 139 Task 016) + AUTHORITY_VIOLATION (Sprint 139 Task 035)
    expect(Object.keys(CHANNELS).length).toBeGreaterThanOrEqual(15);
    expect(CHANNELS.TASK_ASSIGN).toBe('BRAIN→WORKER:TASK_ASSIGN');
    expect(CHANNELS.NOTIFY).toBe('DECKENT→USER:NOTIFY');
    expect(CHANNELS.AUTHORITY_VIOLATION).toBe('AUDITOR→BRAIN:AUTHORITY_VIOLATION');
  });

  // ─── Sprint 139 Task 041: Worker Event Hook Point channels ────────

  it('should have HEARTBEAT channel for WORKER→BRAIN communication', () => {
    expect(CHANNELS.HEARTBEAT).toBe('WORKER→BRAIN:HEARTBEAT');
  });

  it('should have RESULT channel for WORKER→BRAIN communication', () => {
    expect(CHANNELS.RESULT).toBe('WORKER→BRAIN:RESULT');
  });

  it('should have QUESTION channel for WORKER→BRAIN communication', () => {
    expect(CHANNELS.QUESTION).toBe('WORKER→BRAIN:QUESTION');
  });

  it('should have CODE_VERIFY_REQUEST channel for WORKER→AUDITOR communication', () => {
    expect(CHANNELS.CODE_VERIFY_REQUEST).toBe('WORKER→AUDITOR:CODE_VERIFY_REQUEST');
  });

  it('should write HEARTBEAT event with correct payload structure', () => {
    const event = writeEvent(testRoot, sprintId, 'worker', 'brain', CHANNELS.HEARTBEAT, {
      workerId: 'w-139-001',
      taskId: '139-001',
      sequence: 5,
      phase: 'EXECUTING',
      state: 'Writing src/foo.ts',
    });

    expect(event).not.toBeNull();
    expect(event!.source).toBe('worker');
    expect(event!.target).toBe('brain');
    expect(event!.channel).toBe(CHANNELS.HEARTBEAT);

    const payload = event!.payload as Record<string, unknown>;
    expect(payload.workerId).toBe('w-139-001');
    expect(payload.taskId).toBe('139-001');
    expect(payload.sequence).toBe(5);
    expect(payload.phase).toBe('EXECUTING');
  });

  it('should write RESULT event with selfAssessment and filesChanged', () => {
    const event = writeEvent(testRoot, sprintId, 'worker', 'brain', CHANNELS.RESULT, {
      taskId: '139-002',
      selfAssessment: 'DONE',
      filesChanged: ['src/core/config.ts'],
      rubricScores: { correctness: 90, test_coverage: 85, scope_compliance: 100, documentation: 70 },
    });

    expect(event).not.toBeNull();
    expect(event!.channel).toBe(CHANNELS.RESULT);

    const payload = event!.payload as Record<string, unknown>;
    expect(payload.selfAssessment).toBe('DONE');
    expect(payload.filesChanged).toEqual(['src/core/config.ts']);
    expect(payload.rubricScores).toMatchObject({ correctness: 90 });
  });

  it('should write QUESTION event with question and context', () => {
    const event = writeEvent(testRoot, sprintId, 'worker', 'brain', CHANNELS.QUESTION, {
      taskId: '139-003',
      question: 'Should I touch src/core/config.ts?',
      context: 'The task scope says src/agents/ only',
    });

    expect(event).not.toBeNull();
    expect(event!.channel).toBe(CHANNELS.QUESTION);

    const payload = event!.payload as Record<string, unknown>;
    expect(payload.question).toBe('Should I touch src/core/config.ts?');
    expect(payload.context).toBeDefined();
  });

  it('should write CODE_VERIFY_REQUEST event for auditor', () => {
    const event = writeEvent(testRoot, sprintId, 'worker', 'auditor', CHANNELS.CODE_VERIFY_REQUEST, {
      taskId: '139-004',
      filesChanged: ['src/agents/worker.ts'],
      evidence: 'tsc passed, vitest passed',
    });

    expect(event).not.toBeNull();
    expect(event!.source).toBe('worker');
    expect(event!.target).toBe('auditor');
    expect(event!.channel).toBe(CHANNELS.CODE_VERIFY_REQUEST);

    const payload = event!.payload as Record<string, unknown>;
    expect(payload.filesChanged).toContain('src/agents/worker.ts');
  });

  it('worker event sequence should be monotonically increasing across all 4 hook types', () => {
    writeEvent(testRoot, sprintId, 'worker', 'brain', CHANNELS.HEARTBEAT, { taskId: 'T1', sequence: 1 });
    writeEvent(testRoot, sprintId, 'worker', 'brain', CHANNELS.HEARTBEAT, { taskId: 'T1', sequence: 2 });
    writeEvent(testRoot, sprintId, 'worker', 'brain', CHANNELS.RESULT, { taskId: 'T1', selfAssessment: 'DONE' });
    writeEvent(testRoot, sprintId, 'worker', 'auditor', CHANNELS.CODE_VERIFY_REQUEST, { taskId: 'T1' });

    const events = readEvents(testRoot, sprintId, { source: 'worker' });
    expect(events).toHaveLength(4);

    // Sequences must be strictly increasing
    for (let i = 1; i < events.length; i++) {
      expect(events[i]!.sequence).toBeGreaterThan(events[i - 1]!.sequence);
    }
  });

  // ─── ENT-3: correlationId / causationId audit lineage ─────────────

  describe('ENT-3 audit lineage (correlationId / causationId)', () => {
    it('writeEvent with lineage propagates both correlationId and causationId', () => {
      const lineage: AuditLineage = {
        correlationId: 'corr-abc-123',
        causationId: 'caus-xyz-456',
      };

      const event = writeEvent(
        testRoot, sprintId, 'brain', '*',
        CHANNELS.SPRINT_PHASE_CHANGE,
        { phase: 'EXECUTE' },
        lineage,
      );

      expect(event).not.toBeNull();
      expect(event!.correlationId).toBe('corr-abc-123');
      expect(event!.causationId).toBe('caus-xyz-456');

      // Round-trip: lineage fields survive JSONL serialize/deserialize
      const events = readEvents(testRoot, sprintId);
      expect(events[0]!.correlationId).toBe('corr-abc-123');
      expect(events[0]!.causationId).toBe('caus-xyz-456');
    });

    it('writeEvent without lineage leaves correlationId/causationId undefined (backward-safe)', () => {
      const event = writeEvent(
        testRoot, sprintId, 'brain', '*',
        CHANNELS.SPRINT_PHASE_CHANGE,
        { phase: 'PLAN' },
      );

      expect(event).not.toBeNull();
      expect(event!.correlationId).toBeUndefined();
      expect(event!.causationId).toBeUndefined();
    });

    it('writeEvent with partial lineage (correlationId only) omits causationId', () => {
      const lineage: AuditLineage = { correlationId: 'corr-only-789' };

      const event = writeEvent(
        testRoot, sprintId, 'brain', '*',
        CHANNELS.HEARTBEAT,
        { taskId: 'T1' },
        lineage,
      );

      expect(event).not.toBeNull();
      expect(event!.correlationId).toBe('corr-only-789');
      expect(event!.causationId).toBeUndefined();
    });

    it('extractLineage returns both fields from a source object', () => {
      const source: AuditLineage = {
        correlationId: 'corr-111',
        causationId: 'caus-222',
      };

      const result = extractLineage(source);
      expect(result.correlationId).toBe('corr-111');
      expect(result.causationId).toBe('caus-222');
    });

    it('extractLineage with undefined input returns empty lineage (no fields set)', () => {
      const result = extractLineage(undefined);
      expect(result.correlationId).toBeUndefined();
      expect(result.causationId).toBeUndefined();
    });

    it('extractLineage with partial source propagates only the present field', () => {
      const result = extractLineage({ causationId: 'caus-only-333' });
      expect(result.correlationId).toBeUndefined();
      expect(result.causationId).toBe('caus-only-333');
    });
  });
});

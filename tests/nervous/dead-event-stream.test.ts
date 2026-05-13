// tests/nervous/dead-event-stream.test.ts
//
// DeadEventStreamDetector unit tests — 4 test case
// ADR-003: vitest over Jest
// Sprint 165 Bug W fix

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DeadEventStreamDetector } from '../../src/nervous/detectors/dead-event-stream.js';
import type { DetectorContext, SprintStateSnapshot, ObserverEvent } from '../../src/core/nervous-types.js';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

const BASE_NOW = new Date('2026-05-13T12:00:00.000Z');
const TEST_THRESHOLD_MS = 600_000; // 10 dakika

function makeEvent(source: ObserverEvent['source'] = 'cron'): ObserverEvent {
  return {
    id: 'test-event-id',
    source,
    type: 'TICK',
    timestamp: BASE_NOW.toISOString(),
    payload: {},
  };
}

function makeSprintState(
  overrides: Partial<SprintStateSnapshot> = {},
): SprintStateSnapshot {
  return {
    sprintId: 'sprint-165',
    currentPhase: 'EXECUTE',
    activeWorkers: [],
    openDebtCount: 0,
    totalTasks: 5,
    completedTasks: 2,
    ...overrides,
  };
}

function makeCtx(
  projectRoot: string,
  overrides: Partial<DetectorContext> = {},
): DetectorContext {
  return {
    event: makeEvent(),
    sprintState: makeSprintState(),
    projectRoot,
    now: BASE_NOW,
    ...overrides,
  };
}

function makeActiveWorker(
  id: string,
  taskId: string,
): SprintStateSnapshot['activeWorkers'][number] {
  return { id, taskId, lastHeartbeat: BASE_NOW.toISOString() };
}

/** Sprint events dosyasına tek satır JSONL event yazar */
function writeEventToStream(
  projectRoot: string,
  sprintId: string,
  timestampMs: number,
): void {
  const deckentDir = join(projectRoot, '.deckent');
  mkdirSync(deckentDir, { recursive: true });
  const filePath = join(deckentDir, `${sprintId}-events.jsonl`);
  const event = {
    timestamp: new Date(timestampMs).toISOString(),
    sequence: 1,
    protocol_version: '1.0',
    source: 'brain',
    target: '*',
    channel: 'BRAIN→*:SPRINT_PHASE_CHANGE',
    payload: { phase: 'EXECUTE' },
  };
  writeFileSync(filePath, JSON.stringify(event) + '\n', 'utf-8');
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DeadEventStreamDetector', () => {
  let detector: DeadEventStreamDetector;
  let tmpRoot: string;

  beforeEach(() => {
    detector = new DeadEventStreamDetector(TEST_THRESHOLD_MS);
    tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-test-'));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('Test (a): event stream 10dk+ sessiz + aktif worker var → severity:critical alarm', () => {
    // Arrange: son event 27 dakika önce yazılmış (164-006 hayalet senaryo replay)
    const silenceMs = 27 * 60 * 1000; // 27 dakika
    const lastEventMs = BASE_NOW.getTime() - silenceMs;
    writeEventToStream(tmpRoot, 'sprint-165', lastEventMs);

    const ctx = makeCtx(tmpRoot, {
      sprintState: makeSprintState({
        activeWorkers: [
          makeActiveWorker('w-165-006', 'task-165-006'),
        ],
      }),
    });

    // Act
    const result = detector.detect(ctx);

    // Assert
    expect(result).not.toBeNull();
    expect(result!.risk).toBe('high');
    expect(result!.shouldNotify).toBe(true);
    expect(result!.severity).toBe('critical');
    expect(result!.groupKey).toBe('dead-event-stream:sprint-165');

    // 3 action: investigate, force_evaluate, kill_workers
    expect(result!.suggestedActions).toHaveLength(3);
    expect(result!.suggestedActions[0]!.id).toBe('INVESTIGATE_STALL');
    expect(result!.suggestedActions[1]!.id).toBe('FORCE_EVALUATE');
    expect(result!.suggestedActions[2]!.id).toBe('KILL_WORKERS');

    // Metadata'da tanımlayıcı mesaj
    expect(result!.metadata).toMatchObject({
      type: 'dead-event-stream',
      detector: 'dead_event_stream',
    });
    const msg = result!.metadata!['message'] as string;
    expect(msg).toContain('possible stall');

    // Payload'da aktif worker bilgisi
    const investigatePayload = result!.suggestedActions[0]!.payload as Record<string, unknown>;
    expect(investigatePayload['activeWorkerCount']).toBe(1);
    expect((investigatePayload['activeWorkerIds'] as string[])).toContain('w-165-006');
  });

  it('Test (b): event stream sessiz + aktif worker yok → alarm yok (normal idle)', () => {
    // Arrange: son event çok eski ama hiç worker yok
    const lastEventMs = BASE_NOW.getTime() - 60 * 60 * 1000; // 1 saat önce
    writeEventToStream(tmpRoot, 'sprint-165', lastEventMs);

    const ctx = makeCtx(tmpRoot, {
      sprintState: makeSprintState({
        activeWorkers: [], // worker yok
      }),
    });

    // Act
    const result = detector.detect(ctx);

    // Assert
    expect(result).toBeNull();
  });

  it('Test (c): yeni event yazıldı → sessizlik sayacı sıfırlanır, alarm yok', () => {
    // Arrange: son event sadece 5 dakika önce (threshold altında)
    const lastEventMs = BASE_NOW.getTime() - 5 * 60 * 1000; // 5 dakika önce
    writeEventToStream(tmpRoot, 'sprint-165', lastEventMs);

    const ctx = makeCtx(tmpRoot, {
      sprintState: makeSprintState({
        activeWorkers: [
          makeActiveWorker('w-165-001', 'task-165-001'),
          makeActiveWorker('w-165-002', 'task-165-002'),
        ],
      }),
    });

    // Act
    const result = detector.detect(ctx);

    // Assert — 5dk < 10dk threshold → alarm yok
    expect(result).toBeNull();
  });

  it('Test (d): sprint kapandı (CLEANUP faz) → detector pasif, alarm yok', () => {
    // Arrange: uzun süredir sessiz ama sprint CLEANUP fazında
    const lastEventMs = BASE_NOW.getTime() - 2 * 60 * 60 * 1000; // 2 saat önce
    writeEventToStream(tmpRoot, 'sprint-165', lastEventMs);

    const ctx = makeCtx(tmpRoot, {
      sprintState: makeSprintState({
        currentPhase: 'CLEANUP', // sprint kapandı
        activeWorkers: [
          makeActiveWorker('w-165-999', 'task-165-999'),
        ],
      }),
    });

    // Act
    const result = detector.detect(ctx);

    // Assert — CLEANUP fazında detector pasif
    expect(result).toBeNull();
  });
});

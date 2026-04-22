// tests/nervous/detectors/token-spike.test.ts
//
// TokenSpikeDetector — 3 test case
// ADR-003: vitest over Jest

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenSpikeDetector } from '../../../src/nervous/detectors/token-spike.js';
import type {
  DetectorContext,
  SprintStateSnapshot,
  ObserverEvent,
} from '../../../src/core/nervous-types.js';

// ─── FS Mock ─────────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { existsSync, readdirSync, readFileSync } from 'node:fs';

const mockExistsSync = vi.mocked(existsSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockReadFileSync = vi.mocked(readFileSync);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BASE_NOW = new Date('2026-04-22T10:00:00.000Z');
const PROJECT_ROOT = '/test-project';

function makeRetroEvent(extraPayload: Record<string, unknown> = {}): ObserverEvent {
  return {
    id: 'event-retro-001',
    source: 'sprint-lifecycle',
    type: 'SPRINT_PHASE_CHANGE',
    timestamp: BASE_NOW.toISOString(),
    payload: { oldPhase: 'EVALUATE', newPhase: 'RETRO', ...extraPayload },
    sprintId: 'sprint-151',
  };
}

function makeSprintState(overrides: Partial<SprintStateSnapshot> = {}): SprintStateSnapshot {
  return {
    sprintId: 'sprint-151',
    currentPhase: 'RETRO',
    activeWorkers: [],
    openDebtCount: 0,
    totalTasks: 10,
    completedTasks: 8,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<DetectorContext> = {}): DetectorContext {
  return {
    event: makeRetroEvent(),
    sprintState: makeSprintState(),
    projectRoot: PROJECT_ROOT,
    now: BASE_NOW,
    ...overrides,
  };
}

function setupResults(results: Array<{ inputTokens: number; outputTokens: number; model: string }>): void {
  mockExistsSync.mockReturnValue(true);
  mockReaddirSync.mockReturnValue(
    results.map((_, i) => `task-${String(i + 1).padStart(3, '0')}.result`) as unknown as ReturnType<typeof readdirSync>,
  );
  mockReadFileSync.mockImplementation((filePath: unknown) => {
    const fp = String(filePath);
    const idx = results.findIndex((_, i) =>
      fp.endsWith(`task-${String(i + 1).padStart(3, '0')}.result`),
    );
    if (idx === -1) throw new Error(`Unexpected file: ${fp}`);
    return JSON.stringify({
      taskId: String(idx + 1).padStart(3, '0'),
      tokenUsage: results[idx],
    }) as unknown as ReturnType<typeof readFileSync>;
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TokenSpikeDetector', () => {
  let detector: TokenSpikeDetector;

  beforeEach(() => {
    detector = new TokenSpikeDetector(10); // $10 threshold for testing
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('positive: cost exceeds threshold → warning alert', () => {
    // Arrange — 2 opus tasks = high token usage (~$15+ for opus at 15/75 per 1M)
    // 500K input + 100K output per task = 2 * ($7.50 + $7.50) = $30
    setupResults([
      { inputTokens: 500_000, outputTokens: 100_000, model: 'opus' },
      { inputTokens: 500_000, outputTokens: 100_000, model: 'opus' },
    ]);

    // Act
    const result = detector.detect(makeCtx());

    // Assert
    expect(result).not.toBeNull();
    expect(result!.shouldNotify).toBe(true);
    expect(result!.severity).toBe('critical'); // >$20 = 2x threshold of $10
    expect(result!.suggestedActions[0].id).toBe('COST_OVER_THRESHOLD');
    expect(result!.metadata).toMatchObject({ type: 'token-spike' });
    expect((result!.metadata!['estimatedCostUsd'] as number)).toBeGreaterThan(10);
  });

  it('negative: cost below threshold → null', () => {
    // Arrange — 1 haiku task = tiny cost (~$0.00025 input + $0.00125 output ≈ $0.0015)
    setupResults([
      { inputTokens: 1000, outputTokens: 1000, model: 'haiku' },
    ]);

    // Act
    const result = detector.detect(makeCtx());

    // Assert
    expect(result).toBeNull();
  });

  it('edge: non-RETRO event → null', () => {
    const event: ObserverEvent = {
      id: 'ev-wrong',
      source: 'sprint-lifecycle',
      type: 'SPRINT_PHASE_CHANGE',
      timestamp: BASE_NOW.toISOString(),
      payload: { newPhase: 'SPAWN' },
    };

    const result = detector.detect(makeCtx({ event }));
    expect(result).toBeNull();
  });
});

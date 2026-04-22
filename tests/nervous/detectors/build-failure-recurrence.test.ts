// tests/nervous/detectors/build-failure-recurrence.test.ts
//
// BuildFailureRecurrenceDetector — 3 test case
// ADR-003: vitest over Jest

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BuildFailureRecurrenceDetector } from '../../../src/nervous/detectors/build-failure-recurrence.js';
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

function makeRetroEvent(): ObserverEvent {
  return {
    id: 'event-retro-001',
    source: 'sprint-lifecycle',
    type: 'SPRINT_PHASE_CHANGE',
    timestamp: BASE_NOW.toISOString(),
    payload: { oldPhase: 'EVALUATE', newPhase: 'RETRO' },
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('BuildFailureRecurrenceDetector', () => {
  let detector: BuildFailureRecurrenceDetector;

  beforeEach(() => {
    detector = new BuildFailureRecurrenceDetector(2); // threshold=2 for easier testing
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('positive: detects file failing in 2+ consecutive sprints', () => {
    // Arrange — mevcut sprint'te testsPassed=false + aynı dosya geçmiş sprint log'da
    mockExistsSync.mockReturnValue(true);

    // .tasks/ — result files
    mockReaddirSync.mockImplementation((dirPath: unknown) => {
      const dp = String(dirPath);
      if (dp.endsWith('.tasks')) {
        return ['task-001.result'] as unknown as ReturnType<typeof readdirSync>;
      }
      if (dp.endsWith('sprints')) {
        return ['sprint-150.md'] as unknown as ReturnType<typeof readdirSync>;
      }
      return [] as unknown as ReturnType<typeof readdirSync>;
    });

    mockReadFileSync.mockImplementation((filePath: unknown) => {
      const fp = String(filePath);
      if (fp.endsWith('task-001.result')) {
        return JSON.stringify({
          taskId: '001',
          testsPassed: false,
          filesChanged: ['src/core/config.ts', 'src/core/types.ts'],
        }) as unknown as ReturnType<typeof readFileSync>;
      }
      if (fp.endsWith('sprint-150.md')) {
        return '## Task T-150-003\n- Status: NO_GO\n- Files: src/core/config.ts failed tsc\n\n## Other' as unknown as ReturnType<typeof readFileSync>;
      }
      return '' as unknown as ReturnType<typeof readFileSync>;
    });

    // Act
    const result = detector.detect(makeCtx());

    // Assert
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('warning');
    expect(result!.shouldNotify).toBe(true);
    expect(result!.suggestedActions.length).toBeGreaterThanOrEqual(1);
    expect(result!.suggestedActions[0].id).toBe('BUILD_FAILURE_INVESTIGATE');
    expect(result!.suggestedActions[0].label).toContain('src/core/config.ts');
    expect(result!.metadata).toMatchObject({ type: 'build-failure-recurrence' });
  });

  it('negative: no failed tests in current sprint → null', () => {
    // Arrange — tüm result'lar testsPassed=true
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockImplementation((dirPath: unknown) => {
      const dp = String(dirPath);
      if (dp.endsWith('.tasks')) {
        return ['task-001.result'] as unknown as ReturnType<typeof readdirSync>;
      }
      return [] as unknown as ReturnType<typeof readdirSync>;
    });
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ taskId: '001', testsPassed: true, filesChanged: ['src/foo.ts'] }) as unknown as ReturnType<typeof readFileSync>,
    );

    // Act
    const result = detector.detect(makeCtx());

    // Assert
    expect(result).toBeNull();
  });

  it('edge: wrong event type → null (only RETRO phase triggers)', () => {
    // Arrange — EVALUATE fazına geçiş (RETRO değil)
    const event: ObserverEvent = {
      id: 'ev-wrong',
      source: 'sprint-lifecycle',
      type: 'SPRINT_PHASE_CHANGE',
      timestamp: BASE_NOW.toISOString(),
      payload: { newPhase: 'EVALUATE' },
    };

    const result = detector.detect(makeCtx({ event }));
    expect(result).toBeNull();
  });
});

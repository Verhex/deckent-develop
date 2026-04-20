// tests/nervous/detectors/debt-trend.test.ts
//
// DebtTrendAnalyzer unit tests — 5 test case
// ADR-003: vitest over Jest

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MockedClass } from 'vitest';
import { DebtTrendAnalyzer } from '../../../src/nervous/detectors/debt-trend.js';
import type { DetectorContext, SprintStateSnapshot, ObserverEvent } from '../../../src/core/nervous-types.js';
import type { MemoryEntryV2 } from '../../../src/core/memory-types.js';

// MemoryStore'u mock'la — gerçek SQLite DB gerektirmez
vi.mock('../../../src/core/memory-store.js', () => {
  const MockMemoryStore = vi.fn().mockImplementation(() => ({
    getByType: vi.fn().mockReturnValue([]),
  }));
  return { MemoryStore: MockMemoryStore };
});

// Mock tipini çıkarmak için import
import { MemoryStore } from '../../../src/core/memory-store.js';
const MockedMemoryStore = MemoryStore as MockedClass<typeof MemoryStore>;

// ─── Test Helpers ─────────────────────────────────────────────────────────────

const BASE_NOW = new Date('2026-04-20T10:00:00.000Z');

function makeRetroEvent(overrides: Partial<ObserverEvent> = {}): ObserverEvent {
  return {
    id: 'test-event-retro',
    source: 'sprint-lifecycle',
    type: 'SPRINT_RETRO_COMPLETE',
    timestamp: BASE_NOW.toISOString(),
    payload: {},
    ...overrides,
  };
}

function makeSprintState(overrides: Partial<SprintStateSnapshot> = {}): SprintStateSnapshot {
  return {
    sprintId: 'sprint-147',
    currentPhase: 'RETRO',
    activeWorkers: [],
    openDebtCount: 0,
    totalTasks: 10,
    completedTasks: 10,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<DetectorContext> = {}): DetectorContext {
  return {
    event: makeRetroEvent(),
    sprintState: makeSprintState(),
    projectRoot: '/workspace',
    now: BASE_NOW,
    ...overrides,
  };
}

/**
 * Belirtilen sprint için bir MemoryEntryV2 oluşturur.
 * metadata.totalTasks ve metadata.debtCount debt rate hesaplaması için kullanılır.
 */
function makeMemoryEntry(sprintNum: number, totalTasks: number, debtCount: number): MemoryEntryV2 {
  return {
    id: `sprint-${sprintNum}-memory`,
    type: 'memory',
    source: 'brain',
    title: `Sprint ${sprintNum} Learnings`,
    content: `Sprint ${sprintNum} tamamlandı`,
    summary: null,
    tag_text: '',
    title_norm: '',
    content_norm: '',
    summary_norm: '',
    tag_norm: '',
    status: 'active',
    priority: 'normal',
    sprint_id: `sprint-${sprintNum}`,
    sprint_num: sprintNum,
    lang: 'tr',
    decay_exempt: false,
    metadata: JSON.stringify({ totalTasks, debtCount }),
    created_at: BASE_NOW.toISOString(),
    updated_at: BASE_NOW.toISOString(),
    deleted_at: null,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DebtTrendAnalyzer', () => {
  let detector: DebtTrendAnalyzer;
  let mockGetByType: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    detector = new DebtTrendAnalyzer(0.15, 3); // threshold=%15, windowSize=3

    // Her test için fresh mock instance
    mockGetByType = vi.fn().mockReturnValue([]);
    MockedMemoryStore.mockImplementation(() => ({
      getByType: mockGetByType,
    } as unknown as InstanceType<typeof MemoryStore>));
  });

  it('Test 1: sprint-lifecycle dışı kaynak → null döndürür', () => {
    // Arrange: event-bus kaynağından gelen event
    const ctx = makeCtx({
      event: makeRetroEvent({ source: 'event-bus' }),
    });

    // Act
    const result = detector.detect(ctx);

    // Assert
    expect(result).toBeNull();
  });

  it('Test 1b: SPRINT_RETRO_COMPLETE dışı event tipi → null döndürür', () => {
    // Arrange: sprint-lifecycle ama farklı event tipi
    const ctx = makeCtx({
      event: makeRetroEvent({ type: 'SPRINT_PHASE_CHANGE' }),
    });

    // Act
    const result = detector.detect(ctx);

    // Assert
    expect(result).toBeNull();
  });

  it('Test 2: windowSize\'dan az sprint kaydı → null döndürür (yetersiz veri)', () => {
    // Arrange: sadece 2 sprint kaydı var, windowSize=3
    mockGetByType.mockReturnValue([
      makeMemoryEntry(146, 10, 3), // %30 debt
      makeMemoryEntry(145, 10, 2), // %20 debt
      // 144 yok → yetersiz
    ]);

    const ctx = makeCtx();

    // Act
    const result = detector.detect(ctx);

    // Assert
    expect(result).toBeNull();
  });

  it('Test 3: ortalama debt rate < threshold → null döndürür', () => {
    // Arrange: 3 sprint, %10 ortalama debt rate (< %15 threshold)
    mockGetByType.mockReturnValue([
      makeMemoryEntry(146, 10, 1), // %10
      makeMemoryEntry(145, 10, 1), // %10
      makeMemoryEntry(144, 10, 1), // %10
    ]);

    const ctx = makeCtx();

    // Act
    const result = detector.detect(ctx);

    // Assert
    expect(result).toBeNull();
  });

  it('Test 4: ortalama debt rate >= threshold → DEBT_REPRIORITIZE içeren DetectorResult döndürür', () => {
    // Arrange: 3 sprint, %20 ortalama debt rate (> %15 threshold)
    mockGetByType.mockReturnValue([
      makeMemoryEntry(146, 10, 2), // %20
      makeMemoryEntry(145, 10, 2), // %20
      makeMemoryEntry(144, 10, 2), // %20
    ]);

    const ctx = makeCtx();

    // Act
    const result = detector.detect(ctx);

    // Assert
    expect(result).not.toBeNull();
    expect(result!.risk).toBe('medium');
    expect(result!.shouldNotify).toBe(true);
    expect(result!.severity).toBe('warning');
    expect(result!.suggestedActions).toHaveLength(1);
    expect(result!.suggestedActions[0].id).toBe('DEBT_REPRIORITIZE');
    expect(result!.suggestedActions[0].label).toContain('20.0%');
    expect(result!.metadata).toMatchObject({
      type: 'debt-trend',
      threshold: 0.15,
    });
    const avgDebtRate = result!.metadata!['avgDebtRate'] as number;
    expect(avgDebtRate).toBeCloseTo(0.2, 5);
  });

  it('Test 5: payload.sprints son sprint ID\'lerini içerir', () => {
    // Arrange: 3 sprint kaydı (sprint 145, 146, 147 son sprint)
    mockGetByType.mockReturnValue([
      makeMemoryEntry(146, 10, 2), // %20
      makeMemoryEntry(145, 10, 2), // %20
      makeMemoryEntry(144, 10, 2), // %20
    ]);

    const ctx = makeCtx();

    // Act
    const result = detector.detect(ctx);

    // Assert
    expect(result).not.toBeNull();
    const payload = result!.suggestedActions[0].payload!;
    const sprints = payload['sprints'] as Array<string | null>;
    expect(Array.isArray(sprints)).toBe(true);
    expect(sprints).toHaveLength(3);
    // sprint_id değerleri: "sprint-146", "sprint-145", "sprint-144"
    expect(sprints).toContain('sprint-146');
    expect(sprints).toContain('sprint-145');
    expect(sprints).toContain('sprint-144');
  });
});

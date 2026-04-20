// tests/nervous/detectors/debt-trend-live.test.ts
//
// DebtTrendAnalyzer — Sprint 148 canlı integration testleri (T-009 Test 4-6)
//
// Bu testler Sprint 145-147 gerçek debt verisi ile çalışır:
// Sprint 145: 24/28 = %85.7 debt
// Sprint 146: 6/17 = %35.3 debt
// Sprint 147: 0/23 = %0 debt
// avg ≈ %40.3 → threshold %15'i aşıyor → ALERT
//
// Test 4: avgDebtRate hesaplama doğruluğu
// Test 5: Alert severity='warning', suggestedAction=DEBT_REPRIORITIZE
// Test 6: Sprint 148 retro'da event payload sprint ID'lerini listeler
//
// ADR-003: vitest over Jest
// Sprint 148 T-009

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MockedClass } from 'vitest';
import { DebtTrendAnalyzer } from '../../../src/nervous/detectors/debt-trend.js';
import type {
  DetectorContext,
  SprintStateSnapshot,
  ObserverEvent,
} from '../../../src/core/nervous-types.js';
import type { MemoryEntryV2 } from '../../../src/core/memory-types.js';

// ─── MemoryStore mock ────────────────────────────────────────────────────────

vi.mock('../../../src/core/memory-store.js', () => {
  const MockMemoryStore = vi.fn().mockImplementation(() => ({
    getByType: vi.fn().mockReturnValue([]),
  }));
  return { MemoryStore: MockMemoryStore };
});

import { MemoryStore } from '../../../src/core/memory-store.js';
const MockedMemoryStore = MemoryStore as MockedClass<typeof MemoryStore>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE_NOW = new Date('2026-04-20T20:00:00.000Z');

/** Sprint 148 RETRO phase'i simüle eden SPRINT_RETRO_COMPLETE event */
function makeRetroEvent(sprintId = 'sprint-148'): ObserverEvent {
  return {
    id: `retro-event-${sprintId}`,
    source: 'sprint-lifecycle',
    type: 'SPRINT_RETRO_COMPLETE',
    timestamp: BASE_NOW.toISOString(),
    payload: { sprintId },
    sprintId,
  };
}

function makeSprintState(sprintId = 'sprint-148'): SprintStateSnapshot {
  return {
    sprintId,
    currentPhase: 'RETRO',
    activeWorkers: [],
    openDebtCount: 0,
    totalTasks: 28,
    completedTasks: 28,
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
 * Sprint gerçek debt verisi: bir MemoryEntryV2 oluşturur.
 * totalTasks ve debtCount metadata'sı debt rate hesaplamasında kullanılır.
 */
function makeSprintMemoryEntry(
  sprintNum: number,
  totalTasks: number,
  debtCount: number,
): MemoryEntryV2 {
  return {
    id: `sprint-${sprintNum}-memory`,
    type: 'memory',
    source: 'brain',
    title: `Sprint ${sprintNum} Learnings`,
    content: `Sprint ${sprintNum} tamamlandı. Toplam: ${totalTasks}, Tech Debt: ${debtCount}`,
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

/**
 * Sprint 145-147 gerçek debt verileri (DIRECTIVES'ten alınan):
 * Sprint 145: 24/28 ≈ %85.7
 * Sprint 146: 6/17 ≈ %35.3
 * Sprint 147: 0/23 = %0
 */
function makeSprint145to147Memories(): MemoryEntryV2[] {
  return [
    makeSprintMemoryEntry(147, 23, 0),   // Sprint 147: 0/23 = %0 debt
    makeSprintMemoryEntry(146, 17, 6),   // Sprint 146: 6/17 ≈ %35.3 debt
    makeSprintMemoryEntry(145, 28, 24),  // Sprint 145: 24/28 ≈ %85.7 debt
  ];
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('DebtTrendAnalyzer — Sprint 148 Live Integration (T-009)', () => {
  let detector: DebtTrendAnalyzer;
  let mockGetByType: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Sprint 148 DIRECTIVES'teki threshold: %15, windowSize: son 3 sprint
    detector = new DebtTrendAnalyzer(0.15, 3);

    mockGetByType = vi.fn().mockReturnValue([]);
    MockedMemoryStore.mockImplementation(() => ({
      getByType: mockGetByType,
    } as unknown as InstanceType<typeof MemoryStore>));
  });

  // ── Test 4: Sprint 145-147 debt data → avgDebtRate calculation ────────────
  //
  // Gerçek sprint verisi ile avgDebtRate hesaplamasını doğrular.
  // Sprint 147 retro'su tetikleyici (sprint-148, windowSize=3 → 145+146+147).
  // avg = (0/23 + 6/17 + 24/28) / 3 ≈ 0.403 > 0.15 threshold → ALERT
  //
  it('Test 4: Sprint 145-147 gerçek debt verisi → avgDebtRate ~%40 hesaplanır, threshold aşıldı', () => {
    // Arrange — Sprint 148 retro event, son 3 sprint (145, 146, 147) verileri
    mockGetByType.mockReturnValue(makeSprint145to147Memories());

    const ctx = makeCtx();

    // Act
    const result = detector.detect(ctx);

    // Assert — threshold aşıldığı için result döner
    expect(result).not.toBeNull();

    const avgDebtRate = result!.metadata!['avgDebtRate'] as number;

    // Sprint 145: 24/28 = 0.8571..., Sprint 146: 6/17 = 0.3529..., Sprint 147: 0/23 = 0.0
    // avg = (0.8571 + 0.3529 + 0.0) / 3 = 1.2100 / 3 ≈ 0.4033
    expect(avgDebtRate).toBeGreaterThan(0.35);
    expect(avgDebtRate).toBeLessThan(0.45);
    // Threshold %15'i aşıyor
    expect(avgDebtRate).toBeGreaterThan(0.15);
  });

  // ── Test 5: Alert severity='warning', suggestedAction=DEBT_REPRIORITIZE ───
  //
  // DEBT_REPRIORITIZE eylem önerisinin varlığını ve label içeriğini doğrular.
  // T-009 Test 5: "Debt trend alert severity='warning', suggestedAction=DEBT_REPRIORITIZE"
  //
  it('Test 5: Sprint 145-147 verisi → severity=warning, suggestedAction=DEBT_REPRIORITIZE içerir', () => {
    // Arrange
    mockGetByType.mockReturnValue(makeSprint145to147Memories());

    const ctx = makeCtx();

    // Act
    const result = detector.detect(ctx);

    // Assert — severity, risk, suggestedAction doğrulaması
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('warning');
    expect(result!.risk).toBe('medium');
    expect(result!.shouldNotify).toBe(true);
    expect(result!.suggestedActions).toHaveLength(1);

    const action = result!.suggestedActions[0]!;
    expect(action.id).toBe('DEBT_REPRIORITIZE');

    // Label debt oranını göstermeli (40% civarı)
    expect(action.label).toContain('%');
    // re-prioritize içermeli
    expect(action.label.toLowerCase()).toContain('debt trending');
  });

  // ── Test 6: Retro event payload — sprint ID'leri listelenir ───────────────
  //
  // Sprint 148 RETRO'da "Detector Events" section'ı için:
  // payload.sprints alanı 3 sprint'in ID'lerini içermeli.
  // T-009 Test 6: "Sprint 148 retro'da debt-trend event listed"
  //
  it('Test 6: Payload sprint ID\'leri — sprint-145, sprint-146, sprint-147 listelenir', () => {
    // Arrange
    mockGetByType.mockReturnValue(makeSprint145to147Memories());

    const ctx = makeCtx();

    // Act
    const result = detector.detect(ctx);

    // Assert — payload.sprints alanı doğrulaması
    expect(result).not.toBeNull();
    expect(result!.suggestedActions[0]).toBeDefined();

    const payload = result!.suggestedActions[0]!.payload!;
    const sprints = payload['sprints'] as string[];

    expect(Array.isArray(sprints)).toBe(true);
    expect(sprints).toHaveLength(3);

    // Retro event'te listelenmesi gereken sprint ID'leri
    expect(sprints).toContain('sprint-147');
    expect(sprints).toContain('sprint-146');
    expect(sprints).toContain('sprint-145');

    // groupKey sprint-148 içermeli (Sprint 148 retro'su bağlamı)
    expect(result!.groupKey).toContain('sprint-148');

    // metadata'da type='debt-trend' doğrulaması
    expect(result!.metadata).toMatchObject({
      type: 'debt-trend',
      threshold: 0.15,
    });
  });
});

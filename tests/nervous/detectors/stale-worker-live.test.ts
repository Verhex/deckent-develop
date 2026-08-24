// tests/nervous/detectors/stale-worker-live.test.ts
//
// DetectorRegistry live activation tests — Sprint 148 Task 8
// 5 test case: registry boot, detectorIds, partial disable, error isolation, detection emit
// ADR-003: vitest over Jest

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DetectorRegistry } from '../../../src/nervous/detector-registry.js';
import type { DetectorConfig } from '../../../src/nervous/detector-registry.js';
import type { DetectorContext, SprintStateSnapshot, ObserverEvent } from '../../../src/core/nervous-types.js';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

const BASE_NOW = new Date('2026-04-20T10:00:00.000Z');

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
    sprintId: 'sprint-148',
    currentPhase: 'EXECUTE',
    activeWorkers: [],
    openDebtCount: 0,
    totalTasks: 28,
    completedTasks: 10,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<DetectorContext> = {}): DetectorContext {
  return {
    event: makeEvent(),
    sprintState: makeSprintState(),
    projectRoot: '/workspace',
    now: BASE_NOW,
    ...overrides,
  };
}

/** Tüm 5 detector enabled olan tam config */
const FULL_CONFIG: DetectorConfig = {
  stale_worker: { enabled: true, threshold_ms: 180_000 },
  scope_collision: { enabled: true },
  debt_trend: { enabled: true, threshold_rate: 0.15 },
  agent_routing: { enabled: true, anomaly_threshold: 0.4 },
  directives_protection: { enabled: true },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DetectorRegistry — Sprint 148 Live Activation', () => {
  // Test 1: Registry boot — 5 detector active (config tüm enabled)
  it('should boot with 5 active detectors when all enabled in config', () => {
    const registry = new DetectorRegistry(FULL_CONFIG);

    expect(registry.activeCount).toBe(5);
  });

  // Test 2: detectorIds includes all 5 expected IDs
  it('should expose all 5 detector IDs when fully configured', () => {
    const registry = new DetectorRegistry(FULL_CONFIG);
    const ids = registry.detectorIds;

    expect(ids).toContain('stale-worker');
    expect(ids).toContain('scope-collision');
    expect(ids).toContain('debt-trend');
    expect(ids).toContain('agent-routing');
    expect(ids).toContain('directives-protection');
    expect(ids).toHaveLength(5);
  });

  // Test 3: Config stale_worker.enabled=false → 4 active
  it('should have 4 active detectors when stale_worker disabled', () => {
    const partialConfig: DetectorConfig = {
      ...FULL_CONFIG,
      stale_worker: { enabled: false },
    };

    const registry = new DetectorRegistry(partialConfig);

    expect(registry.activeCount).toBe(4);
    expect(registry.detectorIds).not.toContain('stale-worker');
    expect(registry.detectorIds).toContain('scope-collision');
    expect(registry.detectorIds).toContain('debt-trend');
    expect(registry.detectorIds).toContain('agent-routing');
    expect(registry.detectorIds).toContain('directives-protection');
  });

  // Test 4: Detector throws → catch + log, other detectors continue
  it('should continue running other detectors when one throws', async () => {
    const registry = new DetectorRegistry(FULL_CONFIG);

    // StaleWorkerDetector cron+EXECUTE state'de stale worker yoksa null döner
    // AgentRoutingHealth cron event'ini işlemez → null
    // Tüm detector'lar null döndürdüğünde sonuç dizisi boş olur
    // Kritik olan: runAll() exception fırlatmamalı

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Bir detector'ı mock ile exception atan hale getirelim
    const brokenDetector = {
      detectorId: 'broken-test',
      detect: () => { throw new Error('Simulated detector failure'); },
    };

    // Registry'nin private active listesine erişmek için cast
    (registry as unknown as { active: typeof brokenDetector[] }).active.unshift(brokenDetector);

    const ctx = makeCtx();
    const results = await registry.runAll(ctx);

    // Broken detector'a rağmen runAll başarıyla tamamlanmalı
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DetectorRegistry] Detector broken-test failed:'),
      expect.any(Error),
    );

    // Other detectors still ran (results may be empty since TICK event + no stale workers)
    expect(Array.isArray(results)).toBe(true);

    consoleSpy.mockRestore();
  });

  // Test 5: Empty config → 0 active detectors (default constructor)
  it('should have 0 active detectors with empty config', () => {
    const registry = new DetectorRegistry({});

    expect(registry.activeCount).toBe(0);
    expect(registry.detectorIds).toHaveLength(0);
  });

  // Bonus: runAll returns array of results (no exceptions with valid ctx)
  it('should return results array from runAll without throwing', async () => {
    const registry = new DetectorRegistry(FULL_CONFIG);

    // Yeni sözleşme (sprint-661 host-primary rewrite): respawn önerisi yalnız
    // exact-attempt host authority'nin DEAD verdict'iyle doğar — activity/mtime
    // yaşına bakılmaz. Fixture host-dead verdict taşır.
    const staleWorker = {
      id: 'w-148-001',
      taskId: '148-001',
      lastHeartbeat: new Date(BASE_NOW.getTime() - 300_000).toISOString(), // 5dk önce
      liveness: {
        state: 'dead' as const,
        attemptId: 'attempt-148-001',
        hostSequence: 1,
        reason: 'host-observed process exit without result',
      },
    };

    const ctx = makeCtx({
      sprintState: makeSprintState({
        activeWorkers: [staleWorker],
      }),
    });

    const results = await registry.runAll(ctx);

    // StaleWorkerDetector cron + EXECUTE phase + stale worker → result üretmeli
    expect(Array.isArray(results)).toBe(true);
    const staleResult = results.find(r =>
      r.suggestedActions.some(a => a.id === 'WORKER_RESPAWN'),
    );
    expect(staleResult).toBeDefined();
    expect(staleResult?.risk).toBe('medium');
    expect(staleResult?.shouldNotify).toBe(true);
  });
});

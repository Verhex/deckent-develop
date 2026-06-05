/**
 * tests/orchestra/decay-config-wire.test.ts
 *
 * Sprint 232 Task 232-001 — PRIMARY memory-loss kök: config.decay_after_sprints
 * sprint-finalizer.ts'ten runDecay'e GEÇMİYORDU; runDecay hardcoded 8'e düşüyordu.
 * Threshold (currentSprint - 8 = 223) çok agresif → 91 → 1 entry memory-wipe.
 *
 * Bu test wire'ı 4 katmanda doğrular:
 *   1. runDecay opts.decaySprints=20 → MemoryStore.decay(num, 20)  (config honored)
 *   2. runDecay opts.decaySprints undefined → MemoryStore.decay(num, 8) (fallback)
 *   3. finalizeSprint with config.decay_after_sprints=20 + budget OVER →
 *      runDecay → MemoryStore.decay(num, 20)  (force-path wire)
 *   4. finalizeSprint with config.decay_after_sprints=20 + budget OK →
 *      runDecay → MemoryStore.decay(num, 20)  (normal-path wire)
 *
 * Hermetik: tmpdir bağımsız, tüm I/O mock. spawnSync YOK. ESM .js imports.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskEvaluation, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { Sprint, ResolvedConfig } from '../../src/core/types.js';

// ─── Shared MemoryStore spy (hoisted for vi.mock factories) ───────
// runDecay (real implementation) calls store.decay(currentSprintNum, decaySprints)
// — we capture the second arg to verify the config wire end-to-end.
const { mockDecay, mockTotalCount, mockStore, mockAuditBrainBudget } = vi.hoisted(() => {
  const mockDecay = vi.fn();
  const mockTotalCount = vi.fn(() => 1000);
  const mockStore = {
    decay: mockDecay, totalCount: mockTotalCount, close: vi.fn(),
    insert: vi.fn(), upsert: vi.fn(), softDelete: vi.fn(),
    getById: vi.fn(), getByType: vi.fn(() => []), countByType: vi.fn(() => new Map()),
    getRawDb: vi.fn(),
    getRelationsFrom: vi.fn(() => []), getRelationsTo: vi.fn(() => []),
    getRelations: vi.fn(() => []), countRelations: vi.fn(() => 0),
    insertRelation: vi.fn(), getSchemaVersion: vi.fn(() => 1),
    upsertSprintLog: vi.fn(),
  };
  const mockAuditBrainBudget = vi.fn(() => ({ status: 'OVER' as const, decayableLines: 2000, permanentLines: 100, totalLines: 2100 }));
  return { mockDecay, mockTotalCount, mockStore, mockAuditBrainBudget };
});

vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => mockStore),
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(() => true), // makes getMemoryStore() return a store
    readFileSync: vi.fn(() => '{}'),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    appendFileSync: vi.fn(),
    promises: {
      ...actual.promises,
      writeFile: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue(''),
      mkdir: vi.fn().mockResolvedValue(undefined),
    },
  };
});

// Partial mock — keep runDecay REAL, override auditBrainBudget so finalizeSprint
// hits the desired path (OVER/OK) without touching disk. This is the key trick:
// real runDecay + mocked memory-store lets us assert mockDecay args end-to-end.
vi.mock('../../src/orchestra/debt-manager.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/orchestra/debt-manager.js')>(
    '../../src/orchestra/debt-manager.js',
  );
  return { ...actual, auditBrainBudget: mockAuditBrainBudget };
});

// Minimal stubs so finalizeSprint reaches Step 7 (decay) without crashing.
vi.mock('../../src/orchestra/sprint-reporter.js', () => ({
  writeRetrospective: vi.fn(() => ({ sprintLogWritten: true, retroWritten: true, memoryWritten: true, dbAttempted: true })),
  appendRetroSection: vi.fn(), writeSprintLog: vi.fn(),
  calculateMetrics: vi.fn(() => ({ totalTasks: 0, completedTasks: 0, techDebtTasks: 0, noGoTasks: 0, durationMs: 0, coveragePercent: 0 })),
  updateProjectDocs: vi.fn(), buildAgentPerformance: vi.fn(() => []),
  archiveDirectives: vi.fn(), archiveOrphanTasks: vi.fn(() => 0),
}));
vi.mock('../../src/orchestra/sprint-docs-updater.js', () => ({ cleanTasksArchive: vi.fn() }));
vi.mock('../../src/orchestra/result-evaluator.js', () => ({
  GO_WITH_GATE_FAILURE: 'GO_WITH_GATE_FAILURE',
  getRecentSprintStats: vi.fn(() => ({ sprintCount: 0, avgNoGoRate: 0, avgCoverage: 80 })),
}));
vi.mock('../../src/monitor/auditor.js', () => ({
  tryCodeVerifiedDone: vi.fn().mockResolvedValue({ triggered: false, verified: false }),
  writeCodeVerifiedResult: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/orchestra/baseline-tracker.js', () => ({
  parseVitestOutput: vi.fn(() => ({ files: 0, pass: 0, fail: 0, skipped: 0 })),
  readBaseline: vi.fn(() => null), containsHonestyTrigger: vi.fn(() => false),
  captureVitestBaseline: vi.fn(),
}));
vi.mock('../../src/orchestra/result-collector.js', () => ({ buildResultsMap: vi.fn(() => new Map()) }));
vi.mock('../../src/core/observability.js', () => ({
  generateLoadReport: vi.fn().mockResolvedValue(''), initObservability: vi.fn(),
}));
vi.mock('../../src/core/observability-rotation.js', () => ({ rotateMetricsFile: vi.fn() }));
vi.mock('../../src/core/agent-pool.js', () => ({ AgentPoolManager: vi.fn(() => ({ loadAgents: vi.fn(() => new Map()), updateAgentStats: vi.fn() })) }));
vi.mock('../../src/core/skill-pool.js', () => ({ SkillPoolManager: vi.fn(() => ({ loadSkills: vi.fn(() => new Map()), updateSkillStats: vi.fn() })) }));
vi.mock('../../src/core/plugin-hooks.js', () => ({ runHooks: vi.fn() }));
vi.mock('../../src/cli/helpers/sprint-summary-rich.js', () => ({ formatRichSprintSummary: vi.fn(() => null) }));
vi.mock('../../src/orchestra/event-stream.js', () => ({
  writeEvent: vi.fn(), getCurrentSprintId: vi.fn(() => 'sprint-243'),
  CHANNELS: new Proxy({}, { get: (_, p) => String(p) }),
}));
vi.mock('../../src/core/identity-generator.js', () => ({
  runPostFinalizeHooks: vi.fn().mockResolvedValue({ memoryExport: { success: true, filesWritten: [], errors: [] }, identityRegen: { success: true, filePath: '', adrCount: 0, totalSprints: 1, reason: 'updated' }, ruleRegenCalled: false, errors: [] }),
  regenerateProjectIdentity: vi.fn(() => ({ success: true, filePath: '', adrCount: 0, totalSprints: 1, reason: 'updated' })),
  runMemoryExport: vi.fn().mockResolvedValue({ success: true, filesWritten: [], errors: [] }),
}));
vi.mock('../../src/core/memory-export.js', () => ({ writeGuardedExports: vi.fn(() => ({ written: [], skipped: [] })) }));
vi.mock('../../src/orchestra/task-restoration.js', () => ({ createPreArchiveSnapshot: vi.fn(), classifyTaskFiles: vi.fn(() => ({ archive: [], keep: [] })) }));
vi.mock('../../src/core/notify.js', () => ({ notify: vi.fn() }));
vi.mock('../../src/orchestra/sprint-utils.js', () => ({
  readFileSafe: vi.fn(() => ''), now: vi.fn(() => '2026-06-05T00:00:00Z'),
  writeSprintState: vi.fn(), SPRINT_STATE_FILE: '.deckent/sprint-state.json',
}));
vi.mock('../../src/orchestra/sprint-pid-manager.js', () => ({ clearPid: vi.fn() }));
vi.mock('../../src/core/sprint-file-retention.js', () => ({ runRetention: vi.fn() }));
vi.mock('../../src/core/debt-store.js', () => ({ getDebtItems: vi.fn(() => []) }));

// Imports after mocks
import { runDecay } from '../../src/orchestra/debt-manager.js';
import { finalizeSprint } from '../../src/orchestra/sprint-finalizer.js';

// ─── Helpers ──────────────────────────────────────────────────────
const makeSprint = (id: string): Sprint => ({
  id, number: parseInt(id.replace('sprint-', ''), 10),
  status: SprintStatus.ACTIVE, phase: SprintPhase.EVALUATE,
  tasks: [], workers: [],
});

const lastDecaySprintsArg = (): number | undefined => {
  const call = mockDecay.mock.calls.at(-1);
  return call ? (call[1] as number) : undefined;
};

beforeEach(() => {
  mockDecay.mockClear();
  mockTotalCount.mockClear();
  mockTotalCount.mockReturnValue(1000);
  mockAuditBrainBudget.mockClear();
});

// ─── Tests ────────────────────────────────────────────────────────

describe('runDecay — config.decay_after_sprints honored (Sprint 232 PRIMARY)', () => {
  it('honors caller-provided decaySprints (20) — does NOT fall to 8', () => {
    runDecay('/tmp/root', 'sprint-243', { force: true, decaySprints: 20 });
    expect(mockDecay).toHaveBeenCalledTimes(1);
    expect(mockDecay).toHaveBeenCalledWith(243, 20);
    expect(lastDecaySprintsArg()).toBe(20);
  });

  it('falls back to 8 only when decaySprints is undefined (legacy callers)', () => {
    runDecay('/tmp/root', 'sprint-243', { force: true });
    expect(mockDecay).toHaveBeenCalledTimes(1);
    expect(mockDecay).toHaveBeenCalledWith(243, 8);
  });
});

describe('finalizeSprint → runDecay receives config.decay_after_sprints', () => {
  it('wires decaySprints=20 from config when budget OVER (force-path)', async () => {
    mockAuditBrainBudget.mockReturnValue({ status: 'OVER', decayableLines: 2000, permanentLines: 100, totalLines: 2100 });
    const config = { decay_after_sprints: 20, memory_budget: 900 } as ResolvedConfig;
    await finalizeSprint('/tmp/project', makeSprint('sprint-243'), new Map(), [], { skipHooks: true, config });
    expect(mockDecay).toHaveBeenCalled();
    expect(lastDecaySprintsArg()).toBe(20);
    expect(lastDecaySprintsArg()).not.toBe(8); // regression guard — PRIMARY bug
  });

  it('wires decaySprints=20 from config when budget OK (normal-path)', async () => {
    mockAuditBrainBudget.mockReturnValue({ status: 'OK', decayableLines: 100, permanentLines: 100, totalLines: 200 });
    // Budget OK → normal-path runs runDecay without force. Need totalCount > budget
    // for the inner shouldRun gate to fire. We bump totalCount above the 900 default
    // budget so store.decay() actually runs end-to-end.
    mockTotalCount.mockReturnValue(2000);
    const config = { decay_after_sprints: 20, memory_budget: 900 } as ResolvedConfig;
    await finalizeSprint('/tmp/project', makeSprint('sprint-243'), new Map(), [], { skipHooks: true, config });
    expect(mockDecay).toHaveBeenCalled();
    expect(lastDecaySprintsArg()).toBe(20);
  });
});

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
 * Hermetik: gerçek mkdtempSync root (FAZ4A dersi: vi.mock('node:fs') finalizer'ın
 * terminal-receipt write→rename→readback zincirini taşıyamaz — RECORDED-FAILED
 * sınıfı). MemoryStore modül-mock kalır; decay argümanı oradan yakalanır.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskEvaluation, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { Sprint, ResolvedConfig, Task, TaskResult } from '../../src/core/types.js';

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

// node:fs GERÇEK kalır — finalizeSprint terminal-receipt'i tmp-yaz → rename →
// readback zinciriyle yayınlar; mock'lu fs bu zinciri koparıp
// TERMINAL_RECEIPT_PUBLICATION_FAILED üretir. getMemoryStore()'un store
// döndürmesi için tmp root'ta gerçek bir .brain/memory.db dosyası oluşturulur
// (MemoryStore constructor'ı zaten mock'lu — dosya içeriği okunmaz).

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
  parseVitestBaseline: vi.fn(() => ({ files: 0, pass: 0, fail: 0, skipped: 0 })),
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
const makeSprint = (id: string, tasks: Task[] = []): Sprint => ({
  id, number: parseInt(id.replace('sprint-', ''), 10),
  status: SprintStatus.ACTIVE, phase: SprintPhase.EVALUATE,
  tasks, workers: [],
});

// Finalizer terminal-evidence gerçeği: receipt cleanup-eligible olmak için en az
// bir SETTLED logical lineage ister (boş sprint = NO_LOGICAL_TASKS → BLOCKED →
// TERMINAL_RECEIPT_NOT_CLEANUP_ELIGIBLE fırlatır). Tek DONE task + host-VERIFIED
// workAttribution'lı (attempt-nonce'lu) result bu kapıyı dürüstçe açar.
const settledTask = (taskId: string): Task => ({
  id: taskId, title: `task ${taskId}`, description: 'settled fixture task',
  model: 'test-model', priority: 'NORMAL', reason: 'fixture',
  scope: { directories: ['.'], filesRead: [], filesWrite: [] },
  dependencies: [],
  goNogo: { goCriteria: 'done', noGoCriteria: 'failed', techDebtAcceptable: 'minor' },
  status: 'DONE', createdAt: '2026-06-05T00:00:00Z',
} as unknown as Task);

const settledResult = (taskId: string): TaskResult => ({
  taskId, workerId: `w-${taskId}`, filesChanged: [], linesAdded: 0, linesRemoved: 0,
  testsPassed: true, coverage: 0, selfAssessment: 'DONE', notes: '',
  workAttribution: {
    state: 'VERIFIED', attemptId: `attempt-${taskId}-1`,
    baselineRef: `baseline-${taskId}`, scopeDigest: `scope-${taskId}`,
  },
} as TaskResult);

const lastDecaySprintsArg = (): number | undefined => {
  const call = mockDecay.mock.calls.at(-1);
  return call ? (call[1] as number) : undefined;
};

// Gerçek tmp root fabrikası — .brain/memory.db dosyası getMemoryStore()'un
// existsSync kapısını açar (store'un kendisi modül-mock'tan gelir).
const createdRoots: string[] = [];
function makeProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-decay-wire-'));
  createdRoots.push(root);
  mkdirSync(join(root, '.brain'), { recursive: true });
  writeFileSync(join(root, '.brain', 'memory.db'), '');
  return root;
}

afterAll(() => {
  for (const root of createdRoots) {
    try { rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

beforeEach(() => {
  mockDecay.mockClear();
  mockTotalCount.mockClear();
  mockTotalCount.mockReturnValue(1000);
  mockAuditBrainBudget.mockClear();
});

// ─── Tests ────────────────────────────────────────────────────────

describe('runDecay — config.decay_after_sprints honored (Sprint 232 PRIMARY)', () => {
  it('honors caller-provided decaySprints (20) — does NOT fall to 8', () => {
    runDecay(makeProjectRoot(), 'sprint-243', { force: true, decaySprints: 20 });
    expect(mockDecay).toHaveBeenCalledTimes(1);
    expect(mockDecay).toHaveBeenCalledWith(243, 20);
    expect(lastDecaySprintsArg()).toBe(20);
  });

  it('falls back to 8 only when decaySprints is undefined (legacy callers)', () => {
    runDecay(makeProjectRoot(), 'sprint-243', { force: true });
    expect(mockDecay).toHaveBeenCalledTimes(1);
    expect(mockDecay).toHaveBeenCalledWith(243, 8);
  });
});

describe('finalizeSprint → runDecay receives config.decay_after_sprints', () => {
  it('wires decaySprints=20 from config when budget OVER (force-path)', async () => {
    mockAuditBrainBudget.mockReturnValue({ status: 'OVER', decayableLines: 2000, permanentLines: 100, totalLines: 2100 });
    const config = { decay_after_sprints: 20, memory_budget: 900 } as ResolvedConfig;
    await finalizeSprint(
      makeProjectRoot(),
      makeSprint('sprint-243', [settledTask('243-001')]),
      new Map([['243-001', TaskEvaluation.DONE]]),
      [settledResult('243-001')],
      { skipHooks: true, config },
    );
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
    await finalizeSprint(
      makeProjectRoot(),
      makeSprint('sprint-243', [settledTask('243-001')]),
      new Map([['243-001', TaskEvaluation.DONE]]),
      [settledResult('243-001')],
      { skipHooks: true, config },
    );
    expect(mockDecay).toHaveBeenCalled();
    expect(lastDecaySprintsArg()).toBe(20);
  });
});

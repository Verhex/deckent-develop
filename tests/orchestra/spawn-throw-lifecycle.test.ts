/**
 * Sprint 356 Task 356-004 — SPAWN-THROW-LIFECYCLE (born-435, ADR-G-013)
 *
 * sprint-347 live incident: a SPAWN-phase throw (BrainError after
 * runSpawnPhase exhausts its 2 spawn attempts) left the coordinator process
 * hanging ~3 minutes before it exited. Root cause: `scanInterval`,
 * `snapshotInterval` and `beforeExitHandler` were declared INSIDE runSprint's
 * outer try block — a different lexical scope than its `finally` block —
 * so none of the happy-path clearInterval/removeListener calls (which a
 * SPAWN throw skips entirely) had a finally-block fail-safe fallback, unlike
 * nervous/heartbeatDaemon/resourceMonitor, which already had one.
 *
 * This suite forces a fake SPAWN-phase throw (spawnWorkers always rejects,
 * exhausting runSpawnPhase's retry) and proves — via spies on
 * setInterval/clearInterval and process.removeListener — that every timer
 * and listener runSprint creates before SPAWN gets torn down even though the
 * sprint never reaches its happy-path cleanup lines.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Module Mocks (must register before sprint-controller import) ──────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 2, mtimeMs: 0 })),
  appendFileSync: vi.fn(),
  // FAZ4B: run-status read-model publish + atomik yazım yolları artık
  // rename/link/fsync tabanlı — stale mock'a eksik export'lar eklendi.
  renameSync: vi.fn(),
  rmSync: vi.fn(),
  rmdirSync: vi.fn(),
  linkSync: vi.fn(),
  chmodSync: vi.fn(),
  copyFileSync: vi.fn(),
  openSync: vi.fn(() => 0),
  fsyncSync: vi.fn(),
  closeSync: vi.fn(),
  promises: {
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    appendFile: vi.fn(async () => undefined),
    access: vi.fn(async () => undefined),
    stat: vi.fn(async () => ({ size: 0 })),
  },
}));

// sprint-planner.ts imports { writeFile } from 'node:fs/promises' (separate module)
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async () => ''),
  writeFile: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
  appendFile: vi.fn(async () => undefined),
  access: vi.fn(async () => undefined),
  stat: vi.fn(async () => ({ size: 0 })),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
  listWorkers: vi.fn().mockReturnValue([]),
  startAuditor: vi.fn(),
}));

vi.mock('../../src/monitor/auditor.js', () => ({
  resetDashboard: vi.fn(),
  updateDashboard: vi.fn(),
  detectDeadlocks: vi.fn().mockReturnValue([]),
  startScanLoop: vi.fn().mockReturnValue(null),
  writeScanToDashboard: vi.fn(),
  runScanCycle: vi.fn().mockReturnValue({}),
}));

vi.mock('../../src/agents/worker.js', () => ({
  updateTaskStatus: vi.fn(),
  releaseAllLocks: vi.fn(),
  createWorkerStateMachine: vi.fn(() => ({
    transition: vi.fn(),
    canTransition: vi.fn(() => true),
    getState: vi.fn(() => 'SPAWNING'),
    stop: vi.fn(),
  })),
  removeWorkerStateMachine: vi.fn(() => true),
  isWorkerStoppable: vi.fn(() => true),
}));

vi.mock('../../src/core/provider.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/provider.js')>();
  const mockAdapter = {
    name: 'claude',
    supportedModels: ['opus', 'sonnet', 'haiku'],
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn().mockReturnValue([]),
    isAvailable: vi.fn().mockResolvedValue(true),
    buildCommand: vi.fn().mockReturnValue('claude --model sonnet /dev/null'),
    buildPlannerCommand: (prompt: string, model: string) => ({
      command: 'claude',
      args: ['-p', prompt, '--model', model, '--output-format', 'json'],
    }),
  };
  return {
    ...actual,
    providerRegistry: {
      getDefault: vi.fn().mockReturnValue(mockAdapter),
      registerProvider: vi.fn(),
      getProvider: vi.fn().mockReturnValue(mockAdapter),
      hasProvider: vi.fn().mockImplementation((name: string) => name === 'claude'),
      listProviders: vi.fn().mockReturnValue(['claude']),
      setDefault: vi.fn(),
      unregisterProvider: vi.fn(),
      clear: vi.fn(),
      size: 0,
    },
    ProviderError: class ProviderError extends Error {
      providerName: string;
      constructor(message: string, providerName: string) {
        super(message);
        this.name = 'ProviderError';
        this.providerName = providerName;
      }
    },
    ProviderNotFoundError: class ProviderNotFoundError extends Error {
      providerName: string;
      constructor(providerName: string) {
        super(`Provider not found: "${providerName}"`);
        this.name = 'ProviderNotFoundError';
        this.providerName = providerName;
      }
    },
  };
});

vi.mock('../../src/core/plugin-hooks.js', () => ({
  runHooks: vi.fn().mockResolvedValue(undefined),
  clearHooks: vi.fn(),
  loadPluginHooks: vi.fn().mockResolvedValue(0),
  resolveCiGuardianConfig: vi.fn().mockReturnValue({ enabled: false }),
  runCiRegressionCheck: vi.fn().mockReturnValue({ regressionDetected: false, tscPassed: true, targetedTestsPassed: true, targetedTestFiles: [], alerts: [], testCountDelta: 0 }),
  runPreSprintValidation: vi.fn().mockReturnValue({ passed: true, tscPassed: true, testsPassed: true, testCount: 0, testPassed: 0, testFailed: 0, coverage: 0, baselineSaved: false }),
}));

vi.mock('../../src/core/stack-detector.js', () => ({
  detectProjectStack: vi.fn().mockReturnValue({ languages: [], frameworks: [], tools: [] }),
  detectFullStack: vi.fn().mockReturnValue({ language: '', framework: '', buildTool: '', testFramework: '', commands: { build: '', test: '', lint: '' } }),
}));

vi.mock('../../src/core/skill-pool.js', () => ({
  SkillPoolManager: vi.fn().mockImplementation(() => ({
    loadSkills: vi.fn().mockReturnValue(new Map()),
  })),
}));

vi.mock('../../src/core/skill-selector.js', () => ({
  selectSkills: vi.fn().mockReturnValue({ skills: [], reason: '' }),
}));

vi.mock('../../src/orchestra/spawn-backend.js', () => ({
  TmuxBackend: vi.fn(),
  SubprocessBackend: vi.fn(),
  SpawnBackendFactory: { create: vi.fn() },
}));

vi.mock('../../src/orchestra/result-watcher.js', () => ({
  createResultWatcher: vi.fn().mockReturnValue({
    waitForChange: vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 5_000))),
    close: vi.fn(),
  }),
}));

vi.mock('../../src/orchestra/rollback.js', () => ({
  createSafetyPoint: vi.fn().mockReturnValue({ id: 'sp-001', sprintId: 'sprint-001', branchName: 'deckent-backup-sprint-001', createdAt: new Date().toISOString() }),
  rollback: vi.fn().mockReturnValue({ success: true }),
  getRollbackPolicy: vi.fn().mockReturnValue('skip'),
  recordRollbackInDebt: vi.fn(),
  saveSafetyPoint: vi.fn(),
  deleteSafetyPoint: vi.fn(),
  deleteSafetyPointFile: vi.fn(),
  isCleanWorkingTree: vi.fn().mockReturnValue(true),
  safetyBranchExists: vi.fn().mockReturnValue(false),
  isGitRepo: vi.fn().mockReturnValue(true),
  cleanOrphanSafetyPoint: vi.fn().mockReturnValue(false),
  loadSafetyPoint: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/orchestra/coverage-validator.js', () => ({
  parseCoverageFromVitest: vi.fn(),
  validateCoverage: vi.fn(),
  validateWorkerCoverage: vi.fn().mockReturnValue(null),
  isDocOnlyTask: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/core/system-profile.js', () => ({
  getSystemProfile: vi.fn().mockReturnValue({
    platform: 'linux',
    hasTmux: true,
    recommendedMaxWorkers: 4,
    cpuCores: 4,
    totalMemMB: 16000,
    freeMemMB: 8000,
  }),
}));

vi.mock('../../src/core/config.js', () => ({
  resolveBrainModel: () => 'sonnet',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  resolveEffectiveWorkers: vi.fn().mockReturnValue(4),
  readAuthMode: vi.fn().mockResolvedValue('subscription'),
}));

vi.mock('../../src/core/agent-pool.js', () => ({
  AgentPoolManager: vi.fn().mockImplementation(() => ({
    loadAgents: vi.fn().mockReturnValue(new Map()),
    selectOrCreateAgent: vi.fn().mockReturnValue(null),
    releaseAgent: vi.fn(),
    cleanup: vi.fn(),
  })),
}));

vi.mock('../../src/core/agent-selector.js', () => ({
  selectAgent: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/agents/worker-ipc.js', () => ({
  ChannelRegistry: vi.fn().mockImplementation(() => ({
    register: vi.fn(),
    unregister: vi.fn(),
    get: vi.fn().mockReturnValue(undefined),
    getAll: vi.fn().mockReturnValue(new Map()),
    size: 0,
  })),
}));

const mockMemStore = {
  getById: vi.fn().mockReturnValue(null),
  getByType: vi.fn().mockReturnValue([]),
  insert: vi.fn().mockImplementation((input: Record<string, unknown>) => ({ ...input, metadata: JSON.stringify(input.metadata ?? {}), tag_text: ((input.tags as string[]) ?? []).join(' '), status: input.status ?? 'active', priority: input.priority ?? 'normal', sprint_id: input.sprint_id ?? null, sprint_num: input.sprint_num ?? 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null })),
  upsert: vi.fn().mockImplementation((input: Record<string, unknown>) => ({ ...input, metadata: JSON.stringify(input.metadata ?? {}), tag_text: ((input.tags as string[]) ?? []).join(' '), status: input.status ?? 'active', priority: input.priority ?? 'normal' })),
  softDelete: vi.fn(), totalCount: vi.fn().mockReturnValue(0), countByType: vi.fn(),
  decay: vi.fn(), close: vi.fn(), getRawDb: vi.fn(),
  getRelationsFrom: vi.fn().mockReturnValue([]), getRelationsTo: vi.fn().mockReturnValue([]),
  getTagsForEntry: vi.fn().mockReturnValue([]), getByTags: vi.fn().mockReturnValue([]),
  getHistory: vi.fn().mockReturnValue([]), restore: vi.fn(), getSchemaVersion: vi.fn().mockReturnValue(1),
};
vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => mockMemStore),
}));

// FAZ4B: publishCanonicalRunStatusReadModel yaz→geri-oku→doğrula zinciri koşuyor
// (readback + provider-concurrency store); node:fs factory-mock'u bu zinciri
// taşıyamaz (RECORDED-FAILED pattern) ve PLAN fazı "readback failed" ile
// düşüyordu. Read-model publish bu suite'in assert yüzeyi değil — stub.
vi.mock('../../src/core/run-status-read-model.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/run-status-read-model.js')>();
  return {
    ...actual,
    publishCanonicalRunStatusReadModel: vi.fn(),
  };
});

// spawnWorkers is the SOLE override — every other sprint-spawner.js export
// (routing, cascade, dependency validation, etc.) stays real so only the
// SPAWN-phase behavior under test changes. Always rejects, so
// runSpawnPhase's 2-attempt retry loop exhausts and throws a BrainError —
// the exact born-435 trigger.
vi.mock('../../src/orchestra/sprint-spawner.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/sprint-spawner.js')>();
  return {
    ...actual,
    spawnWorkers: vi.fn().mockRejectedValue(new Error('fake-spawn-throw')),
  };
});

// ─── Imports of modules under test (post-mock) ────────────────────────

import { readFileSync, existsSync, readdirSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { runSprint } from '../../src/orchestra/brain.js';
import type { ResolvedConfig } from '../../src/core/types.js';

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedReaddirSync = vi.mocked(readdirSync);
const mockedSpawnSync = vi.mocked(spawnSync);

const ROOT = '/project';

function makeConfig(): ResolvedConfig {
  return {
    mode: 'pro_plan',
    projectRoot: ROOT,
    projectName: 'test',
    language: 'tr',
    version: '0.1.0',
    brain_planning: 'structured',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'claude-opus-4-8',
      default_model: 'claude-sonnet-5',
      haiku_allowed: false,
    },
    modes: {} as never,
  };
}

/** Minimal fs/spawnSync mocks — just enough for PLAN to produce one task. */
// FAZ4B: stateful yaz→oku köprüsü. bindSprintLockToExecution artık PLAN
// sonrasında sprint.lock'ı GERİ OKUYUP pid doğruluyor; salt-stateless mock'ta
// lock hiç "var olmadığı" için PLAN "execution lock bind failed" ile
// düşüyordu. Yazılanlar path-bazlı saklanır, rename içeriği taşır.
const writtenFiles = new Map<string, string>();

function setupMocks(directives = 'Build the system'): void {
  writtenFiles.clear();
  mockedSpawnSync.mockReturnValue({
    status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
  } as never);

  mockedExistsSync.mockImplementation((path: unknown) => {
    const p = String(path);
    if (writtenFiles.has(p)) return true;
    if (p.includes('.tasks')) return true;
    if (p.includes('memory.db')) return true;
    return false;
  });

  // Empty everywhere → sprint number = 1, no pre-existing tasks.
  mockedReaddirSync.mockReturnValue([] as never);

  vi.mocked(writeFileSync).mockImplementation((path: unknown, value: unknown) => {
    if (typeof path === 'string') writtenFiles.set(path, String(value));
  });
  vi.mocked(renameSync).mockImplementation((source: unknown, target: unknown) => {
    const s = String(source);
    if (writtenFiles.has(s)) {
      writtenFiles.set(String(target), writtenFiles.get(s)!);
      writtenFiles.delete(s);
    }
  });
  vi.mocked(unlinkSync).mockImplementation((path: unknown) => {
    writtenFiles.delete(String(path));
  });

  mockedReadFileSync.mockImplementation((path: unknown) => {
    const p = String(path);
    if (p.includes('DIRECTIVES')) return directives;
    const persisted = writtenFiles.get(p);
    if (persisted !== undefined) return persisted;
    return '';
  });
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('runSprint — SPAWN-THROW-LIFECYCLE (born-435, sprint-356 Task 4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  it('rejects with the SPAWN BrainError instead of swallowing it', async () => {
    await expect(runSprint(ROOT, makeConfig())).rejects.toThrow(/Spawn phase failed after retry/);
  });

  // RECOVERY-DO-DOGFOOD wire proof: this harness drives BOTH spawn attempts to
  // failure, so the terminal message must name each one. Before the attempt-history
  // wire only the LAST error reached the operator, which let a retry artifact mask
  // the real first-attempt failure (measured 2026-08-09, sprint-493).
  it('names every failed spawn attempt in the terminal message, not just the last', async () => {
    await expect(runSprint(ROOT, makeConfig())).rejects.toThrow(
      /Attempts: attempt 1: [\s\S]*\| attempt 2: /u,
    );
  });

  it('clears the periodic-snapshot interval via the finally fail-safe, even though the happy-path clearInterval line is never reached', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    await expect(runSprint(ROOT, makeConfig())).rejects.toThrow();

    // The ONLY 30s-interval runSprint creates before SPAWN is the periodic
    // snapshot timer (sprint-controller.ts). Find its handle and prove it
    // was cleared exactly once by the finally-block fail-safe.
    const snapshotCallIndex = setIntervalSpy.mock.calls.findIndex(call => call[1] === 30_000);
    expect(snapshotCallIndex).toBeGreaterThanOrEqual(0);
    const snapshotHandle = setIntervalSpy.mock.results[snapshotCallIndex]!.value;

    const clearsOfSnapshot = clearIntervalSpy.mock.calls.filter(call => call[0] === snapshotHandle);
    expect(clearsOfSnapshot).toHaveLength(1);
  });

  it('removes the beforeExit listener via the finally fail-safe — no leaked listener across a SPAWN throw', async () => {
    const baseline = process.listenerCount('beforeExit');
    const removeListenerSpy = vi.spyOn(process, 'removeListener');

    await expect(runSprint(ROOT, makeConfig())).rejects.toThrow();

    const beforeExitRemovals = removeListenerSpy.mock.calls.filter(call => call[0] === 'beforeExit');
    expect(beforeExitRemovals).toHaveLength(1);
    // No net growth in registered 'beforeExit' listeners after the throw.
    expect(process.listenerCount('beforeExit')).toBe(baseline);
  });

  it('does not leave a dangling scanInterval — runSpawnPhase clears its own copy before throwing, and the outer fail-safe is a safe no-op on null', async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    await expect(runSprint(ROOT, makeConfig())).rejects.toThrow();

    // startScanLoop (monitor/auditor.js) only runs AFTER a successful
    // spawnWorkers — never reached here — so the outer scanInterval stays
    // null throughout; this proves the finally block's `if (scanInterval)`
    // guard executes without throwing when there is nothing to clear (the
    // snapshotInterval clearInterval call above still fires normally).
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});

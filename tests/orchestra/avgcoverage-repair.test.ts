/**
 * tests/orchestra/avgcoverage-repair.test.ts
 *
 * born-591 AVGCOVERAGE-REPAIR (P0) — sprint-finalizer.ts's "8d2" agent/skill
 * manifest-sync block (the ONLY live call site that writes agent.stats.avgCoverage /
 * skill.stats.avgCoverage — AgentPoolManager.updateAgentStats/SkillPoolManager.
 * updateSkillStats are exported+tested but never called from the live finalize path)
 * had two bugs:
 *   (a) phantom-zero-dilution — a task result with NO real coverage measurement
 *       (`result.coverage === undefined`) was treated as a literal 0% and diluted
 *       the average, instead of being excluded as a MEASUREMENT GAP.
 *   (b) the skill side never computed/wrote avgCoverage at all (always stayed 0).
 *
 * This file proves both are fixed, and that the "twin" running-average methods in
 * agent-pool.ts / skill-pool.ts (updateAgentStats / updateSkillStats) got the same
 * dilution-fix (a `coverage: null` call must not move avgCoverage).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskEvaluation, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { Sprint, Task, TaskResult } from '../../src/core/types.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';

// ─── Mocks (mirrors tests/orchestra/sprint-finalizer.test.ts's finalizeSprint harness) ──

vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockReturnValue('{}'),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  unlinkSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 2, mtimeMs: 0 })),
  appendFileSync: vi.fn(),
  promises: {
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(''),
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: '' }),
}));

vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/utils.js')>();
  return {
    ...actual,
    parseDebtTable: vi.fn().mockReturnValue([]),
    updateLastSprintId: vi.fn(),
    debugLog: vi.fn(),
  };
});

vi.mock('../../src/orchestra/sprint-reporter.js', () => ({
  writeRetrospective: vi.fn(),
  appendRetroSection: vi.fn(),
  writeSprintLog: vi.fn(),
  calculateMetrics: vi.fn().mockReturnValue({
    totalTasks: 1,
    completedTasks: 1,
    techDebtTasks: 0,
    noGoTasks: 0,
    durationMs: 1000,
    coverage: 95,
  }),
  updateProjectDocs: vi.fn(),
  buildAgentPerformance: vi.fn().mockReturnValue([]),
  archiveDirectives: vi.fn(),
  archiveOrphanTasks: vi.fn().mockReturnValue(0),
}));

vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => ({
    insertRelation: vi.fn(),
    close: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn(),
    getById: vi.fn(),
    getByType: vi.fn().mockReturnValue([]),
    countByType: vi.fn().mockReturnValue(new Map()),
    totalCount: vi.fn().mockReturnValue(0),
    getSchemaVersion: vi.fn().mockReturnValue(1),
    getRawDb: vi.fn(),
    getRelationsFrom: vi.fn().mockReturnValue([]),
    getRelationsTo: vi.fn().mockReturnValue([]),
    getRelations: vi.fn().mockReturnValue([]),
    countRelations: vi.fn().mockReturnValue(0),
  })),
}));

vi.mock('../../src/orchestra/result-evaluator.js', () => ({
  GO_WITH_GATE_FAILURE: 'GO_WITH_GATE_FAILURE',
  getRecentSprintStats: vi.fn().mockReturnValue({ sprintCount: 0, avgNoGoRate: 0, avgCoverage: 80 }),
  tryCodeVerifiedDone: vi.fn().mockResolvedValue({ triggered: false, verified: false }),
  writeCodeVerifiedResult: vi.fn().mockResolvedValue(undefined),
  CODE_VERIFIED_DONE: 'CODE_VERIFIED_DONE',
  parseEvidenceCommand: vi.fn().mockReturnValue(null),
  CodeVerifyOptions: undefined,
  CodeVerifyResult: undefined,
}));

vi.mock('../../src/monitor/auditor.js', () => ({
  tryCodeVerifiedDone: vi.fn().mockResolvedValue({ triggered: false, verified: false }),
  writeCodeVerifiedResult: vi.fn().mockResolvedValue(undefined),
  CODE_VERIFIED_DONE: 'CODE_VERIFIED_DONE',
  parseEvidenceCommand: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/orchestra/baseline-tracker.js', () => ({
  parseVitestBaseline: vi.fn().mockReturnValue({ files: 0, pass: 0, fail: 0, skipped: 0 }),
  readBaseline: vi.fn().mockReturnValue(null),
  containsHonestyTrigger: vi.fn().mockReturnValue(false),
  captureVitestBaseline: vi.fn(),
}));

vi.mock('../../src/orchestra/debt-manager.js', () => ({
  runDecay: vi.fn(),
  auditBrainBudget: vi.fn().mockReturnValue({ status: 'OK', decayableLines: 0, permanentLines: 0 }),
}));

// AgentPoolManager / SkillPoolManager — stubbed with externally-controllable
// getAgent/saveAgent/getSkill/saveSkill so each "8d2 sync" test can assert
// exactly what finalizeSprint computed and wrote. Group C (below) bypasses this
// mock via vi.importActual to exercise the REAL classes directly.
const mockGetAgent = vi.fn();
const mockSaveAgent = vi.fn();
const mockGetSkill = vi.fn();
const mockSaveSkill = vi.fn();
vi.mock('../../src/core/agent-pool.js', () => ({
  AgentPoolManager: vi.fn().mockImplementation(() => ({
    loadAgents: vi.fn().mockReturnValue(new Map()),
    updateAgentStats: vi.fn(),
    getAgent: mockGetAgent,
    saveAgent: mockSaveAgent,
    // born-605 (405-003): finalizer stats'ı artık sidecar-API'ye yazar.
    saveAgentStats: mockSaveAgent,
  })),
}));
vi.mock('../../src/core/skill-pool.js', () => ({
  SkillPoolManager: vi.fn().mockImplementation(() => ({
    loadSkills: vi.fn().mockReturnValue(new Map()),
    updateSkillStats: vi.fn(),
    getSkill: mockGetSkill,
    saveSkill: mockSaveSkill,
    saveSkillStats: mockSaveSkill,
  })),
}));

vi.mock('../../src/core/plugin-hooks.js', () => ({
  runHooks: vi.fn(),
  loadPluginHooks: vi.fn(),
  clearHooks: vi.fn(),
}));

vi.mock('../../src/orchestra/sprint-utils.js', () => ({
  readFileSafe: vi.fn().mockReturnValue(''),
  now: vi.fn().mockReturnValue('2026-07-10T12:00:00Z'),
}));

vi.mock('../../src/cli/helpers/sprint-summary-rich.js', () => ({
  formatRichSprintSummary: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/core/observability.js', () => ({
  generateLoadReport: vi.fn().mockResolvedValue('# Report\n\n## Wave Timeline\n\nNo wave data recorded.\n'),
  initObservability: vi.fn(),
  structuredLog: vi.fn(),
  metric: vi.fn(),
  trace: vi.fn(),
  TELEMETRY_ENABLED: false,
  setObservabilitySprintId: vi.fn(),
  getObservabilitySprintId: vi.fn().mockReturnValue(null),
  getMetricsPath: vi.fn().mockReturnValue('/tmp/metrics.jsonl'),
  getPerSprintMetricsPath: vi.fn().mockReturnValue(null),
  resetObservability: vi.fn(),
}));

vi.mock('../../src/core/identity-generator.js', () => ({
  runPostFinalizeHooks: vi.fn().mockResolvedValue({
    memoryExport: { success: true, filesWritten: [], errors: [] },
    identityRegen: { success: true, filePath: '', adrCount: 0, totalSprints: 1, reason: 'updated' },
    ruleRegenCalled: false,
    errors: [],
  }),
  regenerateProjectIdentity: vi.fn().mockReturnValue({ success: true, filePath: '', adrCount: 0, totalSprints: 1, reason: 'updated' }),
  runMemoryExport: vi.fn().mockResolvedValue({ success: true, filesWritten: [], errors: [] }),
}));

vi.mock('../../src/orchestra/event-stream.js', () => ({
  writeEvent: vi.fn().mockReturnValue(null),
  getCurrentSprintId: vi.fn().mockReturnValue('sprint-591'),
  readSequence: vi.fn().mockReturnValue(0),
  CHANNELS: {
    TASK_ASSIGN: 'BRAIN→WORKER:TASK_ASSIGN',
    HEARTBEAT: 'WORKER→BRAIN:HEARTBEAT',
    RESULT: 'WORKER→BRAIN:RESULT',
    QUESTION: 'WORKER→BRAIN:QUESTION',
    ANSWER: 'BRAIN→WORKER:ANSWER',
    CODE_VERIFY_REQUEST: 'WORKER→AUDITOR:CODE_VERIFY_REQUEST',
    VERIFICATION_RESULT: 'AUDITOR→BRAIN:VERIFICATION_RESULT',
    SCOPE_COLLISION_DETECTED: 'AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED',
    ADR_VIOLATION: 'AUDITOR→BRAIN:ADR_VIOLATION',
    GATE_COMPUTED: 'AUDITOR→BRAIN:GATE_COMPUTED',
    LOAD_REPORT_WRITTEN: 'AUDITOR→BRAIN:LOAD_REPORT_WRITTEN',
    METRIC_EMITTED: 'BRAIN→*:METRIC_EMITTED',
    FIX_REQUEST: 'BRAIN→WORKER:FIX_REQUEST',
    SPRINT_PHASE_CHANGE: 'BRAIN→*:SPRINT_PHASE_CHANGE',
    NOTIFY: 'DECKENT→USER:NOTIFY',
    ORPHAN_HB_DETECTED: 'AUDITOR→BRAIN:ORPHAN_HB_DETECTED',
    AUTHORITY_VIOLATION: 'AUDITOR→BRAIN:AUTHORITY_VIOLATION',
  },
}));

import * as nodeFsMod from 'node:fs';
import { finalizeSprint } from '../../src/orchestra/sprint-finalizer.js';

// ─── Fixture Helpers ──────────────────────────────────────────────────────

function makeSprint(id: string, tasks: Task[]): Sprint {
  return {
    id,
    number: 591,
    status: SprintStatus.COMPLETE,
    phase: SprintPhase.COMPLETE,
    tasks,
    workers: [],
  };
}

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: 'fixture task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'done', noGoCriteria: 'fail', techDebtAcceptable: 'none' },
    status: 'DONE',
    ...overrides,
  } as unknown as Task;
}

function makeResult(taskId: string, overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: [],
    linesAdded: 1,
    linesRemoved: 0,
    testsPassed: true,
    selfAssessment: 'DONE',
    notes: '',
    ...overrides,
  } as unknown as TaskResult;
}

/** A result whose `coverage` is a genuine MEASUREMENT GAP — the field is simply absent. */
function makeResultNoCoverage(taskId: string, overrides: Partial<TaskResult> = {}): TaskResult {
  const r = makeResult(taskId, overrides) as Record<string, unknown>;
  delete r.coverage;
  return r as unknown as TaskResult;
}

function makeEvaluations(tasks: Task[]): Map<string, TaskEvaluation> {
  return new Map(tasks.map(t => [t.id, TaskEvaluation.DONE]));
}

beforeEach(() => {
  // clearAllMocks (NOT resetAllMocks) — clears call history only. resetAllMocks
  // would also wipe the default return values baked into the vi.mock(...) factories
  // above (calculateMetrics, getRecentSprintStats, etc.), which are set exactly
  // once at module-eval time and never re-applied per test.
  vi.clearAllMocks();
  const fsMod = nodeFsMod as unknown as {
    existsSync: ReturnType<typeof vi.fn>;
    readFileSync: ReturnType<typeof vi.fn>;
    readdirSync: ReturnType<typeof vi.fn>;
    writeFileSync: ReturnType<typeof vi.fn>;
    mkdirSync: ReturnType<typeof vi.fn>;
    promises: { writeFile: ReturnType<typeof vi.fn>; mkdir: ReturnType<typeof vi.fn>; readFile: ReturnType<typeof vi.fn> };
  };
  fsMod.existsSync.mockReturnValue(false);
  fsMod.readFileSync.mockReturnValue('{}');
  fsMod.readdirSync.mockReturnValue([]);
  fsMod.writeFileSync.mockReturnValue(undefined);
  fsMod.mkdirSync.mockReturnValue(undefined);
  fsMod.promises.writeFile.mockResolvedValue(undefined);
  fsMod.promises.mkdir.mockResolvedValue(undefined);
  fsMod.promises.readFile.mockResolvedValue('');
});

// ═══ Group A — agent block (sprint-finalizer "8d2" sync) ═══════════════════

describe('avgCoverage — agent block (sprint-finalizer 8d2 sync)', () => {
  it('excludes coverage-less results from the average (phantom-zero-dilution fix)', async () => {
    mockGetAgent.mockReturnValue({ id: 'bug-fixer', stats: undefined });

    const tasks = [
      makeTask('t1', { assignedAgent: 'bug-fixer' }),
      makeTask('t2', { assignedAgent: 'bug-fixer' }), // no result at all — measurement gap
      makeTask('t3', { assignedAgent: 'bug-fixer' }),
    ];
    const results = [
      makeResult('t1', { coverage: 90 }),
      makeResult('t3', { coverage: 80 }),
    ];
    const sprint = makeSprint('sprint-591a', tasks);

    await finalizeSprint('/tmp/project', sprint, makeEvaluations(tasks), results, { skipDecay: true, skipHooks: true });

    expect(mockSaveAgent).toHaveBeenCalled();
    // born-605: yeni imza saveAgentStats(id, stats) — stats arg[1]'de.
    const saved = { stats: mockSaveAgent.mock.calls[0][1] };
    // (90+80)/2 = 85 — NOT (90+0+80)/3 = 56.67 (the old phantom-zero-dilution result)
    expect(saved.stats.avgCoverage).toBeCloseTo(85, 5);
  });

  it('blends new coverage-bearing samples with prior real history, excluding this sprint\'s non-covered task from the weight', async () => {
    mockGetAgent.mockReturnValue({
      id: 'bug-fixer',
      stats: { totalUses: 5, successRate: 1, avgCoverage: 70, lastUsedInSprint: 'sprint-500' },
    });

    const tasks = [
      makeTask('t1', { assignedAgent: 'bug-fixer' }),
      makeTask('t2', { assignedAgent: 'bug-fixer' }),
      makeTask('t3', { assignedAgent: 'bug-fixer' }),
    ];
    const results = [
      makeResult('t1', { coverage: 90 }),
      makeResultNoCoverage('t2'),
      makeResult('t3', { coverage: 80 }),
    ];
    const sprint = makeSprint('sprint-591b', tasks);

    await finalizeSprint('/tmp/project', sprint, makeEvaluations(tasks), results, { skipDecay: true, skipHooks: true });

    // born-605: yeni imza saveAgentStats(id, stats) — stats arg[1]'de.
    const saved = { stats: mockSaveAgent.mock.calls[0][1] };
    // (70*5 + 85*2) / (5+2) = 520/7 — the non-covered task contributes to NEITHER
    // the numerator nor the denominator.
    expect(saved.stats.avgCoverage).toBeCloseTo(520 / 7, 5);
  });

  it('treats a genuine 0% coverage result as a real sample, not a measurement gap', async () => {
    mockGetAgent.mockReturnValue({
      id: 'bug-fixer',
      stats: { totalUses: 1, successRate: 1, avgCoverage: 99, lastUsedInSprint: 'sprint-500' },
    });

    const tasks = [makeTask('t1', { assignedAgent: 'bug-fixer' })];
    const results = [makeResult('t1', { coverage: 0 })];
    const sprint = makeSprint('sprint-591c', tasks);

    await finalizeSprint('/tmp/project', sprint, makeEvaluations(tasks), results, { skipDecay: true, skipHooks: true });

    // born-605: yeni imza saveAgentStats(id, stats) — stats arg[1]'de.
    const saved = { stats: mockSaveAgent.mock.calls[0][1] };
    // (99*1 + 0*1) / (1+1) = 49.5 — proves the blend ran at all. The OLD code's
    // `if (avgCov > 0 ...)` guard treated a genuine 0% as falsy and skipped the
    // update entirely, leaving avgCoverage stale at 99.
    expect(saved.stats.avgCoverage).toBeCloseTo(49.5, 5);
  });
});

// ═══ Group B — skill block (sprint-finalizer "8d2" sync) ═══════════════════

describe('avgCoverage — skill block (sprint-finalizer 8d2 sync)', () => {
  it('writes skill avgCoverage — previously never computed at all (always stayed 0)', async () => {
    mockGetSkill.mockReturnValue({ id: 'typescript-expert', stats: undefined });

    const tasks = [
      makeTask('t1', { assignedSkills: ['typescript-expert'] }),
      makeTask('t2', { assignedSkills: ['typescript-expert'] }), // measurement gap
      makeTask('t3', { assignedSkills: ['typescript-expert'] }),
    ];
    const results = [
      makeResult('t1', { coverage: 100 }),
      makeResultNoCoverage('t2'),
      makeResult('t3', { coverage: 60 }),
    ];
    const sprint = makeSprint('sprint-591d', tasks);

    await finalizeSprint('/tmp/project', sprint, makeEvaluations(tasks), results, { skipDecay: true, skipHooks: true });

    expect(mockSaveSkill).toHaveBeenCalled();
    const saved = { stats: mockSaveSkill.mock.calls[0][1] };
    // (100+60)/2 = 80 — NOT diluted by t2's measurement gap, and no longer stuck at 0.
    expect(saved.stats.avgCoverage).toBeCloseTo(80, 5);
  });

  it('still writes successCount alongside avgCoverage (no regression to the existing field)', async () => {
    mockGetSkill.mockReturnValue({ id: 'typescript-expert', stats: undefined });

    const tasks = [makeTask('t1', { assignedSkills: ['typescript-expert'] })];
    const results = [makeResult('t1', { coverage: 100 })];
    const sprint = makeSprint('sprint-591e', tasks);

    await finalizeSprint('/tmp/project', sprint, makeEvaluations(tasks), results, { skipDecay: true, skipHooks: true });

    const saved = { stats: mockSaveSkill.mock.calls[0][1] };
    expect(saved.stats.successCount).toBe(1);
    expect(saved.stats.avgCoverage).toBeCloseTo(100, 5);
  });
});

// ═══ Group C — updateAgentStats / updateSkillStats twin fix ════════════════
// Bypasses this file's module-level agent-pool.js/skill-pool.js mock via
// vi.importActual to exercise the REAL classes end-to-end against a real tmpdir
// (Test Hermeticity: no gitignored state, cleaned up in afterEach).

describe('updateAgentStats / updateSkillStats — null coverage does not dilute avgCoverage (born-591 twin fix)', () => {
  let tempDir: string;

  beforeEach(async () => {
    const realFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    tempDir = realFs.mkdtempSync(join(tmpdir(), 'avgcov-pool-'));

    const fsMod = nodeFsMod as unknown as {
      existsSync: ReturnType<typeof vi.fn>;
      readFileSync: ReturnType<typeof vi.fn>;
      readdirSync: ReturnType<typeof vi.fn>;
      writeFileSync: ReturnType<typeof vi.fn>;
      mkdirSync: ReturnType<typeof vi.fn>;
    };
    // Route the mocked node:fs surface to the REAL implementation for this
    // group only — the outer beforeEach already reset every mock to the
    // Group A/B-safe inert defaults before this runs.
    fsMod.existsSync.mockImplementation(realFs.existsSync);
    fsMod.readFileSync.mockImplementation(realFs.readFileSync as unknown as (...args: unknown[]) => unknown);
    fsMod.readdirSync.mockImplementation(realFs.readdirSync as unknown as (...args: unknown[]) => unknown);
    fsMod.writeFileSync.mockImplementation(realFs.writeFileSync as unknown as (...args: unknown[]) => unknown);
    fsMod.mkdirSync.mockImplementation(realFs.mkdirSync as unknown as (...args: unknown[]) => unknown);
  });

  afterEach(async () => {
    const realFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    realFs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('updateAgentStats(coverage=null) advances totalUses/successRate but leaves avgCoverage untouched', async () => {
    const { AgentPoolManager } = await vi.importActual<typeof import('../../src/core/agent-pool.js')>('../../src/core/agent-pool.js');
    const manager = new AgentPoolManager(tempDir);
    const agent = createAgentDefinition({
      id: 'null-cov-agent',
      name: 'Null Cov Agent',
      stats: { totalUses: 2, successRate: 1, avgCoverage: 90, lastUsedInSprint: 'sprint-500' },
    });
    manager.saveAgent(agent);

    manager.updateAgentStats('null-cov-agent', 'DONE', null, 'sprint-501');

    const updated = manager.getAgent('null-cov-agent');
    expect(updated?.stats.totalUses).toBe(3);
    expect(updated?.stats.avgCoverage).toBe(90); // unchanged — null never entered the average
    expect(updated?.stats.lastUsedInSprint).toBe('sprint-501');
  });

  it('updateAgentStats(coverage=<number>) still blends normally (no regression)', async () => {
    const { AgentPoolManager } = await vi.importActual<typeof import('../../src/core/agent-pool.js')>('../../src/core/agent-pool.js');
    const manager = new AgentPoolManager(tempDir);
    const agent = createAgentDefinition({
      id: 'real-cov-agent',
      name: 'Real Cov Agent',
      stats: { totalUses: 1, successRate: 1, avgCoverage: 80, lastUsedInSprint: 'sprint-500' },
    });
    manager.saveAgent(agent);

    manager.updateAgentStats('real-cov-agent', 'DONE', 100, 'sprint-501');

    const updated = manager.getAgent('real-cov-agent');
    expect(updated?.stats.totalUses).toBe(2);
    expect(updated?.stats.avgCoverage).toBe(90); // (80*1 + 100)/2
  });

  it('updateSkillStats(coverage=null) advances totalUses/successRate but leaves avgCoverage untouched', async () => {
    const { SkillPoolManager } = await vi.importActual<typeof import('../../src/core/skill-pool.js')>('../../src/core/skill-pool.js');
    const manager = new SkillPoolManager(tempDir);
    const skill = createSkillDefinition({
      id: 'null-cov-skill',
      name: 'Null Cov Skill',
      stats: { totalUses: 2, successCount: 2, successRate: 1, avgCoverage: 90, lastUsedInSprint: 'sprint-500' },
    });
    manager.saveSkill(skill);

    manager.updateSkillStats('null-cov-skill', 'DONE', null, 'sprint-501');

    const updated = manager.getSkill('null-cov-skill');
    expect(updated?.stats.totalUses).toBe(3);
    expect(updated?.stats.avgCoverage).toBe(90); // unchanged — null never entered the average
    expect(updated?.stats.successCount).toBe(3);
  });
});

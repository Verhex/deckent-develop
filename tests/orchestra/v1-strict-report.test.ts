// ═══ V1-STRICT-REPORT (Sprint 369, Task 369-008) ═══════════════════════════
// TaskResultV1 Step-3 prep — flag-gated, REPORT-ONLY pre-wire. When
// `worker_output_contract.{enabled,strict_report}` are both true, the
// collector validates every genuinely collected `.result` against the strict
// TaskResultV1 contract (task-result-schema.ts) and emits a
// BRAIN→AUDITOR:RESULT_CONTRACT_DRIFT audit event on mismatch — never
// blocking, never reshaping the result, never changing selfAssessment/status.
//
// Hermetic: tmpdir-only fixtures, tmux/result-watcher/task-builder mocked (no
// real spawn, no fs.watch). Mirrors tests/orchestra/shared-write-bridge.test.ts
// and tests/orchestra/synthetic-nogo-diskverify.test.ts's event-stream reader.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

import type { Task, Sprint, TaskResult, ResolvedConfig } from '../../src/core/types.js';
import { TaskStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';

// ─── Mocks required to load result-collector without side-effects ─────────
vi.mock('../../src/orchestra/tmux.js', () => ({
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
}));

vi.mock('../../src/orchestra/result-watcher.js', () => ({
  createResultWatcher: vi.fn(() => ({
    waitForChange: vi.fn(() => Promise.resolve()),
    close: vi.fn(),
  })),
}));

vi.mock('../../src/orchestra/task-builder.js', () => ({
  // Plain functions (not vi.fn) so beforeEach resetAllMocks cannot strip the
  // implementation the spawner depends on (skillDelivery.deliveredSkillIds).
  writeSkillDeliveryEvidence: () => {},
  applySkillDirectiveAuthority: (task: { assignedSkills?: string[] }) => task?.assignedSkills ?? [],
  buildSkillDeliveryEvidence: (task: { id?: string; assignedSkills?: string[]; forceSkills?: string[] }, delivered?: readonly string[]) => ({
    version: 1, taskId: task?.id ?? '', source: 'worker-prompt',
    deliveredSkillIds: [...(delivered ?? [])],
    assignedSkillIds: [...(task?.assignedSkills ?? [])],
    forcedSkillIds: [...(task?.forceSkills ?? [])],
    undeliveredForcedSkillIds: (task?.forceSkills ?? []).filter((id) => !(delivered ?? []).includes(id)),
  }),
  buildWorkerPrompt: vi.fn(() => 'mock prompt'),
}));

import { waitForResults, RESULT_CONTRACT_DRIFT_CHANNEL } from '../../src/orchestra/result-collector.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  const dir = join(tmpdir(), `deckent-test-v1sr-${randomBytes(4).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, '.tasks'), { recursive: true });
  return dir;
}

function makeTask(id: string): Task {
  return {
    id,
    title: `Task ${id}`,
    description: 'test',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'none' },
    status: TaskStatus.EXECUTING,
    sprintId: 'sprint-test',
    createdAt: new Date().toISOString(),
    assignedAgent: 'generic',
    assignedSkills: [],
  } as Task;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-test',
    number: 1,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    phase: SprintPhase.EXECUTE,
    status: SprintStatus.ACTIVE,
    startedAt: new Date().toISOString(),
  } as Sprint;
}

function makeConfig(enabled: boolean, strictReport: boolean): ResolvedConfig {
  return {
    worker_output_contract: {
      enabled,
      strict_report: strictReport,
    },
  } as unknown as ResolvedConfig;
}

function writeResult(dir: string, taskId: string, result: unknown): void {
  writeFileSync(
    join(dir, '.tasks', `task-${taskId}.result`),
    JSON.stringify(result),
    'utf-8',
  );
}

function readEventStream(tmpDir: string, sprintId: string): Array<{ channel: string; payload: Record<string, unknown> }> {
  const eventsPath = join(tmpDir, '.deckent', 'recently-works', `${sprintId}-events.jsonl`);
  if (!existsSync(eventsPath)) return [];
  const raw = readFileSync(eventsPath, 'utf-8');
  return raw
    .split('\n')
    .filter(l => l.trim().length > 0)
    .map(l => JSON.parse(l) as { channel: string; payload: Record<string, unknown> });
}

// A legacy worker-shaped `.result` — this is the real WORKER-GUIDE.md shape
// (string[] filesChanged, no tokenUsage.source/cost/tests/tsc, etc.) and will
// NOT validate against the strict TaskResultV1 contract. `notes` is an ARRAY
// (the live born-484 codex-CLI drift shape) — normalizeTaskResultShape must
// coerce it to a string BEFORE validateTaskResult ever sees it.
const LEGACY_RESULT_WITH_ARRAY_NOTES = {
  taskId: 'v1sr-001',
  workerId: 'w-v1sr-001',
  filesChanged: ['src/foo.ts'],
  linesAdded: 12,
  linesRemoved: 3,
  testsPassed: true,
  coverage: 88,
  selfAssessment: 'DONE',
  notes: ['point one', 'point two'],
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('v1-strict-report — flag-gated REPORT-ONLY result-contract drift', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs) {
      try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    tmpDirs.length = 0;
  });

  function tmp(): string {
    const d = makeTmpDir();
    tmpDirs.push(d);
    return d;
  }

  it('flag-off (config absent): zero effect — no RESULT_CONTRACT_DRIFT event, result flow unchanged', async () => {
    const dir = tmp();
    const task = makeTask('v1sr-001');
    const sprint = makeSprint([task]);
    writeResult(dir, 'v1sr-001', LEGACY_RESULT_WITH_ARRAY_NOTES);

    const results = await waitForResults(dir, sprint, 100);

    expect(results).toHaveLength(1);
    expect(results[0]!.selfAssessment).toBe('DONE');
    expect(results[0]!.notes).toBe('point one\npoint two'); // normalizeTaskResultShape still runs

    const events = readEventStream(dir, sprint.id);
    expect(events.filter(e => e.channel === RESULT_CONTRACT_DRIFT_CHANNEL)).toHaveLength(0);
  });

  it('flag-off (enabled=false): zero effect — no RESULT_CONTRACT_DRIFT event', async () => {
    const dir = tmp();
    const task = makeTask('v1sr-002');
    const sprint = makeSprint([task]);
    const config = makeConfig(false, true);
    writeResult(dir, 'v1sr-002', { ...LEGACY_RESULT_WITH_ARRAY_NOTES, taskId: 'v1sr-002' });

    await waitForResults(dir, sprint, 100, undefined, undefined, undefined, config);

    const events = readEventStream(dir, sprint.id);
    expect(events.filter(e => e.channel === RESULT_CONTRACT_DRIFT_CHANNEL)).toHaveLength(0);
  });

  it('flag-on (enabled + strict_report): emits RESULT_CONTRACT_DRIFT for a non-conforming legacy result, but does NOT alter selfAssessment or the returned result', async () => {
    const dir = tmp();
    const task = makeTask('v1sr-003');
    const sprint = makeSprint([task]);
    const config = makeConfig(true, true);
    writeResult(dir, 'v1sr-003', { ...LEGACY_RESULT_WITH_ARRAY_NOTES, taskId: 'v1sr-003' });

    const results = await waitForResults(dir, sprint, 100, undefined, undefined, undefined, config);

    // Result flow (decision) is completely untouched.
    expect(results).toHaveLength(1);
    expect(results[0]!.taskId).toBe('v1sr-003');
    expect(results[0]!.selfAssessment).toBe('DONE');
    expect(results[0]!.notes).toBe('point one\npoint two');

    const events = readEventStream(dir, sprint.id);
    const drift = events.filter(e => e.channel === RESULT_CONTRACT_DRIFT_CHANNEL);
    expect(drift).toHaveLength(1);
    expect(drift[0]!.payload['taskId']).toBe('v1sr-003');
    expect(Array.isArray(drift[0]!.payload['missingFields'])).toBe(true);
    expect((drift[0]!.payload['missingFields'] as string[]).length).toBeGreaterThan(0);
    expect(Array.isArray(drift[0]!.payload['errors'])).toBe(true);
    expect((drift[0]!.payload['errors'] as string[]).length).toBeGreaterThan(0);
  });

  it('flag-on but strict_report=false: enabled alone does not activate the check (both fields required)', async () => {
    const dir = tmp();
    const task = makeTask('v1sr-004');
    const sprint = makeSprint([task]);
    const config = makeConfig(true, false);
    writeResult(dir, 'v1sr-004', { ...LEGACY_RESULT_WITH_ARRAY_NOTES, taskId: 'v1sr-004' });

    await waitForResults(dir, sprint, 100, undefined, undefined, undefined, config);

    const events = readEventStream(dir, sprint.id);
    expect(events.filter(e => e.channel === RESULT_CONTRACT_DRIFT_CHANNEL)).toHaveLength(0);
  });

  it('flag-on with a fully-conforming TaskResultV1 result: no drift event', async () => {
    const dir = tmp();
    const task = makeTask('v1sr-005');
    const sprint = makeSprint([task]);
    const config = makeConfig(true, true);

    const conforming = {
      schemaVersion: '1.0',
      taskId: 'v1sr-005',
      workerId: 'w-v1sr-005',
      provider: 'claude',
      model: 'sonnet',
      agent: null,
      skills: [],
      attempt: 1,
      isPriorityFix: false,
      fixForTaskId: null,
      // Empty on purpose: sanitizeResultHostFacingFiles (legacy code, downstream
      // of this check) assumes filesChanged is a string[] path list and would
      // throw on TaskResultV1's structured {path,status,...} objects — an
      // unrelated legacy/V1 shape gap outside this task's scope. An empty array
      // satisfies both the strict schema (no items to violate) and the legacy
      // sweep's `length === 0` early return.
      filesChanged: [],
      totalLinesAdded: 0,
      totalLinesRemoved: 0,
      diskVerified: false,
      boundaryViolations: [],
      tokenUsage: {
        inputTokens: 1000,
        outputTokens: 200,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        totalTokens: 1200,
        source: 'provider-adapter',
      },
      cost: { usd: 0.01, currency: 'USD', pricingSource: 'test', isLocal: false },
      tests: { passed: 5, failed: 0, total: 5, coverage: 90, command: 'vitest', orchestratorVerified: true },
      tsc: { clean: true, errors: 0 },
      selfAssessment: 'DONE',
      goCriteria: [],
      notes: 'all good',
      brainEvaluation: null,
      brainEvaluationReason: null,
      rubricScores: null,
      totalScore: null,
      honestGate: { flagged: false, violation: null },
      handoffNotes: null,
      sharedNotes: [],
      auditorValidation: null,
    };
    writeResult(dir, 'v1sr-005', conforming);

    await waitForResults(dir, sprint, 100, undefined, undefined, undefined, config);

    const events = readEventStream(dir, sprint.id);
    expect(events.filter(e => e.channel === RESULT_CONTRACT_DRIFT_CHANNEL)).toHaveLength(0);
  });

  it('a synthetic .timeout NO_GO (no worker .result at all) is NOT checked — no drift event', async () => {
    const dir = tmp();
    const task = makeTask('v1sr-006');
    const sprint = makeSprint([task]);
    const config = makeConfig(true, true);
    writeFileSync(join(dir, '.tasks', 'task-v1sr-006.timeout'), 'WORKER_TIMEOUT', 'utf-8');

    const results = await waitForResults(dir, sprint, 100, undefined, undefined, undefined, config);

    expect(results).toHaveLength(1);
    expect(results[0]!.selfAssessment).toBe('NO_GO');
    const events = readEventStream(dir, sprint.id);
    expect(events.filter(e => e.channel === RESULT_CONTRACT_DRIFT_CHANNEL)).toHaveLength(0);
  });
});

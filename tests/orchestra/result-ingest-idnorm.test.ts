// ═══ RESULT-INGEST taskId NORMALIZE (born-655 / TT550D) ════════════════════
// A worker that writes a `task-<id>` prefixed (or otherwise drifted) `taskId`
// INSIDE its `.result` content used to flow verbatim into buildResultsMap
// (result-collector.ts), whose O(1) index is keyed by result.taskId. A lookup
// by the bare sprint task id then MISSED → phantom fix task + lost trace + lost
// NO_GO label (live: 412-003, 409-002).
//
// Fix: normalize at the SINGLE disk-read ingest chokepoint in collectResults —
// the filename deckent itself created is authoritative, so on any drift we adopt
// the filename-derived id and LOUD-WARN (never silently).
//
// Hermetic: tmpdir-only fixtures; tmux/result-watcher/task-builder mocked (no
// real spawn, no fs.watch). Harness mirrors tests/orchestra/v1-strict-report.test.ts.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

import type { Task, Sprint, TaskResult } from '../../src/core/types.js';
import { TaskStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';

const PROMPT_PLAN_ID = `prompt-compile-plan:sha256:${'a'.repeat(64)}`;
const GO_ID = `criterion-go-${'b'.repeat(64)}`;
const NO_GO_ID = `criterion-no-go-${'c'.repeat(64)}`;
const VERIFY_COMMAND = 'npx vitest run tests/orchestra/result-ingest-idnorm.test.ts';

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

import {
  waitForResults,
  buildResultsMap,
  normalizeIngestedTaskId,
} from '../../src/orchestra/result-collector.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  const dir = join(tmpdir(), `deckent-test-idnorm-${randomBytes(4).toString('hex')}`);
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
    goNogo: {
      goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'none',
      items: [
        { id: GO_ID, polarity: 'go', statement: 'pass' },
        { id: NO_GO_ID, polarity: 'no-go', statement: 'fail' },
      ],
    },
    promptCompilePlanId: PROMPT_PLAN_ID,
    verification: { version: 1, source: 'directive', commands: [VERIFY_COMMAND] },
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

// A worker `.result` written to task-<fileId>.result, with a possibly-drifted
// `taskId` in the CONTENT (contentId). This is the born-655 drift shape.
function writeResult(dir: string, fileId: string, contentTaskId: string): void {
  const result = {
    taskId: contentTaskId,
    workerId: `w-${fileId}`,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 90,
    selfAssessment: 'DONE',
    notes: 'work done',
    promptCompilePlanId: PROMPT_PLAN_ID,
    testVerification: {
      applicability: 'REQUIRED', outcome: 'PASSED', commands: [VERIFY_COMMAND],
    },
    criteriaEvidence: [
      { criterionId: GO_ID, outcome: 'MET', evidence: ['targeted test passed'] },
      { criterionId: NO_GO_ID, outcome: 'UNMET', evidence: ['forbidden condition absent'] },
    ],
    techDebtCriterionIds: [],
  };
  writeFileSync(join(dir, '.tasks', `task-${fileId}.result`), JSON.stringify(result), 'utf-8');
}

function readResultFile(dir: string, fileId: string): { taskId: string } {
  return JSON.parse(readFileSync(join(dir, '.tasks', `task-${fileId}.result`), 'utf-8'));
}

function makeRawResult(taskId: string): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 90,
    selfAssessment: 'DONE',
    notes: 'work done',
    promptCompilePlanId: PROMPT_PLAN_ID,
    testVerification: {
      applicability: 'REQUIRED', outcome: 'PASSED', commands: [VERIFY_COMMAND],
    },
    criteriaEvidence: [
      { criterionId: GO_ID, outcome: 'MET', evidence: ['targeted test passed'] },
      { criterionId: NO_GO_ID, outcome: 'UNMET', evidence: ['forbidden condition absent'] },
    ],
    techDebtCriterionIds: [],
  } as TaskResult;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('result-ingest taskId normalize (born-655 / TT550D)', () => {
  const tmpDirs: string[] = [];
  let warnSpy: ReturnType<typeof vi.spyOn> | undefined;

  afterEach(() => {
    for (const d of tmpDirs) {
      try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    tmpDirs.length = 0;
    warnSpy?.mockRestore();
    warnSpy = undefined;
  });

  function tmp(): string {
    const d = makeTmpDir();
    tmpDirs.push(d);
    return d;
  }

  function spyWarn(): ReturnType<typeof vi.spyOn> {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    return warnSpy;
  }

  // ── RED characterization: WHY the ingest normalize is required ──────────────
  it('RED: a raw `task-`-prefixed content id lookup-MISSES buildResultsMap by the sprint task id', () => {
    // This is the phantom-fix root cause: un-normalized, the prefixed content id
    // becomes the map key, so the handleEvaluation-side lookup by "417-002" misses.
    const map = buildResultsMap([makeRawResult('task-417-002')]);
    expect(map.get('417-002')).toBeUndefined();      // ← the miss (phantom fix + lost trace)
    expect(map.get('task-417-002')).toBeDefined();   // only the drifted key hits
  });

  // ── Unit: the single normalizer ────────────────────────────────────────────
  it('normalizeIngestedTaskId adopts the filename-derived id and LOUD-WARNs (file + both values) on `task-` prefix drift', () => {
    const warn = spyWarn();
    const result = makeRawResult('task-417-002');
    normalizeIngestedTaskId(result, '417-002', '/x/.tasks/task-417-002.result');

    expect(result.taskId).toBe('417-002');           // normalize-accept
    expect(warn).toHaveBeenCalledTimes(1);           // NOT silent (sessiz-kabul = NO_GO)
    const msg = String(warn.mock.calls[0]![0]);
    expect(msg).toContain('/x/.tasks/task-417-002.result'); // file
    expect(msg).toContain('417-002');                       // expected id
    expect(msg).toContain('task-417-002');                  // content id (both values)
  });

  it('normalizeIngestedTaskId also normalizes an ARBITRARY mismatch (filename is authoritative)', () => {
    const warn = spyWarn();
    const result = makeRawResult('task-999-999');
    normalizeIngestedTaskId(result, '417-002', '/x/.tasks/task-417-002.result');
    expect(result.taskId).toBe('417-002');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('normalizeIngestedTaskId fast-path: a correct content id is left verbatim with NO warn', () => {
    const warn = spyWarn();
    const result = makeRawResult('417-002');
    normalizeIngestedTaskId(result, '417-002', '/x/.tasks/task-417-002.result');
    expect(result.taskId).toBe('417-002');
    expect(warn).not.toHaveBeenCalled();
  });

  // ── GREEN wire: collectResults normalizes at ingest (handleEvaluation pin) ──
  it('GREEN: collectResults keys a drifted result by the filename id and fails the invalid ingress closed', async () => {
    const dir = tmp();
    const sprint = makeSprint([makeTask('417-002')]);
    writeResult(dir, '417-002', 'task-417-002'); // file=417-002, content DRIFTED to task-417-002
    spyWarn();

    const results = await waitForResults(dir, sprint, 100);

    expect(results).toHaveLength(1);
    expect(results[0]!.taskId).toBe('417-002'); // ← RED on unfixed code (would be 'task-417-002')

    // Downstream indexing still hits the canonical task, while strict ingress
    // settlement refuses to preserve the forged DONE verdict.
    const map = buildResultsMap(results);
    expect(map.get('417-002')).toBeDefined();
    expect(map.get('417-002')!.selfAssessment).toBe('NO_GO');
    expect(map.get('task-417-002')).toBeUndefined();
  });

  it('GREEN: strict ingest leaves the worker-authored file immutable while canonicalizing the collected projection', async () => {
    const dir = tmp();
    const sprint = makeSprint([makeTask('417-002')]);
    writeResult(dir, '417-002', 'task-417-002');
    spyWarn();

    await waitForResults(dir, sprint, 100);

    // Worker ingress is evidence, not a repair target: host canonicalization
    // must not rewrite the worker-authored claim in place.
    expect(readResultFile(dir, '417-002').taskId).toBe('task-417-002');
  });

  it('GREEN: a correctly-formed content id flows through untouched with NO spurious warn', async () => {
    const dir = tmp();
    const sprint = makeSprint([makeTask('417-003')]);
    writeResult(dir, '417-003', '417-003'); // no drift
    const warn = spyWarn();

    const results = await waitForResults(dir, sprint, 100);

    expect(results).toHaveLength(1);
    expect(results[0]!.taskId).toBe('417-003');
    expect(warn).not.toHaveBeenCalled(); // fast path — no noise regression
  });
});

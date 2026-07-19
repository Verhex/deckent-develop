// ═══ run-flow-scope-mirror — Dogfood-449 B1 (born-698a'nın scope-ikizi) ═════
//
// Canlı vaka (dogfood-449): `deckent do --run --yes` onayı "başlatıldı" bastı,
// detached-child PLAN fazında pre-spawn scope-gate'iyle öldü — dürüst gate
// mesajı yalnız .deckent/recently-works/ logundaydı ve `do` akışında hiçbir
// çıkış (--force-scope) yoktu. Bu dosya iki onarımı pinler:
//   1. proposeRun preview'ı child'ın scope-gate kararını AYNALAR
//      (scopeGateResult/scopeGateMessage/scopeGateOverridden — CAS-nötr).
//   2. `do` ön-kapısı 'fail'de reddeder; `--force-scope` hem aynayı hem
//      child-argv'sini geçirir.
//
// Hermeticity: do-runflow-adapter.test.ts'in mock sınırları + node:child_process
// mock'u (git ls-files spawnSync'i sahte tracked-file listesi döner; hiçbir
// gerçek subprocess doğmaz).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Kontrol-edilebilir sahte `git ls-files` (vi.mock hoisted — dış-değişken yerine
// vi.hoisted köprüsü): controller'ın listTrackedFiles'ı da compiler'ın
// readTrackedFileTree'si de ASYNC spawn kullanır; ikisi de bu listeyi görür.
const gitState = vi.hoisted(() => ({ files: [] as string[], fail: false }));

vi.mock('node:child_process', () => {
  const fakeChild = (emit: string | null, code: number) => ({
    stdout: {
      setEncoding: () => {},
      on: (event: string, cb: (chunk: string) => void) => {
        if (event === 'data' && emit !== null) setImmediate(() => cb(emit));
      },
    },
    on: (event: string, cb: (code?: number) => void) => {
      if (event === 'close') setImmediate(() => cb(code));
    },
    kill: () => {},
    pid: 1,
    unref: () => {},
  });
  return {
    spawn: vi.fn((cmd: string, args?: string[]) => {
      if (cmd === 'git' && args?.[0] === 'ls-files') {
        return gitState.fail
          ? fakeChild(null, 128)
          : fakeChild(`${gitState.files.join('\n')}\n`, 0);
      }
      return fakeChild(null, 0);
    }),
    spawnSync: vi.fn(),
  };
});

vi.mock('../../src/orchestra/planner.js', () => ({
  resolvePlanTimeoutMs: vi.fn(() => 900_000),
  // 429-001 emsali (do-runflow-adapter.test.ts): compiler'ın AI-sınırı canned
  // gerçek-şekilli tek-task döner; gate'in gördüğü scope'u brain.js mock'u belirler.
  callZeroConfigPlanner: vi.fn(() => ({
    reasoning: 'canned single-task plan (hermetic planner boundary)',
    tasks: [{
      title: 'Planned task',
      description: 'Canned single-task plan for scope-mirror tests.',
      scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/planned.ts'] },
      dependencies: [],
      model: 'sonnet', effort: 'normal', priority: 'NORMAL', reason: 'canned',
      goNogo: { goCriteria: 'The planned change works.', noGoCriteria: 'The planned change breaks.', techDebtAcceptable: '' },
    }],
  })),
}));

vi.mock('../../src/core/config.js', () => ({
  resolveBrainModel: () => 'sonnet',
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',
  loadConfig: vi.fn(),
}));

vi.mock('../../src/orchestra/brain.js', () => ({
  planSprint: vi.fn(),
  readContext: vi.fn(),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

import { planSprint, readContext } from '../../src/orchestra/brain.js';
import { print, printError } from '../../src/cli/helpers/output.js';
import { runDoRunFlow, type DoSeamDeps } from '../../src/cli/commands/do.js';
import {
  createRunFlowController,
  type RunFlowController,
  type RunFlowControllerDeps,
} from '../../src/cli/repl/run-flow-controller.js';
import { SprintStatus, SprintPhase, TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task, ResolvedConfig, BrainContext } from '../../src/core/types.js';

const mockPlanSprint = vi.mocked(planSprint);
const mockReadContext = vi.mocked(readContext);

// ─── Fixtures (do-runflow-adapter.test.ts style) ────────────────────────────

function makeConfig(): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 8, brain_model: 'opus', default_model: 'sonnet',
      haiku_allowed: true, brain_planning: 'auto',
    },
    modes: {} as any,
    language: 'en', projectName: 'test', projectRoot: '/mock/root',
    version: '1.0.0', auto_docs: { tier1: true, tier2: true, tier3: false },
    terminal: { run_flow_v2: true } as any,
  } as ResolvedConfig;
}

function makeBrainContext(): BrainContext {
  return {
    directives: '', memory: '', retro: '', debt: [], patterns: '', decisions: '',
    existingTasks: [], projectState: { gitStatus: '', fileTree: [] },
  };
}

function makeTask(filesWrite: string[]): Task {
  return {
    id: '001-001', title: 'Do the thing', description: 'Do the thing well.', model: 'sonnet',
    effort: 'normal', priority: 'NORMAL', reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING, sprintId: 'sprint-001', createdAt: new Date(0).toISOString(),
  } as Task;
}

function makeSprint(filesWrite: string[]): Sprint {
  return {
    id: 'sprint-001', number: 1,
    status: SprintStatus.PLANNING, phase: SprintPhase.PLAN,
    tasks: [makeTask(filesWrite)], workers: ['w-001-001'],
  };
}

/** git ls-files sahtesi: verilen tracked-file listesi döner. */
function gitReturns(trackedFiles: string[]): void {
  gitState.files = trackedFiles;
  gitState.fail = false;
}

// İki adaylı ayna-vaka: yazılacak src/orchestra/worker.ts tracked DEĞİL; aynı
// basename İKİ farklı tracked dizinde → sole-candidate auto-resolve DEVREYE
// GİREMEZ (397-007), gate gerçekten bloklar (573/518 wrong-dir kalkanı).
const AMBIGUOUS_TRACKED = [
  'src/agents/worker.ts',
  'src/nervous/worker.ts',
  'src/orchestra/brain.ts',
];
const SUSPECT_WRITE = ['src/orchestra/worker.ts'];

function makeControllerDeps(root: string, overrides?: Partial<RunFlowControllerDeps>): RunFlowControllerDeps {
  return {
    root,
    config: makeConfig(),
    now: () => new Date(Date.UTC(2026, 0, 1)).toISOString(),
    generateFlowId: () => 'flow-1',
    ...overrides,
  };
}

describe('Dogfood-449 B1 — run-flow scope-gate mirror', () => {
  let tmpRoot: string;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    gitState.files = [];
    gitState.fail = false;
    tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-scope-mirror-'));
    mockReadContext.mockReturnValue(makeBrainContext());
  });

  afterEach(() => {
    process.exitCode = undefined;
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  // ─── proposeRun preview mirror ───────────────────────────────────────────

  it('ambiguous write-suspect → preview.scopeGateResult=fail with the gate message (the 449 death, now visible pre-approval)', async () => {
    gitReturns(AMBIGUOUS_TRACKED);
    mockPlanSprint.mockReturnValue(makeSprint(SUSPECT_WRITE) as any);
    const controller = createRunFlowController(makeControllerDeps(tmpRoot));
    const ctx = await controller.proposeRun('rename the worker module');
    expect(ctx.preview?.scopeGateResult).toBe('fail');
    expect(ctx.preview?.scopeGateMessage).toContain('src/orchestra/worker.ts');
    expect(ctx.preview?.scopeGateOverridden).toBeUndefined();
  });

  it('forceScope acknowledges the same suspect → pass + scopeGateOverridden', async () => {
    gitReturns(AMBIGUOUS_TRACKED);
    mockPlanSprint.mockReturnValue(makeSprint(SUSPECT_WRITE) as any);
    const controller = createRunFlowController(makeControllerDeps(tmpRoot, { forceScope: true }));
    const ctx = await controller.proposeRun('rename the worker module');
    expect(ctx.preview?.scopeGateResult).toBe('pass');
    expect(ctx.preview?.scopeGateOverridden).toBe(true);
  });

  it('clean write scope → pass, no message, no override', async () => {
    gitReturns(AMBIGUOUS_TRACKED);
    mockPlanSprint.mockReturnValue(makeSprint(['src/orchestra/brain.ts']) as any);
    const controller = createRunFlowController(makeControllerDeps(tmpRoot));
    const ctx = await controller.proposeRun('improve the brain module');
    expect(ctx.preview?.scopeGateResult).toBe('pass');
    expect(ctx.preview?.scopeGateMessage).toBeUndefined();
    expect(ctx.preview?.scopeGateOverridden).toBeUndefined();
  });

  it('git unavailable → skipped (fail-open, the child decides)', async () => {
    gitState.fail = true;
    mockPlanSprint.mockReturnValue(makeSprint(SUSPECT_WRITE) as any);
    const controller = createRunFlowController(makeControllerDeps(tmpRoot));
    const ctx = await controller.proposeRun('rename the worker module');
    expect(ctx.preview?.scopeGateResult).toBe('skipped');
  });

  // ─── `do` front door ─────────────────────────────────────────────────────

  function makeFactory(overrides?: Partial<RunFlowControllerDeps>) {
    let created: RunFlowController | undefined;
    const factory = (deps: RunFlowControllerDeps): RunFlowController => {
      created = createRunFlowController({
        ...deps,
        now: () => new Date(Date.UTC(2026, 0, 1)).toISOString(),
        generateFlowId: () => 'flow-1',
        spawnStart: () => ({ flowId: 'flow-1', jobId: 'job-1', logRef: '/dev/null' }),
        ...overrides,
      });
      return created;
    };
    return { factory, getController: () => created! };
  }

  it('do --run --yes on a scope-gate fail: honest reject BEFORE any start, exitCode=1 (no more silently-dead run)', async () => {
    gitReturns(AMBIGUOUS_TRACKED);
    mockPlanSprint.mockReturnValue(makeSprint(SUSPECT_WRITE) as any);
    const { factory, getController } = makeFactory();
    const deps: DoSeamDeps = { createRunFlowController: factory };
    await runDoRunFlow(tmpRoot, makeConfig(), 'rename the worker module', { run: true, yes: true }, deps);
    expect(process.exitCode).toBe(1);
    const err = vi.mocked(printError).mock.calls.map((c) => c[0] as string).join('\n');
    expect(err).toContain('Scope gate');
    expect(err).toContain('--force-scope');
    expect(getController().getContext().state).toBe('CANCELLED'); // reject() terminal state
  });

  it('do --run --yes --force-scope on the same plan: starts (consent flows through)', async () => {
    gitReturns(AMBIGUOUS_TRACKED);
    mockPlanSprint.mockReturnValue(makeSprint(SUSPECT_WRITE) as any);
    const { factory } = makeFactory();
    const deps: DoSeamDeps = { createRunFlowController: factory };
    await runDoRunFlow(tmpRoot, makeConfig(), 'rename the worker module', { run: true, yes: true, forceScope: true }, deps);
    expect(process.exitCode).toBeUndefined();
    const out = vi.mocked(print).mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('job-1'); // runFlow.mount.started
  });

  it('dry-run preview surfaces the scope-gate fail so the operator sees it before ever passing --run', async () => {
    gitReturns(AMBIGUOUS_TRACKED);
    mockPlanSprint.mockReturnValue(makeSprint(SUSPECT_WRITE) as any);
    const { factory } = makeFactory();
    const deps: DoSeamDeps = { createRunFlowController: factory };
    await runDoRunFlow(tmpRoot, makeConfig(), 'rename the worker module', { run: false, yes: false }, deps);
    const out = vi.mocked(print).mock.calls.map((c) => c[0] as string).join('\n');
    expect(out).toContain('Scope gate: FAIL');
    expect(out).toContain('--force-scope');
  });

  // ─── child argv source pin ───────────────────────────────────────────────

  it('source pin: default spawnStart forwards --force-scope to the detached child', () => {
    const src = readFileSync('src/cli/repl/run-flow-controller.ts', 'utf-8');
    expect(src).toContain("if (deps.forceScope === true) cliArgs.push('--force-scope');");
  });
});

// ═══ do-runflow-adapter — T6C compatibility-adapter tests (TERM-6, 428-006) ═
//
// docs/analysis/term-flow-unify-design-2026-07-11.md Sprint-6 row + "Ölecek
// parçalar" table: flag-on (`terminal.run_flow_v2`) `deckent do` must delegate
// to the REAL 426/427 RunFlow chain (run-flow-controller.ts ->
// plan-preview-service.ts/run-proposal-compiler.ts -> run-job-service.ts/
// run-flow-store.ts) — never a second propose/preview/approve/start
// implementation — and must never touch the golden-flow-era organs the design
// doc marks for death (`swapDirectives`/`restoreDirectives`/`defaultSpawnStart`).
// Flag-off must stay byte-identical to the pre-existing golden-flow path
// (already covered by tests/cli/do-cmd.test.ts, untouched by this task).
//
// Hermeticity mirrors tests/cli/run-flow-mount.test.ts /
// tests/cli/start-snapshot-branch.test.ts exactly: only orchestra/brain.js's
// planSprint/readContext and core/config.js's loadConfig are mocked; the REAL
// createRunFlowController, run-flow-reducer, plan-preview-service and
// run-flow-store run against a per-test tmpdir root — only the flag-on
// path's OWN detached-spawn boundary (`spawnStart`) is faked, so no real
// subprocess or `dist/cli/entry.js` invocation ever happens in a unit test.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../../src/core/config.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../src/orchestra/brain.js', () => ({
  planSprint: vi.fn(),
  readContext: vi.fn(),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn(),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

import { loadConfig } from '../../src/core/config.js';
import { planSprint, readContext } from '../../src/orchestra/brain.js';
import { resolveProjectRoot } from '../../src/cli/helpers/process.js';
import { print, printError } from '../../src/cli/helpers/output.js';
import {
  registerDo,
  runDoRunFlow,
  formatRunFlowDoPreview,
  type DoSeamDeps,
} from '../../src/cli/commands/do.js';
import {
  createRunFlowController,
  type RunFlowController,
  type RunFlowControllerDeps,
} from '../../src/cli/repl/run-flow-controller.js';
import { loadApprovedSnapshot, loadRunHandle } from '../../src/core/run-flow-store.js';
import type { RunHandle } from '../../src/orchestra/run-job-service.js';
import { DIRECTIVES_FILE } from '../../src/core/constants.js';
import { SprintStatus, SprintPhase, TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task, ResolvedConfig, BrainContext } from '../../src/core/types.js';
import type { PlanPreview } from '../../src/core/run-flow-contract.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

const mockLoadConfig = vi.mocked(loadConfig);
const mockPlanSprint = vi.mocked(planSprint);
const mockReadContext = vi.mocked(readContext);
const mockResolveProjectRoot = vi.mocked(resolveProjectRoot);

// ─── Fixtures (mirrors tests/cli/run-flow-mount.test.ts's own style) ───────

function makeConfig(overrides?: Partial<ResolvedConfig>): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 8, brain_model: 'opus', default_model: 'sonnet',
      haiku_allowed: true, brain_planning: 'auto',
    },
    modes: {} as any,
    language: 'en', projectName: 'test', projectRoot: '/mock/root',
    version: '1.0.0', auto_docs: { tier1: true, tier2: true, tier3: false },
    ...overrides,
  } as ResolvedConfig;
}

function makeFlagOnConfig(): ResolvedConfig {
  return makeConfig({ terminal: { run_flow_v2: true } as any });
}

function makeBrainContext(): BrainContext {
  return {
    directives: '', memory: '', retro: '', debt: [], patterns: '', decisions: '',
    existingTasks: [], projectState: { gitStatus: '', fileTree: [] },
  };
}

function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: '001-001', title: 'Do the thing', description: 'Do the thing well.', model: 'sonnet',
    effort: 'normal', priority: 'NORMAL', reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING, sprintId: 'sprint-001', createdAt: new Date(0).toISOString(),
    ...overrides,
  } as Task;
}

function makeSprint(overrides?: Partial<Sprint>): Sprint {
  return {
    id: 'sprint-001', number: 1,
    status: SprintStatus.PLANNING, phase: SprintPhase.PLAN,
    tasks: [makeTask()], workers: ['w-001-001'],
    ...overrides,
  };
}

/** Builds a `deps.createRunFlowController` factory backed by the REAL
 *  createRunFlowController, seeded deterministically and wired with a fake
 *  `spawnStart` — mirrors tests/cli/run-flow-mount.test.ts's own
 *  `makeControllerDeps` helper. Exposes the created instance so tests can
 *  inspect its final context directly. */
function makeControllerFactory(spawnStart?: RunFlowControllerDeps['spawnStart']) {
  let created: RunFlowController | undefined;
  const factory = (deps: RunFlowControllerDeps): RunFlowController => {
    created = createRunFlowController({
      ...deps,
      now: () => new Date(Date.UTC(2026, 0, 1)).toISOString(),
      generateFlowId: () => 'flow-1',
      ...(spawnStart ? { spawnStart } : {}),
    });
    return created;
  };
  return { factory, getController: () => created! };
}

async function runCommand(args: string[], deps: DoSeamDeps = {}): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerDo(program, deps);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride throws on exit
  }
}

function output(): string {
  return vi.mocked(print).mock.calls.map((c) => c[0] as string).join('\n');
}

// ─── Suite ──────────────────────────────────────────────────────────────────

describe('do command — RunFlow compatibility adapter (terminal.run_flow_v2, 428-006)', () => {
  let tmpRoot: string;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-do-runflow-'));
    mockResolveProjectRoot.mockReturnValue(tmpRoot);
    mockReadContext.mockReturnValue(makeBrainContext());
    mockPlanSprint.mockReturnValue(makeSprint() as any);
  });

  afterEach(() => {
    process.exitCode = undefined;
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('registers a --yes option alongside --run', () => {
    const program = new Command();
    registerDo(program);
    const cmd = program.commands.find((c) => c.name() === 'do');
    expect(cmd!.options.map((o) => o.long)).toEqual(expect.arrayContaining(['--run', '--yes']));
  });

  describe('flag-off — legacy golden-flow path is untouched', () => {
    it('never invokes the RunFlow controller factory; legacy confirm/spawnStart seams still drive the run', async () => {
      mockLoadConfig.mockResolvedValue(makeConfig()); // no `terminal` block at all
      const confirm = vi.fn().mockResolvedValue(true);
      const spawnStart = vi.fn().mockResolvedValue({ exitCode: 0 });
      const { factory: createRunFlowControllerFake } = makeControllerFactory();
      const controllerFactorySpy = vi.fn(createRunFlowControllerFake);

      await runCommand(['do', 'ship the widget', '--run'], {
        confirm, spawnStart, createRunFlowController: controllerFactorySpy,
      });

      expect(controllerFactorySpy).not.toHaveBeenCalled();
      expect(confirm).toHaveBeenCalledWith('Proceed and start this run now?');
      expect(spawnStart).toHaveBeenCalledWith(tmpRoot);
      expect(output()).toContain('Sprint finished — exitCode 0 (success)');
    });

    it('explicit run_flow_v2: false takes the same legacy path', async () => {
      mockLoadConfig.mockResolvedValue(makeConfig({ terminal: { run_flow_v2: false } as any }));
      const confirm = vi.fn().mockResolvedValue(false);
      const spawnStart = vi.fn();

      await runCommand(['do', 'a goal', '--run'], { confirm, spawnStart });

      expect(confirm).toHaveBeenCalled();
      expect(spawnStart).not.toHaveBeenCalled();
      expect(output()).toContain('Cancelled at stage "approve"');
    });
  });

  describe('flag-on — dry-run (no --run): real preview, structural reject, never starts', () => {
    it('prints the real RunFlow preview and rejects — no controller.approve/startApproved, no legacy seam, no DIRECTIVES.md write', async () => {
      mockLoadConfig.mockResolvedValue(makeFlagOnConfig());
      const legacyConfirm = vi.fn();
      const legacySpawnStart = vi.fn();
      const spawnStart = vi.fn();
      const { factory, getController } = makeControllerFactory(spawnStart);

      await runCommand(['do', 'ship the widget exporter'], {
        confirm: legacyConfirm, spawnStart: legacySpawnStart, createRunFlowController: factory,
      });

      const out = output();
      expect(out).toContain('Do the thing'); // real taskSummaries title from the mocked planSprint sprint
      expect(out).toContain(getMessage('do.dry_run_complete', 'en'));
      expect(legacyConfirm).not.toHaveBeenCalled();
      expect(legacySpawnStart).not.toHaveBeenCalled();
      expect(spawnStart).not.toHaveBeenCalled();
      expect(existsSync(join(tmpRoot, DIRECTIVES_FILE))).toBe(false);
      expect(getController().getContext().state).toBe('CANCELLED');
      expect(loadApprovedSnapshot(tmpRoot, 'flow-1')).toBeUndefined();
      expect(process.exitCode).toBeUndefined();
    });
  });

  describe('flag-on — --run without --yes: honest reject, never starts', () => {
    it('rejects non-interactively (no prompt) and never calls approve/startApproved/spawnStart', async () => {
      mockLoadConfig.mockResolvedValue(makeFlagOnConfig());
      const legacyConfirm = vi.fn();
      const spawnStart = vi.fn();
      const { factory, getController } = makeControllerFactory(spawnStart);

      await runCommand(['do', 'ship it', '--run'], {
        confirm: legacyConfirm, createRunFlowController: factory,
      });

      expect(legacyConfirm).not.toHaveBeenCalled(); // no interactive prompt fallback
      expect(spawnStart).not.toHaveBeenCalled();
      expect(getController().getContext().state).toBe('CANCELLED');
      expect(output()).toContain('yes-required');
      expect(loadApprovedSnapshot(tmpRoot, 'flow-1')).toBeUndefined();
      expect(process.exitCode).toBeUndefined();
    });
  });

  describe('flag-on — --run --yes: real approve + exact-snapshot start, rich result', () => {
    it('drives propose -> approve -> startApproved through the REAL services and prints a rich started result', async () => {
      mockLoadConfig.mockResolvedValue(makeFlagOnConfig());
      const legacyConfirm = vi.fn();
      const legacySpawnStart = vi.fn();
      const spawnStart = vi.fn((_sprint: Sprint, flowId: string): RunHandle => ({
        flowId, jobId: `job-${flowId}`, logRef: '/fake/log.log',
      }));
      const { factory, getController } = makeControllerFactory(spawnStart);

      await runCommand(['do', 'ship the widget exporter', '--run', '--yes'], {
        confirm: legacyConfirm, spawnStart: legacySpawnStart, createRunFlowController: factory,
      });

      expect(spawnStart).toHaveBeenCalledTimes(1);
      expect(spawnStart).toHaveBeenCalledWith(expect.objectContaining({ id: 'sprint-001' }), 'flow-1');
      expect(legacyConfirm).not.toHaveBeenCalled();
      expect(legacySpawnStart).not.toHaveBeenCalled();
      expect(getController().getContext().state).toBe('DETACHED_RUNNING');
      expect(output()).toContain(getMessage('runFlow.mount.started', 'en', { jobId: 'job-flow-1' }));

      // Durably persisted via the REAL run-flow-store.ts (core/), not just in-memory.
      const storedSnapshot = loadApprovedSnapshot(tmpRoot, 'flow-1');
      expect(storedSnapshot).toBeDefined();
      expect(storedSnapshot?.sprint.id).toBe('sprint-001');
      const storedHandle = loadRunHandle(tmpRoot, 'flow-1');
      expect(storedHandle?.handle.jobId).toBe('job-flow-1');

      // No golden-flow organs anywhere near this path.
      expect(existsSync(join(tmpRoot, DIRECTIVES_FILE))).toBe(false);
      expect(process.exitCode).toBeUndefined();
    });

    it('reports a controller error via runFlow.mount.error and sets exitCode=1, without throwing', async () => {
      mockLoadConfig.mockResolvedValue(makeFlagOnConfig());
      mockPlanSprint.mockImplementation(() => {
        throw new Error('plan generation exploded');
      });
      const { factory } = makeControllerFactory();

      await runCommand(['do', 'a goal that fails to plan', '--run', '--yes'], {
        createRunFlowController: factory,
      });

      expect(printError).toHaveBeenCalledWith(
        getMessage('runFlow.mount.error', 'en', { error: 'plan generation exploded' }),
      );
      expect(process.exitCode).toBe(1);
    });
  });
});

// ─── Pure helper: formatRunFlowDoPreview ───────────────────────────────────

describe('formatRunFlowDoPreview', () => {
  function makePreview(overrides?: Partial<PlanPreview>): PlanPreview {
    return {
      flowId: 'flow-1', revision: 1, planDigest: 'abcdef0123456789',
      taskSummaries: [{ title: 'Ship the thing', summary: 'Ship the thing well.' }],
      policyDecision: 'allow', gateResult: 'pass',
      ...overrides,
    };
  }

  it('renders the --run banner with the real task count and task summary lines', () => {
    const text = formatRunFlowDoPreview(makePreview(), true, 'en');
    expect(text).toContain('Confirm below to start the run now');
    expect(text).toContain('1. Ship the thing — Ship the thing well.');
    expect(text).toContain('GATE: PASS');
    expect(text).toContain('POLICY: ALLOW');
  });

  it('renders the dry-run banner when run=false', () => {
    const text = formatRunFlowDoPreview(makePreview(), false, 'en');
    expect(text).toContain('Nothing was started');
  });

  it('renders the no-tasks placeholder when taskSummaries is empty', () => {
    const text = formatRunFlowDoPreview(makePreview({ taskSummaries: [] }), true, 'en');
    expect(text).toContain('(no tasks)');
  });

  it('genuinely localizes to Turkish (en !== tr)', () => {
    const en = formatRunFlowDoPreview(makePreview(), true, 'en');
    const tr = formatRunFlowDoPreview(makePreview(), true, 'tr');
    expect(en).not.toBe(tr);
  });
});

// ─── Structural guard: dead organs never appear in the flag-on path ────────

describe('runDoRunFlow — structural guard (swap/sync-spawn organs never called on the flag-on path)', () => {
  it('the runDoRunFlow function body never references swapDirectives/restoreDirectives/defaultSpawnStart', () => {
    const source = readFileSync(new URL('../../src/cli/commands/do.ts', import.meta.url), 'utf-8');
    const start = source.indexOf('export async function runDoRunFlow');
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf('\n// ═══ DIRECTIVES.md transient swap', start);
    expect(end).toBeGreaterThan(start);
    const body = source.slice(start, end);
    expect(body).not.toContain('swapDirectives(');
    expect(body).not.toContain('restoreDirectives(');
    expect(body).not.toContain('defaultSpawnStart(');
  });
});

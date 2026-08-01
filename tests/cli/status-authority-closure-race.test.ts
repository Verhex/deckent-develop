// tests/cli/status-authority-closure-race.test.ts
//
// Task 485-007 — bounded source-process stress contract for the canonical status
// projection during the FIX → RETRO → COMPLETE closure window.
//
// This is NOT a fresh-fixture-per-test suite like status-json-contract.test.ts.
// It drives ONE deterministic fixture sequence over a SINGLE isolated project
// root, feeding conflicting `.dashboard`, `.deckent/sprint-state.json`,
// `.deckent/pause-state.json`, `.deckent/pids/<id>.pid` and `.tasks/task-*`
// snapshots through the real `registerStatus` (src/cli/commands/status.ts) at
// each closure-window step, and asserts the JSON and human projections never
// disagree about lifecycle truth and never report impossible progress
// (`done > total`) — even while stale/conflicting artifacts linger on disk,
// which is exactly the shape of a real FIX→RETRO→COMPLETE race.
//
// Evidence for the authority contract this suite stresses, established by
// running the real `status.ts` (via the same source-process driver used here)
// against a deterministic sequence of closure-window snapshots and observing
// its actual output before writing assertions:
//   - When `.tasks/task-*.json` files exist, progress is computed from their
//     real DONE/PENDING status, never from `.dashboard`'s own `progress`
//     field — a `.dashboard` carrying an impossible done>total progress value
//     is fully ignored, not clamped; `progress.done` never exceeds
//     `progress.total` because it was never sourced from the garbage number.
//   - `.deckent/pause-state.json`, once present, is the HIGHEST-authority
//     signal: lifecycle becomes `PAUSED`/`active:false` even while
//     `.deckent/sprint-state.json` and `.dashboard` both still claim
//     FIX/FIXING — both disagreeing surfaces are recorded in
//     `authority.conflicts` (never silently dropped, never allowed to
//     override the canonical PAUSED truth).
//   - A COMPLETE `.deckent/sprint-state.json`, once reached, emits the
//     honest terminal shape (`active:false`, `lifecycle:'COMPLETE'`) and
//     DROPS the raw `sprint`/`progress`/`agents` fields entirely — a stale
//     dashboard's "final-scan garbage" (e.g. `active:2`) can never leak a
//     positive worker count into either the JSON or the human projection.
//   - status-truth-gate.test.ts: the human formatter never prints "completed"
//     for a non-COMPLETE sprint, and always prints "completed" for one that is.
//
// Source-process (not dist/) driver: spawns `vite-node` against the real
// `src/cli/commands/status.ts`, exactly like status-json-contract.test.ts,
// with OS-backed stdout/stderr file capture (never piped — a pipe-transport
// artefact would misreport a real failure as an empty success). No sleeps, no
// retries, no mocks, no touching the real /workspace project state.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const VITE_NODE_BIN = join(REPO_ROOT, 'node_modules', '.bin', 'vite-node');
const STATUS_MODULE = join(REPO_ROOT, 'src', 'cli', 'commands', 'status.ts');

// ─── Driver (identical contract to status-json-contract.test.ts's driver) ──────

function buildDriverScript(statusModulePath: string): string {
  return `
import { Command } from 'commander';
import { registerStatus } from ${JSON.stringify(statusModulePath)};

async function main() {
  process.chdir(process.env.DECKENT_TEST_ROOT);
  const program = new Command();
  program.exitOverride();
  registerStatus(program);
  const args = process.argv.slice(2);
  try {
    await program.parseAsync(['node', 'test', 'status', ...args]);
  } catch {
    // commander exitOverride — no thrown-error paths are exercised by this contract
  }
  process.exit(process.exitCode ?? 0);
}
main();
`;
}

interface StatusRunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

async function runStatusDriver(
  driverPath: string,
  fakeRoot: string,
  args: string[],
  timeoutMs = 10000,
): Promise<StatusRunResult> {
  return await new Promise<StatusRunResult>((resolve, reject) => {
    // OS-backed capture files, never a pipe — a nested Vitest transport can
    // report exit 0 while silently dropping piped stdio (see status-json-
    // contract.test.ts). An empty payload here is real evidence, not an
    // artefact of the runner.
    const captureDir = mkdtempSync(join(tmpdir(), 'deckent-closure-race-stdio-'));
    const stdoutPath = join(captureDir, 'stdout');
    const stderrPath = join(captureDir, 'stderr');
    const stdoutFd = openSync(stdoutPath, 'w');
    const stderrFd = openSync(stderrPath, 'w');
    let settled = false;
    const closeDescriptors = () => {
      closeSync(stdoutFd);
      closeSync(stderrFd);
    };
    const child = spawn(VITE_NODE_BIN, [driverPath, ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env, DECKENT_TEST_ROOT: fakeRoot },
      stdio: ['ignore', stdoutFd, stderrFd],
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      closeDescriptors();
      rmSync(captureDir, { recursive: true, force: true });
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      closeDescriptors();
      try {
        resolve({
          code,
          stdout: readFileSync(stdoutPath, 'utf-8'),
          stderr: readFileSync(stderrPath, 'utf-8'),
          timedOut,
        });
      } finally {
        rmSync(captureDir, { recursive: true, force: true });
      }
    });
  });
}

// ─── Fixture writers ─────────────────────────────────────────────────────────

const SPRINT_ID = 'sprint-745';
const NOW = new Date().toISOString();

function writeSprintState(fakeRoot: string, phase: string, status: string): void {
  mkdirSync(join(fakeRoot, '.deckent'), { recursive: true });
  writeFileSync(
    join(fakeRoot, '.deckent', 'sprint-state.json'),
    JSON.stringify({ sprintId: SPRINT_ID, phase, status }),
    'utf-8',
  );
}

function writePidFile(fakeRoot: string): void {
  const pidsDir = join(fakeRoot, '.deckent', 'pids');
  mkdirSync(pidsDir, { recursive: true });
  writeFileSync(
    join(pidsDir, `${SPRINT_ID}.pid`),
    JSON.stringify({ pid: process.pid, sprintId: SPRINT_ID, startedAt: NOW }),
    'utf-8',
  );
}

function writeStalePauseFile(fakeRoot: string, reason: string): void {
  mkdirSync(join(fakeRoot, '.deckent'), { recursive: true });
  writeFileSync(
    join(fakeRoot, '.deckent', 'pause-state.json'),
    JSON.stringify({ sprintId: SPRINT_ID, status: 'PAUSED', reason }),
    'utf-8',
  );
}

function clearPauseFile(fakeRoot: string): void {
  rmSync(join(fakeRoot, '.deckent', 'pause-state.json'), { force: true });
}

function writeDashboard(
  fakeRoot: string,
  sprint: { phase: string; status: string },
  progress: { done: number; active: number; blocked: number; total: number },
  agents: Array<{ id: string; status: string }>,
): void {
  writeFileSync(
    join(fakeRoot, '.dashboard'),
    JSON.stringify({
      sprint: { id: SPRINT_ID, number: 745, phase: sprint.phase, status: sprint.status },
      agents,
      progress,
      alerts: [],
      updatedAt: new Date().toISOString(),
    }),
    'utf-8',
  );
}

function writeTaskProgress(fakeRoot: string, taskNum: number, status: 'PENDING' | 'DONE'): void {
  const tasksDir = join(fakeRoot, '.tasks');
  mkdirSync(tasksDir, { recursive: true });
  const taskId = `745-00${taskNum}`;
  writeFileSync(
    join(tasksDir, `task-${taskId}.json`),
    JSON.stringify({
      id: taskId,
      title: `Closure-window fixture task ${taskNum}`,
      description: 'Bounded closure-window stress fixture',
      model: 'sonnet',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'closure-window stress fixture',
      scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: 'done', noGoCriteria: 'failed', techDebtAcceptable: 'none' },
      status,
      sprintId: SPRINT_ID,
      createdAt: NOW,
    }),
    'utf-8',
  );
  if (status === 'DONE') {
    writeFileSync(
      join(tasksDir, `task-${taskId}.result`),
      JSON.stringify({
        taskId,
        workerId: `w-${taskId}`,
        filesChanged: [],
        linesAdded: 0,
        linesRemoved: 0,
        testsPassed: true,
        coverage: 100,
        selfAssessment: 'DONE',
        evaluationDecision: 'DONE',
        notes: 'closure-window fixture complete',
      }),
      'utf-8',
    );
  }
}

// ─── Suite ───────────────────────────────────────────────────────────────────

// Same nested-fork caveat as status-json-contract.test.ts — a nested Vitest
// `forks` worker loses captured subprocess stdio while reporting exit 0; this
// file must run with `--pool=threads` for the real source-process contract.
const NESTED_FORK_RUNNER = typeof process.send === 'function';

describe.skipIf(NESTED_FORK_RUNNER)('status authority — monotonic FIX→RETRO→COMPLETE closure-window stress (485-007)', () => {
  let driverDir: string;
  let driverPath: string;
  let fakeRoot: string;

  beforeAll(() => {
    driverDir = mkdtempSync(join(tmpdir(), 'deckent-closure-race-driver-'));
    driverPath = join(driverDir, 'driver.mjs');
    writeFileSync(driverPath, buildDriverScript(STATUS_MODULE), 'utf-8');
    fakeRoot = mkdtempSync(join(tmpdir(), 'deckent-closure-race-root-'));
  });

  afterAll(() => {
    rmSync(driverDir, { recursive: true, force: true });
    rmSync(fakeRoot, { recursive: true, force: true });
  });

  it('one deterministic fixture sequence: canonical lifecycle authority never competes across surfaces, progress never exceeds total, progress never regresses, and no active worker survives terminal COMPLETE authority', async () => {
    let prevDone = -1;
    let prevLifecycleWasComplete = false;

    // ── Stage 1: FIX window opens — dashboard fresh & consistent, 2/5 done ──
    writeSprintState(fakeRoot, 'FIX', 'FIXING');
    writePidFile(fakeRoot);
    writeDashboard(
      fakeRoot,
      { phase: 'FIX', status: 'FIXING' },
      { done: 2, active: 1, blocked: 0, total: 5 },
      [{ id: 'w-745-001-fix', status: 'EXECUTING' }],
    );
    writeTaskProgress(fakeRoot, 1, 'DONE');
    writeTaskProgress(fakeRoot, 2, 'DONE');
    writeTaskProgress(fakeRoot, 3, 'PENDING');
    writeTaskProgress(fakeRoot, 4, 'PENDING');
    writeTaskProgress(fakeRoot, 5, 'PENDING');

    {
      const json = await runStatusDriver(driverPath, fakeRoot, ['--json']);
      const human = await runStatusDriver(driverPath, fakeRoot, []);
      expect(json.timedOut).toBe(false);
      expect(human.timedOut).toBe(false);
      expect(json.code).toBe(0);
      expect(human.code).toBe(0);

      const parsed = JSON.parse(json.stdout.trim()) as {
        active: boolean;
        lifecycle: string;
        sprint: { phase: string; status: string };
        progress: { done: number; total: number };
        pendingApprovals: unknown[];
        authority: { conflicts: unknown[] };
      };
      expect(parsed).toMatchObject({
        active: true,
        lifecycle: 'ACTIVE',
        sprint: { phase: 'FIX', status: 'FIXING' },
        progress: { done: 2, total: 5 },
        pendingApprovals: [],
        authority: { conflicts: [] },
      });
      expect(parsed.progress.done).toBeLessThanOrEqual(parsed.progress.total);

      expect(human.stdout).toContain('Progress: 2/5 tasks done (40%)');
      expect(human.stdout.toLowerCase()).not.toContain('completed');

      expect(parsed.progress.done).toBeGreaterThanOrEqual(prevDone);
      prevDone = parsed.progress.done;
      prevLifecycleWasComplete = parsed.lifecycle === 'COMPLETE';
      expect(prevLifecycleWasComplete).toBe(false);
    }

    // ── Stage 2: FIX-window race — dashboard glitches to an impossible
    // done>total progress (9/5) AND a pause-state.json for THIS sprint leaks
    // in mid-fix while `.deckent/sprint-state.json` is still untouched
    // (FIX/FIXING). The pause artifact is the highest-authority signal: the
    // canonical lifecycle must flip to PAUSED and BOTH disagreeing surfaces
    // (sprint-state AND dashboard, still claiming FIXING) must be recorded
    // as conflicts — never silently resolved, never overriding PAUSED. A 3rd
    // task completes for real during the race. ──
    writeDashboard(
      fakeRoot,
      { phase: 'FIX', status: 'FIXING' },
      { done: 9, active: 1, blocked: 0, total: 5 },
      [{ id: 'w-745-001-fix', status: 'EXECUTING' }],
    );
    writeStalePauseFile(fakeRoot, 'race-leak');
    writeTaskProgress(fakeRoot, 3, 'DONE');

    {
      const json = await runStatusDriver(driverPath, fakeRoot, ['--json']);
      const human = await runStatusDriver(driverPath, fakeRoot, []);
      expect(json.timedOut).toBe(false);
      expect(human.timedOut).toBe(false);
      expect(json.code).toBe(0);
      expect(human.code).toBe(0);

      const parsed = JSON.parse(json.stdout.trim()) as {
        active: boolean;
        lifecycle: string;
        sprint: { phase: string; status: string };
        progress: { done: number; total: number };
        authority: { conflicts: Array<{ surface: string; value: string }> };
      };
      // The pause artifact is canonical: ONE lifecycle truth (PAUSED), not a
      // silent pick between the disagreeing sprint-state/dashboard surfaces.
      expect(parsed).toMatchObject({
        active: false,
        lifecycle: 'PAUSED',
        sprint: { phase: 'FIX', status: 'PAUSED' },
      });
      // Both disagreeing surfaces are recorded, never dropped.
      expect(parsed.authority.conflicts).toEqual(expect.arrayContaining([
        expect.objectContaining({ surface: 'sprint-state', value: 'FIXING-while-canonical-PAUSED' }),
        expect.objectContaining({ surface: 'dashboard', value: 'FIXING-while-canonical-PAUSED' }),
      ]));
      // Impossible dashboard progress (done:9 > total:5) never surfaces —
      // progress is sourced from the real .tasks/*.json files, not the
      // glitched dashboard field.
      expect(parsed.progress).toMatchObject({ done: 3, total: 5 });
      expect(parsed.progress.done).toBeLessThanOrEqual(parsed.progress.total);

      expect(human.stdout).toContain('Progress: 3/5 tasks done (60%)');
      expect(human.stdout).not.toContain('9/5');
      expect(human.stdout.toLowerCase()).not.toContain('completed');

      // Monotonic: closure-window progress never regresses across snapshots,
      // even while a canonical-authority race is in flight.
      expect(parsed.progress.done).toBeGreaterThanOrEqual(prevDone);
      prevDone = parsed.progress.done;
      expect(parsed.lifecycle === 'COMPLETE').toBe(false);
    }

    // ── Stage 3: race resolved — pause-state.json is cleared (the operator
    // resumed) and sprint-state.json advances to RETRO, dashboard matches
    // (5/5 done). No lingering conflicts. ──
    clearPauseFile(fakeRoot);
    writeSprintState(fakeRoot, 'RETRO', 'RETROSPECTIVE');
    writeDashboard(
      fakeRoot,
      { phase: 'RETRO', status: 'RETROSPECTIVE' },
      { done: 5, active: 0, blocked: 0, total: 5 },
      [],
    );
    writeTaskProgress(fakeRoot, 4, 'DONE');
    writeTaskProgress(fakeRoot, 5, 'DONE');

    {
      const json = await runStatusDriver(driverPath, fakeRoot, ['--json']);
      const human = await runStatusDriver(driverPath, fakeRoot, []);
      expect(json.timedOut).toBe(false);
      expect(human.timedOut).toBe(false);
      expect(json.code).toBe(0);
      expect(human.code).toBe(0);

      const parsed = JSON.parse(json.stdout.trim()) as {
        active: boolean;
        lifecycle: string;
        sprint: { phase: string; status: string };
        progress: { done: number; total: number };
        authority: { conflicts: unknown[] };
      };
      expect(parsed).toMatchObject({
        active: true,
        lifecycle: 'ACTIVE',
        sprint: { phase: 'RETRO', status: 'RETROSPECTIVE' },
        progress: { done: 5, total: 5 },
        authority: { conflicts: [] },
      });
      expect(parsed.progress.done).toBeLessThanOrEqual(parsed.progress.total);

      expect(human.stdout).toContain('Progress: 5/5 tasks done (100%)');
      expect(human.stdout.toLowerCase()).not.toContain('completed');

      expect(parsed.progress.done).toBeGreaterThanOrEqual(prevDone);
      prevDone = parsed.progress.done;
      expect(parsed.lifecycle === 'COMPLETE').toBe(false);
    }

    // ── Stage 4: COMPLETE authority publishes — sprint-state.json flips to
    // COMPLETE, but the dashboard still carries the classic "final-scan
    // garbage" live-shaped progress (active:2, total:8 — neither matching
    // the real 5-task window). Terminal authority must win outright and
    // strip the stale live fields entirely, never leak a positive worker
    // count into either projection. ──
    writeSprintState(fakeRoot, 'COMPLETE', 'COMPLETE');
    writeDashboard(
      fakeRoot,
      { phase: 'COMPLETE', status: 'COMPLETE' },
      { done: 0, active: 2, blocked: 0, total: 8 },
      [],
    );

    {
      const json = await runStatusDriver(driverPath, fakeRoot, ['--json']);
      const human = await runStatusDriver(driverPath, fakeRoot, []);
      expect(json.timedOut).toBe(false);
      expect(human.timedOut).toBe(false);
      expect(json.code).toBe(0);
      expect(human.code).toBe(0);

      const parsed = JSON.parse(json.stdout.trim()) as {
        active: boolean;
        lifecycle: string;
        sprint?: unknown;
        progress?: unknown;
        pendingApprovals: unknown[];
        authority: { lifecycle: string; active: boolean; conflicts: unknown[] };
      };
      expect(parsed).toMatchObject({
        active: false,
        lifecycle: 'COMPLETE',
        pendingApprovals: [],
        authority: { lifecycle: 'COMPLETE', active: false, conflicts: [] },
      });
      // The honest terminal shape drops the raw live surface entirely — no
      // stale progress/sprint object survives to be misread as still-live.
      expect(parsed.sprint).toBeUndefined();
      expect(parsed.progress).toBeUndefined();
      // No active workers may survive under terminal COMPLETE authority —
      // the dashboard's stale active:2 garbage must never leak into JSON.
      expect(json.stdout).not.toContain('"active": 2');

      expect(human.stdout.toLowerCase()).toContain('completed');
      // No active workers may survive under terminal COMPLETE authority in
      // the human projection either — never a positive worker count post-close.
      expect(human.stdout).not.toMatch(/Active: \d+ workers/);
      expect(human.stdout).not.toContain('Progress:');

      // Terminal step: lifecycle must not regress back to a non-terminal value
      // once COMPLETE authority is reached, and the prior step must not have
      // already been (falsely) terminal.
      expect(prevLifecycleWasComplete).toBe(false);
      expect(parsed.lifecycle).toBe('COMPLETE');
    }
  }, 120000);
});

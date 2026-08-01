// tests/cli/status-json-contract.test.ts
//
// Task 433-002 — hermetic regression coverage for `deckent status`'s no-active-run
// contract (born-688 / sibling task 433-001, which added `buildNoActiveStatusJson`
// to src/cli/commands/status.ts). Guards:
//   1. `--json` with no `.dashboard` and no `.tasks/task-*.json` → stdout is exactly
//      one JSON.parse-able canonical IDLE authority object.
//   2. Same state but with a parked nervous approval → `pendingApprovals` carries the
//      full `{kind,id,title,acceptCommand,rejectCommand}` shape from
//      `readPendingApprovals` (core/pending-approvals.ts), not a truncated summary.
//   3/4. The SAME no-active state without `--json` still prints the pre-existing
//      human text (+ pending-approvals block) and exits 0 — i.e. the JSON branch did
//      not regress the human path.
//
// Real code, real subprocess, no mocks (spawnSync is banned by this project's
// Hermeticity rule; a mock-only test would not prove the actual stdout contract).
// `dist/` is stale relative to `src/cli/commands/status.ts` right now (a concurrent
// sibling task is mid-edit) and this task must not run `npm run build` during a live
// sprint, so — like tests/cli/init-noninteractive.test.ts — a small driver script is
// run through `node_modules/.bin/vite-node`, which resolves this project's
// `.js`-suffixed relative imports against their real `.ts` source (same resolution
// vitest itself uses). The driver statically imports `commander` + the real
// `registerStatus` while the spawned process's cwd is still the repo root (so the
// bare `commander` import resolves against /workspace/node_modules), then calls
// `process.chdir(<isolated tmpdir>)` before invoking `registerStatus` — since
// `resolveProjectRoot()` is just `process.cwd()`, every fs read inside status.ts then
// targets the per-test tmpdir, never the real /workspace project state.

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
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

// ─── Driver script (written once to its own tmpdir, never into the repo) ────────

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
    // Some nested Node/Vitest transports return exit 0 while dropping piped
    // stdout/stderr. Direct child descriptors to OS-backed temp files so an
    // empty payload is real evidence, never a pipe-transport artefact.
    const captureDir = mkdtempSync(join(tmpdir(), 'deckent-status-stdio-'));
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

function seedPendingNervousApproval(fakeRoot: string, id: string, title: string): void {
  const nervousDir = join(fakeRoot, '.deckent', 'nervous');
  mkdirSync(nervousDir, { recursive: true });
  writeFileSync(
    join(nervousDir, 'nervous-pending.json'),
    JSON.stringify([{ id, title }]),
    'utf-8',
  );
}

/**
 * 455-003: seed a COMPLETE-status `.dashboard` carrying the classic "final-scan
 * garbage" live-shaped progress (active:2/done:0). A fresh updatedAt keeps it out
 * of the orphan-gate, so the terminal COMPLETE-gate — not staleness — is what
 * the JSON surface must honor.
 */
function seedCompleteDashboard(fakeRoot: string): void {
  writeFileSync(
    join(fakeRoot, '.dashboard'),
    JSON.stringify({
      sprint: { id: 'sprint-375', number: 375, phase: 'COMPLETE', status: 'COMPLETE' },
      agents: [],
      progress: { done: 0, active: 2, blocked: 0, total: 8 },
      alerts: [],
      updatedAt: new Date().toISOString(),
    }),
    'utf-8',
  );
}

function seedStaleActiveDashboard(fakeRoot: string): void {
  writeFileSync(
    join(fakeRoot, '.dashboard'),
    JSON.stringify({
      sprint: { id: 'sprint-479', number: 479, phase: 'EXECUTE', status: 'ACTIVE' },
      agents: [{ id: 'w-479-001-fix', status: 'EXECUTING' }],
      progress: { done: 0, active: 0, blocked: 18, total: 18 },
      alerts: [],
      updatedAt: new Date().toISOString(),
    }),
    'utf-8',
  );
}

function seedConflictingLiveDashboard(fakeRoot: string): void {
  const deckentDir = join(fakeRoot, '.deckent');
  const pidsDir = join(deckentDir, 'pids');
  mkdirSync(pidsDir, { recursive: true });
  writeFileSync(
    join(deckentDir, 'sprint-state.json'),
    JSON.stringify({ sprintId: 'sprint-981', phase: 'FIX', status: 'FIXING' }),
    'utf-8',
  );
  writeFileSync(
    join(pidsDir, 'sprint-981.pid'),
    JSON.stringify({
      pid: process.pid,
      sprintId: 'sprint-981',
      startedAt: new Date().toISOString(),
    }),
    'utf-8',
  );
  writeFileSync(
    join(fakeRoot, '.dashboard'),
    JSON.stringify({
      sprint: {
        id: 'sprint-981',
        number: 981,
        phase: 'RETRO',
        status: 'RETROSPECTIVE',
      },
      agents: [],
      progress: { done: 4, active: 0, blocked: 0, total: 3 },
      alerts: [],
      updatedAt: new Date().toISOString(),
    }),
    'utf-8',
  );
}

// ─── Suite ───────────────────────────────────────────────────────────────────────

// This suite launches vite-node subprocesses. The host's nested Vitest `forks`
// pool loses their captured stdio while returning exit 0; execute this file
// with `--pool=threads` for the real source-process contract.
const NESTED_FORK_RUNNER = typeof process.send === 'function';

describe.skipIf(NESTED_FORK_RUNNER)('deckent status --json — no-active-run contract (433-002 / born-688)', () => {
  let driverDir: string;
  let driverPath: string;

  beforeAll(() => {
    driverDir = mkdtempSync(join(tmpdir(), 'deckent-status-json-driver-'));
    driverPath = join(driverDir, 'driver.mjs');
    writeFileSync(driverPath, buildDriverScript(STATUS_MODULE), 'utf-8');
  });

  afterAll(() => {
    rmSync(driverDir, { recursive: true, force: true });
  });

  let fakeRoot: string;

  beforeEach(() => {
    fakeRoot = mkdtempSync(join(tmpdir(), 'deckent-status-json-root-'));
  });

  afterEach(() => {
    rmSync(fakeRoot, { recursive: true, force: true });
  });

  it('--json with no dashboard and no tasks: stdout is exactly one canonical IDLE object, exit 0', async () => {
    const result = await runStatusDriver(driverPath, fakeRoot, ['--json']);

    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');

    const trimmed = result.stdout.trim();
    // Single-object contract: the whole stdout is one JSON blob, no leading/trailing prose.
    expect(trimmed).toMatch(/^\{[\s\S]*\}$/);
    const parsed: unknown = JSON.parse(trimmed);
    expect(parsed).toMatchObject({
      active: false,
      lifecycle: 'IDLE',
      resumable: false,
      sprintId: null,
      pendingApprovals: [],
      authority: {
        schemaVersion: 1,
        lifecycle: 'IDLE',
        active: false,
        resumable: false,
        sprintId: null,
      },
    });
  }, 15000);

  it('--json with a parked nervous approval: pendingApprovals carries the full PendingApproval shape', async () => {
    seedPendingNervousApproval(fakeRoot, 'appr-1', 'Deploy prod change');

    const result = await runStatusDriver(driverPath, fakeRoot, ['--json']);

    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(0);

    const parsed = JSON.parse(result.stdout.trim()) as { active: boolean; pendingApprovals: unknown[] };
    expect(parsed.active).toBe(false);
    expect(parsed.pendingApprovals).toEqual([
      {
        kind: 'nervous',
        id: 'appr-1',
        title: 'Deploy prod change',
        acceptCommand: 'deckent nervous accept appr-1',
        rejectCommand: 'deckent nervous reject appr-1',
      },
    ]);
  }, 15000);

  it('without --json, no dashboard/tasks: preserves the existing human-text + exit-code contract (not JSON)', async () => {
    const result = await runStatusDriver(driverPath, fakeRoot, []);

    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('No active run (sprint). Run `deckent start` first.');
    expect(() => JSON.parse(result.stdout.trim())).toThrow();
  }, 15000);

  it('without --json + a parked approval: the pending-approvals text block still renders unchanged', async () => {
    seedPendingNervousApproval(fakeRoot, 'appr-1', 'Deploy prod change');

    const result = await runStatusDriver(driverPath, fakeRoot, []);

    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('No active run (sprint). Run `deckent start` first.');
    expect(result.stdout).toContain('Pending approvals: 1');
    expect(result.stdout).toContain('deckent nervous accept appr-1');
    expect(() => JSON.parse(result.stdout.trim())).toThrow();
  }, 15000);

  // ─── 455-003 (TERMINAL-LIFECYCLE-TRUTH): COMPLETE dashboard human/JSON parity ──
  it('--json with a COMPLETE dashboard: emits the honest no-active shape (JSON twin of the human completed-gate)', async () => {
    seedCompleteDashboard(fakeRoot);

    const result = await runStatusDriver(driverPath, fakeRoot, ['--json']);

    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout.trim()) as {
      active: boolean;
      lifecycle: string;
      pendingApprovals: unknown[];
    };
    expect(parsed).toMatchObject({
      active: false,
      lifecycle: 'COMPLETE',
      pendingApprovals: [],
      authority: {
        lifecycle: 'COMPLETE',
        active: false,
      },
    });
    // The completed sprint's stale live-shaped progress (active:2) must NOT leak
    // into the JSON surface (the pre-455-003 divergence).
    expect(result.stdout).not.toContain('"active": 2');
  }, 15000);

  it('--json ignores a fresh ACTIVE dashboard when no lifecycle authority exists', async () => {
    seedStaleActiveDashboard(fakeRoot);

    const result = await runStatusDriver(driverPath, fakeRoot, ['--json']);

    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout.trim()) as {
      active: boolean;
      lifecycle: string;
      sprint?: unknown;
      authority: { conflicts: Array<{ surface: string; value: string }> };
    };
    expect(parsed).toMatchObject({
      active: false,
      lifecycle: 'IDLE',
    });
    expect(parsed.sprint).toBeUndefined();
    expect(parsed.authority.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        surface: 'dashboard',
        value: 'ACTIVE-while-canonical-IDLE',
      }),
    ]));
  }, 15000);

  it('--json projects stale dashboard lifecycle and impossible progress through one authority snapshot', async () => {
    seedConflictingLiveDashboard(fakeRoot);

    const result = await runStatusDriver(driverPath, fakeRoot, ['--json']);

    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout.trim()) as {
      lifecycle: string;
      phase: string;
      status: string;
      sprint: { phase: string; status: string };
      progress: { done: number; total: number };
      statusProjection: {
        dashboardLifecycleNormalized: boolean;
        progressAdjusted: boolean;
      };
    };
    expect(parsed).toMatchObject({
      lifecycle: 'ACTIVE',
      phase: 'FIX',
      status: 'FIXING',
      sprint: { phase: 'FIX', status: 'FIXING' },
      progress: { done: 3, total: 3 },
      statusProjection: {
        dashboardLifecycleNormalized: true,
        progressAdjusted: true,
      },
    });
  }, 15000);

  it('COMPLETE dashboard: human + JSON agree it is not live (no unqualified Complete-as-active)', async () => {
    seedCompleteDashboard(fakeRoot);

    const human = await runStatusDriver(driverPath, fakeRoot, []);
    const json = await runStatusDriver(driverPath, fakeRoot, ['--json']);

    expect(human.code).toBe(0);
    expect(json.code).toBe(0);
    // Human renders the honest completed record, never the live Progress/Active lines.
    expect(human.stdout.toLowerCase()).toContain('completed');
    expect(human.stdout).not.toContain('Active: 2 workers');
    // JSON reports active:false — the two surfaces agree the sprint is not live.
    expect((JSON.parse(json.stdout.trim()) as { active: boolean }).active).toBe(false);
  }, 20000);
});

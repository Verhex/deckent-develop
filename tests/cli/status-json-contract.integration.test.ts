// tests/cli/status-json-contract.integration.test.ts
//
// Task 433-003 — real-binary counterpart to sibling task 433-002's source-level
// (vite-node driver) coverage of the born-688 `deckent status --json` no-active-run
// contract. Where 433-002 proves the CONTRACT against `src/cli/commands/status.ts`
// via a driver script, this suite proves the same contract against the actually
// DISTRIBUTED artifact: it spawns `node dist/cli/entry.js status --json` as a real
// subprocess (async spawn, never spawnSync — this project's Hermeticity rule) inside
// an isolated, empty-state tmpdir workspace, JSON.parses the ENTIRE stdout in one
// call, and asserts the canonical IDLE authority shape + exit 0.
//
// `resolveProjectRoot()` (src/cli/helpers/process.ts) is just `process.cwd()`, so
// passing `cwd: fakeRoot` to `spawn` isolates the CHILD process's view of the project
// root without ever touching this test process's own cwd — important in a shared
// multi-agent worktree where a `process.chdir()` on the runner itself would be unsafe.
//
// This task's constraints forbid running `npm run build` during a live sprint. If
// `dist/` is stale or missing relative to `src/cli/commands/status.ts`, that is a
// legitimate environmental NO-GO for the *task*, not a reason to weaken this test's
// assertions — the test always asserts the real, currently-shipped contract.

import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DIST_ENTRY = join(REPO_ROOT, 'dist', 'cli', 'entry.js');

interface StatusRunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

async function runRealBinary(
  fakeRoot: string,
  command: string,
  args: string[],
  timeoutMs = 10000,
): Promise<StatusRunResult> {
  return await new Promise<StatusRunResult>((resolve, reject) => {
    const childEnv = { ...process.env };
    // The subprocess is a production-binary proof, not another Vitest worker.
    // Do not leak the runner's process-mode markers into the distributed CLI.
    delete childEnv['VITEST'];
    delete childEnv['VITEST_POOL_ID'];
    delete childEnv['VITEST_WORKER_ID'];
    delete childEnv['NODE_ENV'];
    delete childEnv['DECKENT_TEST_HERMETICITY'];
    delete childEnv['NODE_CHANNEL_FD'];
    delete childEnv['NODE_CHANNEL_SERIALIZATION_MODE'];
    const child = spawn(process.execPath, [DIST_ENTRY, command, ...args], {
      cwd: fakeRoot,
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b: Buffer) => { stdout += b.toString('utf-8'); });
    child.stderr.on('data', (b: Buffer) => { stderr += b.toString('utf-8'); });
    child.on('error', reject);

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

function runRealBinaryStatus(
  fakeRoot: string,
  args: string[],
  timeoutMs = 10000,
): Promise<StatusRunResult> {
  return runRealBinary(fakeRoot, 'status', args, timeoutMs);
}

function seedActiveDashboardWithoutAuthority(fakeRoot: string): void {
  writeFileSync(
    join(fakeRoot, '.dashboard'),
    JSON.stringify({
      sprint: {
        id: 'sprint-479',
        number: 479,
        phase: 'EXECUTE',
        status: 'ACTIVE',
      },
      agents: [{ id: 'w-479-001-fix', status: 'EXECUTING' }],
      progress: { done: 0, active: 0, blocked: 18, total: 18 },
      alerts: [],
      updatedAt: new Date().toISOString(),
    }),
    'utf-8',
  );
}

function seedLiveCoordinatorAuthority(fakeRoot: string): {
  statePath: string;
  sentinelPath: string;
} {
  const deckentDir = join(fakeRoot, '.deckent');
  const pidsDir = join(deckentDir, 'pids');
  const tasksDir = join(fakeRoot, '.tasks');
  mkdirSync(pidsDir, { recursive: true });
  mkdirSync(tasksDir, { recursive: true });

  const sprintId = 'sprint-980';
  const statePath = join(deckentDir, 'sprint-state.json');
  const sentinelPath = join(tasksDir, 'task-980-001.log');
  writeFileSync(
    statePath,
    JSON.stringify({
      sprintId,
      phase: 'EXECUTE',
      status: 'ACTIVE',
    }),
    'utf-8',
  );
  writeFileSync(
    join(pidsDir, `${sprintId}.pid`),
    JSON.stringify({
      pid: process.pid,
      sprintId,
      startedAt: new Date().toISOString(),
    }),
    'utf-8',
  );
  writeFileSync(sentinelPath, 'must-survive-authority-hold\n', 'utf-8');
  return { statePath, sentinelPath };
}

// born-694: CI test jobs run on a FRESH CHECKOUT with no dist/ build artifact
// (hermeticity contract — karpathy-discipline CUSTOM: "CI=fresh checkout").
// This suite's entire point is the REAL compiled binary, so when dist/ is
// absent it SKIPS loudly instead of failing; it runs locally post-build and
// in any pipeline stage that builds first (release rehearsal, packed smoke).
const DIST_AVAILABLE = existsSync(DIST_ENTRY);
// The repository's default Vitest pool is `forks`. On this host, launching a
// second Node CLI from inside that IPC child returns the correct exit code but
// loses both captured stdio streams (the sibling worktree-binary live suite
// exhibits the same host/runtime behavior). The distributed-binary gate runs
// this file with `--pool=threads`; fresh-checkout/unit runs skip it honestly.
const NESTED_FORK_RUNNER = typeof process.send === 'function';

describe.skipIf(!DIST_AVAILABLE || NESTED_FORK_RUNNER)('deckent status --json — real dist/ binary contract (433-003 / born-688)', () => {
  it('dist/cli/entry.js is present (build artifact required for this suite)', () => {
    expect(existsSync(DIST_ENTRY)).toBe(true);
  });

  it('real binary, isolated empty-state workspace: stdout is exactly one canonical IDLE object, exit 0', async () => {
    const fakeRoot = mkdtempSync(join(tmpdir(), 'deckent-status-json-dist-'));
    try {
      const result = await runRealBinaryStatus(fakeRoot, ['--json']);

      expect(result.timedOut).toBe(false);
      expect(result.stderr).toBe('');
      expect(result.code).toBe(0);

      const trimmed = result.stdout.trim();
      // Single-payload contract: the whole stdout is one JSON blob, no leading/trailing
      // prose and no duplicated/partial payloads. A failure here almost always means
      // dist/ predates src/cli/commands/status.ts (buildNoActiveStatusJson missing from
      // the compiled output) — that needs a host-side `npm run build`, which workers
      // must never run themselves (see WORKER-GUIDE); it is not a test/source defect.
      expect(
        trimmed,
        `expected dist/cli/entry.js to emit a single JSON object but got: ${JSON.stringify(trimmed)} — ` +
          'this usually means dist/ is stale relative to src/cli/commands/status.ts and needs a host-side rebuild',
      ).toMatch(/^\{[\s\S]*\}$/);
      const parsed = JSON.parse(trimmed) as { active: unknown; pendingApprovals: unknown };
      expect(parsed.active).toBe(false);
      expect(Array.isArray(parsed.pendingApprovals)).toBe(true);
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
    } finally {
      rmSync(fakeRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('real binary ignores a fresh ACTIVE dashboard when no lifecycle authority exists', async () => {
    const fakeRoot = mkdtempSync(join(tmpdir(), 'deckent-status-json-dist-stale-'));
    try {
      seedActiveDashboardWithoutAuthority(fakeRoot);
      const result = await runRealBinaryStatus(fakeRoot, ['--json']);

      expect(result.timedOut).toBe(false);
      expect(result.stderr).toBe('');
      expect(result.code).toBe(0);
      const parsed = JSON.parse(result.stdout.trim()) as {
        active: boolean;
        lifecycle: string;
        sprint?: unknown;
        authority: { conflicts: Array<{ surface: string; value: string }> };
      };
      expect(parsed).toMatchObject({ active: false, lifecycle: 'IDLE' });
      expect(parsed.sprint).toBeUndefined();
      expect(parsed.authority.conflicts).toEqual(expect.arrayContaining([
        expect.objectContaining({
          surface: 'dashboard',
          value: 'ACTIVE-while-canonical-IDLE',
        }),
      ]));
    } finally {
      rmSync(fakeRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('real binary cleanup HOLD preserves projections while coordinator authority is live', async () => {
    const fakeRoot = mkdtempSync(join(tmpdir(), 'deckent-cleanup-dist-active-'));
    try {
      const { statePath, sentinelPath } = seedLiveCoordinatorAuthority(fakeRoot);
      const stateBefore = readFileSync(statePath, 'utf-8');
      const sentinelBefore = readFileSync(sentinelPath, 'utf-8');

      const result = await runRealBinary(fakeRoot, 'cleanup', []);

      expect(result.timedOut).toBe(false);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('coordinator-active');
      expect(readFileSync(statePath, 'utf-8')).toBe(stateBefore);
      expect(readFileSync(sentinelPath, 'utf-8')).toBe(sentinelBefore);
    } finally {
      rmSync(fakeRoot, { recursive: true, force: true });
    }
  }, 15000);
});

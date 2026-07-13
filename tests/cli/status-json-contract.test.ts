// tests/cli/status-json-contract.test.ts
//
// Task 433-002 — hermetic regression coverage for `deckent status`'s no-active-run
// contract (born-688 / sibling task 433-001, which added `buildNoActiveStatusJson`
// to src/cli/commands/status.ts). Guards:
//   1. `--json` with no `.dashboard` and no `.tasks/task-*.json` → stdout is exactly
//      one JSON.parse-able object: `{ active: false, pendingApprovals: [] }`.
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
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
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
  return await new Promise<StatusRunResult>((resolve) => {
    const child = spawn(VITE_NODE_BIN, [driverPath, ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env, DECKENT_TEST_ROOT: fakeRoot },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b: Buffer) => { stdout += b.toString('utf-8'); });
    child.stderr.on('data', (b: Buffer) => { stderr += b.toString('utf-8'); });

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

function seedPendingNervousApproval(fakeRoot: string, id: string, title: string): void {
  const nervousDir = join(fakeRoot, '.deckent', 'nervous');
  mkdirSync(nervousDir, { recursive: true });
  writeFileSync(
    join(nervousDir, 'nervous-pending.json'),
    JSON.stringify([{ id, title }]),
    'utf-8',
  );
}

// ─── Suite ───────────────────────────────────────────────────────────────────────

describe('deckent status --json — no-active-run contract (433-002 / born-688)', () => {
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

  it('--json with no dashboard and no tasks: stdout is exactly one JSON object, {active:false, pendingApprovals:[]}, exit 0', async () => {
    const result = await runStatusDriver(driverPath, fakeRoot, ['--json']);

    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(0);

    const trimmed = result.stdout.trim();
    // Single-object contract: the whole stdout is one JSON blob, no leading/trailing prose.
    expect(trimmed).toMatch(/^\{[\s\S]*\}$/);
    const parsed: unknown = JSON.parse(trimmed);
    expect(parsed).toEqual({ active: false, pendingApprovals: [] });
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
    expect(result.stdout).toContain('No active sprint. Run `deckent start` first.');
    expect(() => JSON.parse(result.stdout.trim())).toThrow();
  }, 15000);

  it('without --json + a parked approval: the pending-approvals text block still renders unchanged', async () => {
    seedPendingNervousApproval(fakeRoot, 'appr-1', 'Deploy prod change');

    const result = await runStatusDriver(driverPath, fakeRoot, []);

    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('No active sprint. Run `deckent start` first.');
    expect(result.stdout).toContain('Pending approvals: 1');
    expect(result.stdout).toContain('deckent nervous accept appr-1');
    expect(() => JSON.parse(result.stdout.trim())).toThrow();
  }, 15000);
});

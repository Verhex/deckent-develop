// tests/cli/status-json-contract.integration.test.ts
//
// Task 433-003 — real-binary counterpart to sibling task 433-002's source-level
// (vite-node driver) coverage of the born-688 `deckent status --json` no-active-run
// contract. Where 433-002 proves the CONTRACT against `src/cli/commands/status.ts`
// via a driver script, this suite proves the same contract against the actually
// DISTRIBUTED artifact: it spawns `node dist/cli/entry.js status --json` as a real
// subprocess (async spawn, never spawnSync — this project's Hermeticity rule) inside
// an isolated, empty-state tmpdir workspace, JSON.parses the ENTIRE stdout in one
// call, and asserts the exact `{active:false, pendingApprovals:[...]}` shape + exit 0.
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
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
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

async function runRealBinaryStatus(
  fakeRoot: string,
  args: string[],
  timeoutMs = 10000,
): Promise<StatusRunResult> {
  return await new Promise<StatusRunResult>((resolve, reject) => {
    const child = spawn(process.execPath, [DIST_ENTRY, 'status', ...args], {
      cwd: fakeRoot,
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

describe('deckent status --json — real dist/ binary contract (433-003 / born-688)', () => {
  it('dist/cli/entry.js is present (build artifact required for this suite)', () => {
    expect(existsSync(DIST_ENTRY)).toBe(true);
  });

  it('real binary, isolated empty-state workspace: stdout is exactly one JSON object, {active:false, pendingApprovals:[]}, exit 0', async () => {
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
      expect(parsed).toEqual({ active: false, pendingApprovals: [] });
    } finally {
      rmSync(fakeRoot, { recursive: true, force: true });
    }
  }, 15000);
});

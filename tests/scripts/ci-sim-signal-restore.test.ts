/**
 * Sprint 232 Task 232-004 — ci-sim SIGINT/SIGTERM restore handler hermetic tests.
 *
 * Validates that scripts/test-ci-sim.mjs restores stashed paths when interrupted
 * by SIGINT or SIGTERM (the try/finally alone does not fire on unhandled signals).
 *
 * Test strategy:
 *  1. Create a hermetic tmpdir with .brain/memory.db
 *  2. Spawn ci-sim with CI_SIM_ROOT=tmpdir + CI_SIM_RUNNER_SLEEP_MS=10000
 *     (runner sleeps 10s → stash is in place while we send the signal)
 *  3. Poll for the stash file to confirm stash completed
 *  4. Send the signal → child exits 2
 *  5. Assert memory.db is restored
 *
 * Hermeticity rules:
 *  - All I/O under os.tmpdir()
 *  - async spawn (no spawnSync)
 *  - No gitignored state read
 */

import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(__filename, '..', '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'test-ci-sim.mjs');

const sandboxes: string[] = [];

function createSandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ci-sim-sig-'));
  sandboxes.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of sandboxes.splice(0)) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* non-fatal */ }
  }
});

/** Poll until .brain/memory.db.cisim-stash-* exists, meaning stash happened. */
async function waitForStash(dir: string, timeoutMs = 6000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const brainDir = join(dir, '.brain');
      if (existsSync(brainDir)) {
        const files = readdirSync(brainDir);
        if (files.some((f) => f.startsWith('memory.db.cisim-stash-'))) return true;
      }
    } catch { /* ignore read errors during polling */ }
    await sleep(50);
  }
  return false;
}

/** Await child process exit and return the exit code. */
function waitForExit(child: ReturnType<typeof spawn>): Promise<number> {
  return new Promise((res) => {
    child.once('exit', (code) => res(code ?? -1));
  });
}

describe('ci-sim signal restore handler', () => {
  it('SIGINT: restores stashed memory.db and exits with code 2', async () => {
    const sandbox = createSandbox();
    mkdirSync(join(sandbox, '.brain'));
    writeFileSync(join(sandbox, '.brain', 'memory.db'), 'fake-sqlite-content');

    const child = spawn(
      process.execPath,
      [SCRIPT],
      {
        env: {
          ...process.env,
          CI_SIM_ROOT: sandbox,
          CI_SIM_RUNNER_SLEEP_MS: '10000',
        },
        stdio: ['ignore', 'ignore', 'pipe'],
      },
    );

    const stashFound = await waitForStash(sandbox);
    expect(stashFound, 'stash file should appear before signal').toBe(true);
    expect(existsSync(join(sandbox, '.brain', 'memory.db')), 'db should be stashed (absent)').toBe(false);

    child.kill('SIGINT');
    const code = await waitForExit(child);

    expect(code).toBe(2);
    expect(existsSync(join(sandbox, '.brain', 'memory.db')), 'db should be restored after SIGINT').toBe(true);
  }, 15_000);

  it('SIGTERM: restores stashed memory.db and exits with code 2', async () => {
    const sandbox = createSandbox();
    mkdirSync(join(sandbox, '.brain'));
    writeFileSync(join(sandbox, '.brain', 'memory.db'), 'fake-sqlite-content');

    const child = spawn(
      process.execPath,
      [SCRIPT],
      {
        env: {
          ...process.env,
          CI_SIM_ROOT: sandbox,
          CI_SIM_RUNNER_SLEEP_MS: '10000',
        },
        stdio: ['ignore', 'ignore', 'pipe'],
      },
    );

    const stashFound = await waitForStash(sandbox);
    expect(stashFound, 'stash file should appear before signal').toBe(true);
    expect(existsSync(join(sandbox, '.brain', 'memory.db')), 'db should be stashed (absent)').toBe(false);

    child.kill('SIGTERM');
    const code = await waitForExit(child);

    expect(code).toBe(2);
    expect(existsSync(join(sandbox, '.brain', 'memory.db')), 'db should be restored after SIGTERM').toBe(true);
  }, 15_000);
});

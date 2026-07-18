// ─── CLI Smoke — Real-Binary E2E for `status` and `doctor` ───────────────────
// Task 447-004. Sprint's forward-looking proof-of-function investment: a
// unit-green suite is not proof that the real CLI works — only a real-binary
// run closes a Tier-1 surface. This spawns the BUILT dist/cli/entry.js
// asynchronously (never spawnSync — ADR-D-002) inside a hermetic tmpdir
// project and asserts on the actual stdout the two commands produce.
//
//   T1: `deckent status` (fresh project, no active sprint) → real
//       "No active sprint" text from the standalone-status branch.
//   T2: `deckent doctor --json` → real, well-formed DoctorResult JSON —
//       structural guarantees that hold on every host (providers always has
//       4 entries; our fixture's `.deckent/` makes the Workspace check pass).
//
// Hermetic guarantees (mirrors tests/e2e/kpi-surface-smoke.test.ts):
//   - Project root is a fresh tmpdir (os.tmpdir()) — never the real repo root.
//   - HOME is sandboxed to a second tmpdir so ~/.deckent is never read/written.
//   - Every spawned child is tracked and force-killed in afterEach — no
//     orphaned processes even if the spawn-level `timeout` safety net misses.
//   - If dist/cli/entry.js is absent (fresh checkout, `npm run build` not run
//     yet), the whole suite is skipped via describe.skipIf — never a hard
//     failure.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

// ─── Paths ────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..', '..');
const ENTRY = resolve(REPO_ROOT, 'dist', 'cli', 'entry.js');

const DIST_ABSENT = !existsSync(ENTRY);

// ─── Async CLI spawn helper (no spawnSync — ADR-D-002) ────────────────────────

interface CliResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

function runCli(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
  track: Set<ChildProcess>,
): Promise<CliResult> {
  return new Promise((resolveP, rejectP) => {
    const child = spawn(
      process.execPath,
      ['--enable-source-maps', ENTRY, ...args],
      { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs },
    );
    track.add(child);
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('error', (err) => {
      track.delete(child);
      rejectP(err);
    });
    child.on('close', (code) => {
      track.delete(child);
      resolveP({ exitCode: code, stdout, stderr });
    });
  });
}

/** Force-kill any child that survived its spawn-level `timeout` safety net. */
function reapSurvivors(track: Set<ChildProcess>): void {
  for (const child of track) {
    if (child.exitCode === null && !child.killed) {
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
    }
  }
  track.clear();
}

// ─── Fresh-project fixture ─────────────────────────────────────────────────────

/** A fresh project tmpdir: `.deckent/`, `.tasks/`, `.locks/`, `.brain/` exist, but empty — no sprint, no dashboard. */
function makeProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-cli-smoke-'));
  mkdirSync(join(root, '.deckent'), { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  mkdirSync(join(root, '.locks'), { recursive: true });
  mkdirSync(join(root, '.brain'), { recursive: true });
  return root;
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe.skipIf(DIST_ABSENT)(
  `CLI smoke — real-binary e2e (status + doctor)${DIST_ABSENT ? ' [SKIP: dist not built]' : ''}`,
  () => {
    let root: string;
    let sandboxHome: string;
    let track: Set<ChildProcess>;
    let env: NodeJS.ProcessEnv;

    beforeEach(() => {
      root = makeProject();
      sandboxHome = mkdtempSync(join(tmpdir(), 'deckent-cli-smoke-home-'));
      track = new Set();
      env = { ...process.env, HOME: sandboxHome };
    });

    afterEach(() => {
      reapSurvivors(track);
      rmSync(root, { recursive: true, force: true });
      rmSync(sandboxHome, { recursive: true, force: true });
    });

    // ── T1: `deckent status` — fresh project, no active sprint ──────────────

    it(
      'T1: `deckent status` on a fresh project prints the real "no active sprint" message',
      async () => {
        const result = await runCli(['status'], root, env, 15_000, track);

        expect(
          result.exitCode,
          `status exited abnormally — stderr:\n${result.stderr}`,
        ).toBe(0);
        expect(result.stdout).toContain('No active sprint');
        expect(result.stdout).toContain('deckent start');
      },
      20_000,
    );

    // ── T2: `deckent doctor --json` — real DoctorResult JSON ─────────────────

    it(
      'T2: `deckent doctor --json` prints real, well-formed DoctorResult JSON',
      async () => {
        const result = await runCli(['doctor', '--json'], root, env, 25_000, track);

        expect(
          result.exitCode,
          `doctor did not exit cleanly (null = killed/hung) — stderr:\n${result.stderr}`,
        ).not.toBeNull();

        let parsed: {
          ok: boolean;
          checks: Array<{ name: string; passed: boolean; message: string; required: boolean }>;
          providers: Array<{ name: string; available: boolean }>;
          honestSummary: { summaryLine: string };
        };
        expect(() => { parsed = JSON.parse(result.stdout); }, `stdout was not valid JSON:\n${result.stdout}`).not.toThrow();
        parsed = JSON.parse(result.stdout);

        expect(typeof parsed.ok).toBe('boolean');
        expect(Array.isArray(parsed.checks)).toBe(true);
        expect(parsed.checks.length).toBeGreaterThan(0);

        // Deterministic given our fixture: `.deckent/` exists → Workspace check passes.
        const workspaceCheck = parsed.checks.find((c) => c.name === 'Workspace');
        expect(workspaceCheck).toBeDefined();
        expect(workspaceCheck!.passed).toBe(true);

        // Structural guarantee independent of host installs — same contract
        // tests/e2e/provider-smoke.test.ts asserts on detectAvailableProviders().
        expect(parsed.providers).toHaveLength(4);
        const providerNames = parsed.providers.map((p) => p.name).sort();
        expect(providerNames).toEqual(['claude', 'codex', 'gemini', 'ollama']);

        expect(typeof parsed.honestSummary.summaryLine).toBe('string');
        expect(parsed.honestSummary.summaryLine.length).toBeGreaterThan(0);
      },
      30_000,
    );
  },
);

// ─── Explicit skip notice when dist is absent ─────────────────────────────────
// describe.skipIf suppresses the block entirely; this gives a visible test row
// in the report so CI reviewers understand the skip reason rather than seeing
// 0 tests from this file (same convention as kpi-surface-smoke.test.ts).

if (DIST_ABSENT) {
  describe('CLI smoke — real-binary e2e [dist absent]', () => {
    it.skip(
      `SKIP: ${ENTRY} not found — run \`npm run build\` first`,
      () => { /* intentionally skipped */ },
    );
  });
}

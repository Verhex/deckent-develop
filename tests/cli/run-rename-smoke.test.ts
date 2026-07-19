// tests/cli/run-rename-smoke.test.ts — Task 449-008 (Entegrasyon doğrulaması)
//
// Integration proof for the sprint→run terminology rename (449-005/006/007) on the
// two CLI surfaces those tasks touched: `deckent status` and `deckent history`. This
// spawns the BUILT dist/cli/entry.js asynchronously (never spawnSync — ADR-D-002)
// inside hermetic tmpdir projects and asserts on the actual stdout the real binary
// produces — mirrors the established idiom in tests/e2e/cli-smoke.e2e.test.ts and
// tests/cli/status-json-contract.integration.test.ts.
//
// Honesty note (read before editing assertions): a full-repo real-binary run BEFORE
// writing this file found the rename is real but NOT total —
//   - `history`'s table header literally changes 'Sprint' → 'Run'
//     (src/cli/commands/history.ts:304), but dist/cli/commands/history.js currently
//     PREDATES that source change (dist built 2026-07-18T15:29Z; history.ts last
//     touched 2026-07-18T16:33Z by 449-005) — a build-artifact timing gap, not a
//     source or test defect. Workers may never run `npm run build` mid-sprint
//     (WORKER-GUIDE.md Forbidden Anti-Patterns), so this can only be fixed by a
//     host-side rebuild. The header assertion below is gated on a direct mtime
//     comparison (the same class of guard this codebase already uses for
//     DIST_ABSENT) so it enforces for real the moment dist/ catches up, instead of
//     silently asserting stale/wrong text.
//   - `status` has TWO pre-existing, intentionally-unbridged bare "sprint" surfaces
//     (the no-active-run message, and the live-ACTIVE-dashboard header). Both are
//     documented exceptions from an earlier task
//     (tests/cli/run-language-surface.test.ts, 378-002 RUN-SURFACE-TEXT), kept
//     verbatim because two OTHER out-of-write-scope suites hard-assert the exact
//     legacy pattern: tests/cli/commands/i18n-integration.test.ts:139-140 asserts
//     "No active sprint" verbatim, and tests/cli/helpers/human-status.test.ts:150-152
//     asserts a bare "Sprint <N>" header verbatim (e.g. "Sprint 040" — the number is
//     fixture-specific, the bare-"Sprint"-no-"Run"-bridge shape is the hard-asserted
//     part). They are NOT a 449-008 regression — this file asserts the real current
//     text and names the owning suites, rather than overclaiming "sprint only ever
//     appears as an alias".

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

// ─── Paths ──────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..', '..');
const ENTRY = resolve(REPO_ROOT, 'dist', 'cli', 'entry.js');

const DIST_ABSENT = !existsSync(ENTRY);

/** True when the compiled output for a source file is older than the source itself. */
function isDistStale(srcRelPath: string, distRelPath: string): boolean {
  const srcPath = join(REPO_ROOT, srcRelPath);
  const distPath = join(REPO_ROOT, distRelPath);
  if (!existsSync(srcPath) || !existsSync(distPath)) return true;
  return statSync(distPath).mtimeMs < statSync(srcPath).mtimeMs;
}

const HISTORY_HEADER_STALE = isDistStale(
  'src/cli/commands/history.ts',
  'dist/cli/commands/history.js',
);

// ─── Async CLI spawn helper (no spawnSync — ADR-D-002) ─────────────────────

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
    const child = spawn(process.execPath, [ENTRY, ...args], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });
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

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeBareProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-run-rename-smoke-'));
  mkdirSync(join(root, '.deckent'), { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  mkdirSync(join(root, '.locks'), { recursive: true });
  mkdirSync(join(root, '.brain'), { recursive: true });
  return root;
}

/** A project with one legacy-named `sprint-001.md` run-log — history's on-disk alias contract. */
function makeHistoryProject(): string {
  const root = makeBareProject();
  const sprintsDir = join(root, '.brain', 'sprints');
  mkdirSync(sprintsDir, { recursive: true });
  writeFileSync(
    join(sprintsDir, 'sprint-001.md'),
    [
      '# sprint-001',
      '',
      '## Metrics',
      '| Metric | Value |',
      '|---|---|',
      '| Total Tasks | 3 |',
      '| Completed | 3 |',
      '| Tech Debt | 0 |',
      '| No-Go | 0 |',
      '| Coverage | 90% |',
      '| Duration | 5000ms |',
      '',
    ].join('\n'),
  );
  return root;
}

/** A COMPLETE-phase dashboard + a task file (bypasses the W0-TRUTH orphan-gate). */
function makeCompletedRunProject(): string {
  const root = makeBareProject();
  writeFileSync(
    join(root, '.dashboard'),
    JSON.stringify({
      sprint: { id: 'sprint-375', number: 375, phase: 'COMPLETE', status: 'COMPLETE' },
      agents: [],
      progress: { done: 8, active: 0, blocked: 0, total: 8 },
      alerts: [],
      updatedAt: new Date().toISOString(),
    }),
  );
  writeFileSync(
    join(root, '.tasks', 'task-001.json'),
    JSON.stringify({
      id: '001', title: 'sample', status: 'DONE', sprintId: 'sprint-375',
      dependencies: [], model: 'sonnet', effort: 'normal',
    }),
  );
  return root;
}

/** A live ACTIVE (non-COMPLETE) dashboard — no orphan-gate concerns (fresh updatedAt). */
function makeActiveRunProject(): string {
  const root = makeBareProject();
  writeFileSync(
    join(root, '.dashboard'),
    JSON.stringify({
      sprint: { id: 'sprint-999', number: 999, phase: 'EXECUTE', status: 'ACTIVE' },
      agents: [],
      progress: { done: 1, active: 1, blocked: 0, total: 2 },
      alerts: [],
      updatedAt: new Date().toISOString(),
    }),
  );
  return root;
}

// ─── Suite ──────────────────────────────────────────────────────────────────

describe.skipIf(DIST_ABSENT)(
  `run-rename smoke — real-binary status/history (449-008)${DIST_ABSENT ? ' [SKIP: dist not built]' : ''}`,
  () => {
    let track: Set<ChildProcess>;
    let sandboxHome: string;
    let env: NodeJS.ProcessEnv;
    const projects: string[] = [];

    beforeEach(() => {
      track = new Set();
      sandboxHome = mkdtempSync(join(tmpdir(), 'deckent-run-rename-smoke-home-'));
      env = { ...process.env, HOME: sandboxHome };
    });

    afterEach(() => {
      reapSurvivors(track);
      rmSync(sandboxHome, { recursive: true, force: true });
      while (projects.length > 0) {
        const p = projects.pop();
        if (p) rmSync(p, { recursive: true, force: true });
      }
    });

    function project(builder: () => string): string {
      const root = builder();
      projects.push(root);
      return root;
    }

    // ── history ────────────────────────────────────────────────────────────

    describe('deckent history', () => {
      it('no run history: prints "No run history found." and exits 0', async () => {
        const root = project(makeBareProject);
        const result = await runCli(['history'], root, env, 15_000, track);

        expect(result.exitCode, `stderr:\n${result.stderr}`).toBe(0);
        expect(result.stdout).toContain('No run history found.');
      }, 20_000);

      it('legacy "sprint-NNN.md" file is still recognized and parsed into a row (sprint-alias-compat)', async () => {
        const root = project(makeHistoryProject);
        const result = await runCli(['history'], root, env, 15_000, track);

        expect(result.exitCode, `stderr:\n${result.stderr}`).toBe(0);
        // The on-disk filename convention (isSprintMd = f.startsWith('sprint-')) is
        // unchanged — the row's id column and parsed metrics prove the legacy alias
        // still round-trips correctly, independent of the header-text rename below.
        expect(result.stdout).toContain('sprint-001');
        expect(result.stdout).toContain('90%');
        expect(result.stdout).toContain('100%'); // success rate: 3/3 completed
      }, 20_000);

      it.skipIf(HISTORY_HEADER_STALE)(
        'table header\'s id column reads "Run", not "Sprint" (src/cli/commands/history.ts:304)',
        async () => {
          const root = project(makeHistoryProject);
          const result = await runCli(['history'], root, env, 15_000, track);

          expect(result.exitCode, `stderr:\n${result.stderr}`).toBe(0);
          const headerLine = result.stdout.split('\n')[0] ?? '';
          expect(headerLine).toContain('Run');
          expect(headerLine).not.toMatch(/\bSprint\b/);
        },
        20_000,
      );

      if (HISTORY_HEADER_STALE) {
        it.skip(
          'SKIP: dist/cli/commands/history.js predates src/cli/commands/history.ts:304 ' +
          '("Sprint" → "Run" header rename) — needs a host-side `npm run build` ' +
          '(workers may not run it mid-sprint; see WORKER-GUIDE.md)',
          () => { /* intentionally skipped — see file header comment */ },
        );
      }
    });

    // ── status ─────────────────────────────────────────────────────────────

    describe('deckent status', () => {
      it('a COMPLETE run renders "Run N (sprint) — completed" — sprint appears only as a parenthetical alias', async () => {
        const root = project(makeCompletedRunProject);
        const result = await runCli(['status'], root, env, 15_000, track);

        expect(result.exitCode, `stderr:\n${result.stderr}`).toBe(0);
        expect(result.stdout).toContain('Run 375 (sprint) — completed');
      }, 20_000);

      it('--json on the same COMPLETE run round-trips the internal sprint.id alias unchanged', async () => {
        const root = project(makeCompletedRunProject);
        const result = await runCli(['status', '--json'], root, env, 15_000, track);

        expect(result.exitCode, `stderr:\n${result.stderr}`).toBe(0);
        const parsed = JSON.parse(result.stdout) as { sprint: { id: string; number: number } };
        expect(parsed.sprint.id).toBe('sprint-375');
        expect(parsed.sprint.number).toBe(375);
      }, 20_000);

      it(
        'fresh project (no active run): real text is "No active sprint. Run `deckent start` first." — ' +
        'documented pre-existing exception (tests/cli/commands/i18n-integration.test.ts hard-asserts ' +
        '"No active sprint" verbatim; not a 449-008 regression)',
        async () => {
          const root = project(makeBareProject);
          const result = await runCli(['status'], root, env, 15_000, track);

          expect(result.exitCode, `stderr:\n${result.stderr}`).toBe(0);
          expect(result.stdout).toContain('No active sprint');
          expect(result.stdout).toContain('Run `deckent start`');
        },
        20_000,
      );

      it(
        'a live ACTIVE run header is real, current, bare "Sprint 999" — documented pre-existing ' +
        'exception (tests/cli/helpers/human-status.test.ts:150-152 hard-asserts a bare "Sprint <N>" ' +
        'header verbatim, e.g. "Sprint 040"; not a 449-008 regression)',
        async () => {
          const root = project(makeActiveRunProject);
          const result = await runCli(['status'], root, env, 15_000, track);

          expect(result.exitCode, `stderr:\n${result.stderr}`).toBe(0);
          expect(result.stdout).toContain('Sprint 999');
        },
        20_000,
      );
    });
  },
);

if (DIST_ABSENT) {
  describe('run-rename smoke — real-binary [dist absent]', () => {
    it.skip(
      `SKIP: ${ENTRY} not found — run \`npm run build\` first`,
      () => { /* intentionally skipped */ },
    );
  });
}

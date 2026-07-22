// ═══ TERM-slice (452-002/003/004) — real-binary integration proof (452-005) ═
//
// Task 452-005's own integration/verify slice for the TERM-treni "hybrid
// RunProposal" work (docs/MASTER-PLAN.md row 544): 452-002 wired `/do` into
// the shared RunFlow chain, 452-003 unified do.ts's scope-gate rendering onto
// plan-preview-card.tsx's shared `formatScopeGateLines`, and 452-004 closed a
// NEW born-677-class embedding point in run-proposal-compiler.ts
// (`intent.goal`). All three are covered by unit tests already — this file's
// job is the ONE THING unit tests cannot prove: that the BUILT binary
// (`dist/cli/entry.js`), spawned as a real, separate OS process, actually
// renders a plan preview (including the scope-gate verdict lines 452-003
// unified) for a semicolon-carrying goal without hard-erroring, end to end.
//
// Hermetic without a live LLM: `deckent do`'s RunFlow-v2 path always spawns a
// real provider CLI subprocess for planning (run-proposal-compiler.ts's
// `defaultRunProposalPlanner` -> orchestra/planner.ts's `callZeroConfigPlanner`
// -> `spawn(command, args)`, no env override -> inherits the deckent process's
// own `process.env`). That spawn resolves the literal binary name `claude`
// via PATH. This test PREPENDS a tmp bin dir holding a fake, deterministic
// `claude` script to PATH before spawning the built binary — no network, no
// credentials, no vi.mock (impossible across a real spawned child process
// anyway), just a hermetic stand-in for the one boundary that would otherwise
// require a live AI/provider bootstrap (mirrors tests/cli/do-real-plan.test.ts's
// own framing: "only the boundary that would otherwise require a real AI/
// provider bootstrap is faked; every other real module runs together in one
// continuous trajectory" — this file does the same thing one process further
// out, at the actual subprocess boundary instead of a vi.mock).
//
// Scope-gate FAIL is made deterministic (not a hopeful assertion on live-LLM
// output) by seeding the fixture's git-tracked tree with two files sharing the
// SAME basename in different directories (mirrors tests/cli/
// run-flow-scope-mirror.test.ts's AMBIGUOUS_TRACKED fixture) and having the
// fake planner declare a write to a THIRD, untracked path with that same
// basename — core/scope-gate.ts's evaluateScopeGate has exactly one path for
// that shape: 2+ same-basename tracked candidates, unresolved, BLOCKS.
//
// Async spawn only (ADR-D-002) — every subprocess this file starts (git, and
// the deckent binary itself) uses node:child_process `spawn`, never
// `spawnSync`.
//
// Dist-staleness guard: if dist/ predates the 452-002/003/004 source changes
// (a real, currently-true condition — see .analysis/term-slice-541-544-proof.md
// §"dist/ staleness"), running the real binary would silently exercise the OLD
// code and prove nothing about THIS sprint's changes. Mirrors tests/e2e/
// cli-smoke.e2e.test.ts's `MESSAGES_STALE` convention exactly: the real-binary
// assertion self-skips with a named, visible reason instead of a false-positive
// pass or a hard failure.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, chmodSync, existsSync, statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { getMessage } from '../../src/cli/helpers/messages.js';

// ─── Paths ──────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..', '..');
const ENTRY = resolve(REPO_ROOT, 'dist', 'cli', 'entry.js');

const DIST_ABSENT = !existsSync(ENTRY);

/** True when a compiled dist file is older than its source (build gap). */
function isDistStale(srcRelPath: string, distRelPath: string): boolean {
  const srcPath = join(REPO_ROOT, srcRelPath);
  const distPath = join(REPO_ROOT, distRelPath);
  if (!existsSync(srcPath) || !existsSync(distPath)) return true;
  return statSync(distPath).mtimeMs < statSync(srcPath).mtimeMs;
}

/** The src/dist pairs whose CURRENT src content is what this integration proof
 *  is actually about (452-002/003/004's touched files + the shared card they
 *  route through) — any one stale means the built binary predates the change
 *  under test. */
const INTEGRATION_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['src/cli/commands/do.ts', 'dist/cli/commands/do.js'],
  ['src/orchestra/run-proposal-compiler.ts', 'dist/orchestra/run-proposal-compiler.js'],
  ['src/cli/repl/plan-preview-card.tsx', 'dist/cli/repl/plan-preview-card.js'],
  ['src/cli/helpers/messages.ts', 'dist/cli/helpers/messages.js'],
  ['src/cli/repl/run-flow-controller.ts', 'dist/cli/repl/run-flow-controller.js'],
];
const STALE_PAIRS = INTEGRATION_PAIRS.filter(([s, d]) => isDistStale(s, d));
const DIST_STALE = STALE_PAIRS.length > 0;

// ─── Async subprocess helpers (no spawnSync anywhere in this file — ADR-D-002) ─

interface CliResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

function runAsync(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
  track: Set<ChildProcess>,
): Promise<CliResult> {
  return new Promise((resolveP, rejectP) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs });
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

function runCli(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
  track: Set<ChildProcess>,
): Promise<CliResult> {
  return runAsync(process.execPath, ['--enable-source-maps', ENTRY, ...args], cwd, env, timeoutMs, track);
}

async function git(args: string[], cwd: string, track: Set<ChildProcess>): Promise<void> {
  const result = await runAsync('git', args, cwd, { ...process.env }, 15_000, track);
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed (exit ${result.exitCode}): ${result.stderr}`);
  }
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

// ─── Fixture: a fresh git-tracked project with an ambiguous write-suspect ──

const GOAL = 'refactor auth; add tests';
const FAKE_PROMPT_LOG = 'fake-claude-last-prompt.txt';

/** Two tracked files sharing the basename `worker.ts` in different directories
 *  (the tests/cli/run-flow-scope-mirror.test.ts AMBIGUOUS_TRACKED convention)
 *  plus RunFlow-v2 turned on — everything evaluateScopeGate needs to produce a
 *  real, deterministic FAIL once the fake planner declares a write to a third,
 *  untracked `worker.ts` path. */
async function makeFixtureProject(track: Set<ChildProcess>): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), 'deckent-term-slice-e2e-'));
  mkdirSync(join(root, '.deckent'), { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  mkdirSync(join(root, '.locks'), { recursive: true });
  mkdirSync(join(root, '.brain'), { recursive: true });
  mkdirSync(join(root, 'src', 'agents'), { recursive: true });
  mkdirSync(join(root, 'src', 'nervous'), { recursive: true });
  writeFileSync(join(root, 'src', 'agents', 'worker.ts'), 'export const worker = 1;\n');
  writeFileSync(join(root, 'src', 'nervous', 'worker.ts'), 'export const worker = 2;\n');

  await git(['init', '-q'], root, track);
  await git(['add', '-A'], root, track);
  await git(['-c', 'user.email=e2e@deckent.test', '-c', 'user.name=deckent-e2e', 'commit', '-q', '-m', 'init'], root, track);

  writeFileSync(join(root, '.deckent', 'config.json'), JSON.stringify({ terminal: { run_flow_v2: true } }, null, 2));
  return root;
}

/** A deterministic, canned `claude` CLI stand-in. Responds to `--version`
 *  (bootstrapProviders' detection probe) and to a `-p <prompt> ...` planner
 *  call (the one real-AI boundary this test fakes) with a single-task plan
 *  that writes to an ambiguous `worker.ts` path — logs the received prompt
 *  verbatim to `FAKE_PROMPT_LOG` so the test can assert the semicolon-bearing
 *  goal reached the real planner subprocess byte-for-byte, not just "did not crash". */
function makeFakeClaudeBin(fixtureRoot: string): string {
  const binDir = mkdtempSync(join(tmpdir(), 'deckent-term-slice-fakebin-'));
  const script = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const pIdx = args.indexOf('-p');
if (pIdx === -1) {
  process.stdout.write('1.0.0 (fake-claude, deckent 452-005 e2e fixture)\\n');
  process.exit(0);
}
const prompt = args[pIdx + 1] ?? '';
// APPEND, never overwrite (dogfood-452 CC-fix): 'deckent do' makes TWO LLM
// calls — the zero-config PLANNER (its prompt carries the goal verbatim) and
// the routing CONTENT-classifier (deliberately prose-blind — the goal never
// appears in it). An overwriting log kept only the LAST (content) prompt, so
// the born-677 "goal reached the planner byte-for-byte" assertion read the
// wrong call and failed. Accumulating every prompt makes the check honest.
fs.appendFileSync(${JSON.stringify(join(fixtureRoot, '.deckent', FAKE_PROMPT_LOG))}, prompt + '\\n\\u0000----\\n', 'utf-8');
const plan = {
  tasks: [{
    title: 'Refactor the worker module',
    description: 'Refactor auth in the worker module and add tests for it.',
    model: 'claude-sonnet-5', effort: 'normal', priority: 'NORMAL',
    reason: 'deckent 452-005 e2e fixture — deterministic canned plan, no live AI call',
    scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/worker.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'The worker module refactor works.', noGoCriteria: 'It breaks.', techDebtAcceptable: '' },
  }],
  reasoning: 'deckent 452-005 e2e fixture — single canned task',
};
process.stdout.write(JSON.stringify({ type: 'result', result: JSON.stringify(plan) }));
process.exit(0);
`;
  const claudePath = join(binDir, 'claude');
  writeFileSync(claudePath, script, 'utf-8');
  chmodSync(claudePath, 0o755);
  return binDir;
}

// ─── Suite ──────────────────────────────────────────────────────────────────

describe.skipIf(DIST_ABSENT)(
  `TERM-slice (452-002/003/004) — real-binary dry-run proof${DIST_ABSENT ? ' [SKIP: dist not built]' : ''}`,
  () => {
    let fixtureRoot: string;
    let fakeBinDir: string;
    let sandboxHome: string;
    let track: Set<ChildProcess>;
    let env: NodeJS.ProcessEnv;

    beforeEach(async () => {
      track = new Set();
      fixtureRoot = await makeFixtureProject(track);
      fakeBinDir = makeFakeClaudeBin(fixtureRoot);
      sandboxHome = mkdtempSync(join(tmpdir(), 'deckent-term-slice-home-'));
      env = {
        ...process.env,
        HOME: sandboxHome,
        PATH: `${fakeBinDir}${process.platform === 'win32' ? ';' : ':'}${process.env['PATH'] ?? ''}`,
      };
    });

    afterEach(() => {
      reapSurvivors(track);
      rmSync(fixtureRoot, { recursive: true, force: true });
      rmSync(fakeBinDir, { recursive: true, force: true });
      rmSync(sandboxHome, { recursive: true, force: true });
    });

    it.skipIf(DIST_STALE)(
      '`deckent do "<semicolon goal>"` (dry-run) renders a real plan preview on real stdout, including the scope-gate FAIL verdict lines, and never hard-errors',
      async () => {
        const result = await runCli(['do', GOAL], fixtureRoot, env, 30_000, track);

        expect(result.exitCode, `do exited abnormally — stderr:\n${result.stderr}\nstdout:\n${result.stdout}`).toBe(0);

        // ── the semicolon-bearing goal reached the REAL (unmocked) compileRunProposal
        // -> defaultRunProposalPlanner -> callZeroConfigPlanner chain and was handed to
        // the planner subprocess byte-for-byte (born-677-class proof, at the actual
        // subprocess boundary) ──
        const promptLogPath = join(fixtureRoot, '.deckent', FAKE_PROMPT_LOG);
        expect(existsSync(promptLogPath), 'fake claude was never invoked with -p — planner boundary was not reached').toBe(true);
        expect(readFileSync(promptLogPath, 'utf-8')).toContain(GOAL);

        // ── a rendered plan preview on REAL stdout (not a mock) ──
        expect(result.stdout).toContain(getMessage('do.preview_banner_dry_run', 'en', { count: '1' }));
        expect(result.stdout).toContain(getMessage('runFlow.planPreview.heading', 'en'));
        expect(result.stdout).toContain('Refactor the worker module');
        expect(result.stdout).toContain(getMessage('runFlow.planPreview.gate.pass', 'en'));
        expect(result.stdout).toContain(getMessage('runFlow.planPreview.policy.allow', 'en'));
        expect(result.stdout).toContain(getMessage('runFlow.planPreview.digestLabel', 'en'));
        expect(result.stdout).toContain(getMessage('do.dry_run_complete', 'en'));

        // ── the fixture's ambiguous worker.ts write is a real, deterministic
        // scope-gate FAIL — 452-003's unified formatScopeGateLines rendering ──
        expect(result.stdout).toContain(getMessage('runFlow.planPreview.scopeGate.fail', 'en'));
        expect(result.stdout).toContain('  ! ');
        expect(result.stdout).toContain('src/orchestra/worker.ts');
        expect(result.stdout).toMatch(/src\/agents\/worker\.ts|src\/nervous\/worker\.ts/);
      },
      35_000,
    );

    if (DIST_STALE) {
      it.skip(
        `SKIP: dist/ predates ${STALE_PAIRS.length} source file(s) this integration proof covers ` +
        `(${STALE_PAIRS.map(([s]) => s).join(', ')}) — needs a host-side \`npm run build\` ` +
        '(workers may not run it mid-sprint; see .deckent/workspace/WORKER-GUIDE.md and CLAUDE.md operating_rules)',
        () => { /* intentionally skipped — see file header comment */ },
      );
    }
  },
);

if (DIST_ABSENT) {
  describe('TERM-slice (452-002/003/004) — real-binary dry-run proof [dist absent]', () => {
    it.skip(
      `SKIP: ${ENTRY} not found — run \`npm run build\` first`,
      () => { /* intentionally skipped */ },
    );
  });
}

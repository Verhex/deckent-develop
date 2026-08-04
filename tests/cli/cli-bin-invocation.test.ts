/**
 * CLI bin-entry invocation tests (Sprint 221 Task 221-013)
 *
 * Verifies that the bin-entry routes argv correctly:
 *   - argümansız (no args) → default REPL branch
 *   - `help` arg          → commander (Usage: printed)
 *   - `serve` arg         → commander (NOT REPL)
 *   - unknown arg         → commander unknown-command error
 *   - `--version` arg     → version output (NOT REPL)
 *
 * Combines pure-function tests on `shouldLaunchDefaultRepl` (zero side-effect)
 * with async-spawn smoke tests against the compiled `dist/cli/entry.js`
 * binary. The async spawn (NEVER spawnSync) satisfies the project's
 * CUSTOM Hermeticity rule, and the spawn tests skip cleanly when dist/ is
 * absent so a fresh checkout still passes the suite.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../../');
const ENTRY_BIN = join(PROJECT_ROOT, 'dist/cli/entry.js');
const HAS_DIST = existsSync(ENTRY_BIN);

// ─── Hoisted mocks so importing entry.ts has no top-level side-effects ──

const hoisted = vi.hoisted(() => ({
  parseAsyncMock: vi.fn(async () => undefined),
  hookMock: vi.fn(),
  buildProgramMock: vi.fn(),
  bootstrapMock: vi.fn(async () => undefined),
  handleCliErrorMock: vi.fn(),
  interruptActiveSprintMock: vi.fn(),
  killAllSessionsMock: vi.fn(),
}));

hoisted.buildProgramMock.mockImplementation(() => {
  const fake = { hook: hoisted.hookMock, parseAsync: hoisted.parseAsyncMock };
  hoisted.hookMock.mockReturnValue(fake);
  return fake;
});

vi.mock('../../src/cli/index.js', () => ({ buildProgram: hoisted.buildProgramMock }));
vi.mock('../../src/cli/helpers/process.js', () => ({ handleCliError: hoisted.handleCliErrorMock }));
vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  interruptActiveSprint: hoisted.interruptActiveSprintMock,
}));
vi.mock('../../src/orchestra/tmux.js', () => ({ killAllSessions: hoisted.killAllSessionsMock }));
vi.mock('../../src/core/model-catalog.js', () => ({ bootstrapFromCatalog: hoisted.bootstrapMock }));

let shouldLaunchDefaultRepl: (argv: readonly string[]) => boolean;

beforeAll(async () => {
  const mod = await import('../../src/cli/entry.js');
  shouldLaunchDefaultRepl = mod.shouldLaunchDefaultRepl;
});

// ─── Async spawn helper (NEVER spawnSync per Hermeticity rule) ─────────

interface SpawnResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

async function spawnEntry(
  args: readonly string[],
  timeoutMs = 8000,
  cwd?: string,
): Promise<SpawnResult> {
  return await new Promise<SpawnResult>((resolveResult, rejectResult) => {
    const child = spawn(process.execPath, [ENTRY_BIN, ...args], {
      // Inherit a clean env; the subscription-only paths gate on API-key
      // vars but `help`/`--version`/`unknown` don't need them at all.
      env: { ...process.env, DECKENT_OFFLINE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      ...(cwd ? { cwd } : {}),
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b: Buffer) => { stdout += b.toString('utf-8'); });
    child.stderr.on('data', (b: Buffer) => { stderr += b.toString('utf-8'); });
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      rejectResult(new Error(`spawn timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    child.on('error', (err) => { clearTimeout(timer); rejectResult(err); });
    child.on('close', (code) => { clearTimeout(timer); resolveResult({ code, stdout, stderr }); });
  });
}

// ─── Pure-function tests (no spawn, always run) ──────────────────────────

describe('cli bin invocation — pure routing', () => {
  it('argümansız (no args) routes to the default REPL branch', () => {
    expect(shouldLaunchDefaultRepl(['node', 'deckent'])).toBe(true);
  });

  it('`help` arg routes to commander (NOT default REPL)', () => {
    expect(shouldLaunchDefaultRepl(['node', 'deckent', 'help'])).toBe(false);
  });

  it('`serve` arg routes to commander (NOT default REPL)', () => {
    expect(shouldLaunchDefaultRepl(['node', 'deckent', 'serve'])).toBe(false);
  });

  it('unknown subcommand routes to commander so it can show its error', () => {
    expect(shouldLaunchDefaultRepl(['node', 'deckent', 'no-such-cmd'])).toBe(false);
  });

  it('`--help` / `-h` short-circuit the REPL (help UX preserved)', () => {
    expect(shouldLaunchDefaultRepl(['node', 'deckent', '--help'])).toBe(false);
    expect(shouldLaunchDefaultRepl(['node', 'deckent', '-h'])).toBe(false);
  });

  it('`--version` short-circuits the REPL (version UX preserved)', () => {
    expect(shouldLaunchDefaultRepl(['node', 'deckent', '--version'])).toBe(false);
  });
});

// ─── Async-spawn smoke tests against compiled dist binary ───────────────
//
// These tests actually invoke `node dist/cli/entry.js <arg>` to verify the
// bin entry produces real output (the regression Alperen reported was
// "SESSİZ çıktı yok" — silent stdout). They use async spawn (never
// spawnSync) per CUSTOM Hermeticity rule. When dist/ is absent (fresh
// checkout / CI pre-build) the suite skips gracefully.

describe.skipIf(!HAS_DIST)('cli bin invocation — async spawn smoke', () => {
  it('`node dist/cli/entry.js help` prints commander Usage line (NOT silent)', async () => {
    const r = await spawnEntry(['help']);
    expect(r.stdout + r.stderr).toMatch(/Usage:\s*deckent/);
  });

  it('`node dist/cli/entry.js --version` prints a version string (NOT silent)', async () => {
    const r = await spawnEntry(['--version']);
    expect(r.stdout + r.stderr).toMatch(/\d+\.\d+\.\d+/);
  });

  it('`node dist/cli/entry.js unknowncommandfoo` prints commander unknown-command error', async () => {
    // A non-diagnostic invocation from the deckent checkout itself is gated by
    // the worktree binary-identity authority (src/cli/worktree-binary-authority.ts):
    // whenever dist/ drifts from src/ (normal mid-branch state) it HOLDs with
    // DECKENT_BINARY_IDENTITY_HOLD before commander ever runs. The routing
    // contract under test ("unknown arg → commander error") is cwd-independent,
    // so prove it from a hermetic non-checkout user cwd instead of the repo.
    // The empty src/ dir is required: without it the identity resolver's eager
    // buildSourceTreeIdentity(projectRoot) throws an uncaught
    // E_BUILD_SOURCE_TREE_MISSING (known production truth, reported upstream
    // as a typed blocker — not fixed here).
    const userCwd = mkdtempSync(join(tmpdir(), 'deckent-bin-invocation-'));
    mkdirSync(join(userCwd, 'src'), { recursive: true });
    try {
      const r = await spawnEntry(['unknowncommandfoo'], 8000, userCwd);
      expect((r.stderr + r.stdout).toLowerCase()).toContain('unknown command');
    } finally {
      rmSync(userCwd, { recursive: true, force: true });
    }
  });
});

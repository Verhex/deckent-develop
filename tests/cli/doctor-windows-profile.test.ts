// born-203 (ONB-2) — "rich doctor: Windows-native profil + auth-state probe"
// (the remainder of 368-002/369-002). Closes two disk-verified gaps:
//
// 1. `deckent doctor --fix` never disclosed platform-adapted behavior at all (the
//    general Platform Profile section — buildPlatformProfileReport/
//    formatPlatformProfileLines — was only ever shown on the plain `doctor` human
//    path). Worse, planDoctorFixes()'s `.deck-shadow` chmod repair compared
//    `statSync(...).mode` against a POSIX octal constant — meaningless on win32,
//    where Node synthesizes `mode` from the read-only attribute only and
//    `chmodSync` cannot express real owner-only semantics. That is either a
//    permanent false positive or a silent no-op "fix" — a Law #2 violation
//    (never let an unsupported platform succeed silently).
// 2. buildAuthStateReport's config-based auth check was a bare 3-state verdict
//    (connected/missing/unknown) with no cross-reference against the REAL PSL-6
//    session probe already computed in the same CLI action.
//
// Hermetic: mocks node:fs / node:child_process / node:os (same pattern as
// tests/cli/doctor-platform-auth.test.ts and tests/cli/doctor-profile.test.ts) — no
// real disk I/O, no real subprocess, no real credentials.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  chmodSync: vi.fn(),
  unlinkSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 2, mtimeMs: 0 })),
  readdirSync: vi.fn(),
  accessSync: vi.fn(),
  constants: { W_OK: 2 },
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    platform: vi.fn().mockReturnValue('linux'),
  };
});

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/win-profile-root'),
}));

// ─── Static imports (after mocks) ──────────────────────────────────────────

import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { platform } from 'node:os';
import {
  registerDoctor,
  planDoctorFixes,
  getWindowsFixCaveats,
  buildAuthStateReport,
  formatAuthStateLines,
} from '../../src/cli/commands/doctor.js';
import type { AuthProbeResult } from '../../src/core/provider-auth-probe.js';

const ROOT = '/mock/win-profile-root';

function throwFor(path: string): never {
  throw new Error(`ENOENT: no such file — ${path}`);
}

/** existsSync/statSync stub: true only for the paths this suite cares about. */
function setupFsFixture(opts: { deckShadow?: boolean; deckShadowMode?: number } = {}): void {
  const deckShadowExists = opts.deckShadow ?? true;
  vi.mocked(existsSync).mockImplementation((p: unknown) => {
    const s = String(p);
    if (s.endsWith('.deck-shadow')) return deckShadowExists;
    if (s.endsWith('.deckent') || s.endsWith('.tasks')) return true;
    return false;
  });
  vi.mocked(statSync).mockImplementation(
    (() => ({ mode: opts.deckShadowMode ?? 0o644 })) as unknown as typeof statSync,
  );
  vi.mocked(readFileSync).mockImplementation((p: unknown) => throwFor(String(p)));
}

function setupPassingSpawnSync(): void {
  vi.mocked(spawnSync).mockImplementation(
    (() => ({
      status: 0,
      stdout: '1.0.0',
      stderr: '',
      pid: 1,
      output: [],
      signal: null,
    })) as unknown as typeof spawnSync,
  );
}

// ─── stdout capture (mirrors tests/cli/doctor-profile.test.ts) ────────────

let stdoutData: string[];
let stdoutSpy: ReturnType<typeof vi.spyOn>;

function captureOutput(): void {
  stdoutData = [];
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data) => {
    stdoutData.push(String(data));
    return true;
  });
}

function restoreOutput(): void {
  stdoutSpy?.mockRestore();
}

function stdout(): string {
  return stdoutData.join('');
}

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerDoctor(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // commander exitOverride throws on exit — expected
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(platform).mockReturnValue('linux' as NodeJS.Platform);
  setupPassingSpawnSync();
  setupFsFixture();
  captureOutput();
  process.exitCode = undefined;
});

afterEach(() => {
  restoreOutput();
  process.exitCode = undefined;
});

// ─── planDoctorFixes — win32 chmod honesty ─────────────────────────────────

describe('planDoctorFixes — win32 chmod honesty (born-203)', () => {
  it('does NOT plan a chmod action for a stale-mode .deck-shadow on win32 (NTFS has no POSIX bits)', () => {
    setupFsFixture({ deckShadowMode: 0o644 });
    const actions = planDoctorFixes(ROOT, 'win32');
    expect(actions.find(a => a.kind === 'chmod')).toBeUndefined();
  });

  it('still plans the chmod action on POSIX — no regression vs. the pre-existing behavior', () => {
    setupFsFixture({ deckShadowMode: 0o644 });
    const actions = planDoctorFixes(ROOT, 'linux');
    const chmodAction = actions.find(a => a.kind === 'chmod');
    expect(chmodAction).toBeDefined();
    expect(chmodAction?.previousValue).toContain('644');
  });

  it('win32 suppresses chmod even for a very-loose 0o666 mode; darwin (POSIX-like) still proposes it', () => {
    setupFsFixture({ deckShadowMode: 0o666 });
    expect(planDoctorFixes(ROOT, 'win32').find(a => a.kind === 'chmod')).toBeUndefined();
    expect(planDoctorFixes(ROOT, 'darwin').find(a => a.kind === 'chmod')).toBeDefined();
  });

  it('other action kinds (mkdir) are unaffected by the platform override', () => {
    vi.mocked(existsSync).mockReturnValue(false); // nothing present at all
    const winKinds = planDoctorFixes(ROOT, 'win32').map(a => a.kind).sort();
    const posixKinds = planDoctorFixes(ROOT, 'linux').map(a => a.kind).sort();
    expect(winKinds).toEqual(['mkdir', 'mkdir']);
    expect(posixKinds).toEqual(['mkdir', 'mkdir']);
  });

  it('omitting platformOverride falls back to the real (mocked) platform() — win32 still suppresses chmod', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    setupFsFixture({ deckShadowMode: 0o644 });
    expect(planDoctorFixes(ROOT).find(a => a.kind === 'chmod')).toBeUndefined();
  });

  it('does not propose a chmod when .deck-shadow does not exist, on any platform', () => {
    setupFsFixture({ deckShadow: false });
    expect(planDoctorFixes(ROOT, 'win32').find(a => a.kind === 'chmod')).toBeUndefined();
    expect(planDoctorFixes(ROOT, 'linux').find(a => a.kind === 'chmod')).toBeUndefined();
  });
});

// ─── getWindowsFixCaveats ───────────────────────────────────────────────────

describe('getWindowsFixCaveats (born-203)', () => {
  it('win32 + .deck-shadow present → one honest manual item reusing doctor.platform_adapt_permissions (en)', () => {
    setupFsFixture({ deckShadow: true });
    const caveats = getWindowsFixCaveats(ROOT, 'en', 'win32');
    expect(caveats).toHaveLength(1);
    expect(caveats[0]?.name).toContain('.deck-shadow');
    expect(caveats[0]?.message).toContain('NTFS');
  });

  it('win32 + .deck-shadow present → localized Turkish message, distinct from EN', () => {
    setupFsFixture({ deckShadow: true });
    const en = getWindowsFixCaveats(ROOT, 'en', 'win32');
    const tr = getWindowsFixCaveats(ROOT, 'tr', 'win32');
    expect(tr).toHaveLength(1);
    expect(tr[0]?.message).toContain('NTFS');
    expect(tr[0]?.message).not.toBe(en[0]?.message);
  });

  it('win32 + .deck-shadow absent → empty (nothing to caveat)', () => {
    setupFsFixture({ deckShadow: false });
    expect(getWindowsFixCaveats(ROOT, 'en', 'win32')).toEqual([]);
  });

  it('non-win32 → always empty, regardless of .deck-shadow presence', () => {
    setupFsFixture({ deckShadow: true });
    expect(getWindowsFixCaveats(ROOT, 'en', 'linux')).toEqual([]);
    expect(getWindowsFixCaveats(ROOT, 'en', 'darwin')).toEqual([]);
  });

  it('omitting platformOverride falls back to the real (mocked) platform()', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    setupFsFixture({ deckShadow: true });
    expect(getWindowsFixCaveats(ROOT, 'en')).toHaveLength(1);
  });
});

// ─── CLI integration: `deckent doctor --fix` under a simulated profile ─────
// This is the literal goCriteria proof: "simüle Windows-native profilde
// `deckent doctor --fix` → per-check honest-state raporu".

describe('deckent doctor --fix — simulated Windows-native profile (born-203 goCriteria)', () => {
  it('win32: shows the Platform Profile disclosure + an honest .deck-shadow manual caveat, and plans NO chmod action', async () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    setupFsFixture({ deckShadow: true, deckShadowMode: 0o644 });

    await runCommand(['doctor', '--fix']);

    const out = stdout();
    expect(out).toContain('Platform Profile:');
    expect(out).toContain('Windows (native)');
    expect(out).toContain('adaptations');
    expect(out).toContain('.deck-shadow');
    expect(out).toContain('[manual]');
    expect(out).not.toContain('[would fix]');
  });

  it('linux: no Platform Profile section is shown, and the chmod action IS planned as [would fix] — POSIX behavior unchanged', async () => {
    vi.mocked(platform).mockReturnValue('linux' as NodeJS.Platform);
    setupFsFixture({ deckShadow: true, deckShadowMode: 0o644 });

    await runCommand(['doctor', '--fix']);

    const out = stdout();
    expect(out).not.toContain('Platform Profile:');
    expect(out).toContain('[would fix]');
    expect(out).toContain('.deck-shadow');
  });

  it('win32 --json: platformProfile is included, chmod is absent from actions, and the manual caveat is present', async () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    setupFsFixture({ deckShadow: true, deckShadowMode: 0o644 });

    await runCommand(['doctor', '--fix', '--json']);

    const parsed = JSON.parse(stdout()) as {
      actions: Array<{ kind: string }>;
      manual: Array<{ name: string }>;
      platformProfile: { platform: string; adaptedChecks: unknown[] };
    };
    expect(parsed.platformProfile.platform).toBe('win32');
    expect(parsed.platformProfile.adaptedChecks).toHaveLength(3);
    expect(parsed.actions.find(a => a.kind === 'chmod')).toBeUndefined();
    expect(parsed.manual.some(m => m.name.includes('.deck-shadow'))).toBe(true);
  });

  it('linux --json: platformProfile.adaptedChecks is empty — no Windows caveats leak onto POSIX', async () => {
    vi.mocked(platform).mockReturnValue('linux' as NodeJS.Platform);
    setupFsFixture({ deckShadow: true, deckShadowMode: 0o644 });

    await runCommand(['doctor', '--fix', '--json']);

    const parsed = JSON.parse(stdout()) as {
      actions: Array<{ kind: string }>;
      platformProfile: { adaptedChecks: unknown[] };
    };
    expect(parsed.platformProfile.adaptedChecks).toEqual([]);
    expect(parsed.actions.some(a => a.kind === 'chmod')).toBe(true);
  });
});

// ─── buildAuthStateReport — deepened beyond the bare 3-state (born-203) ────

describe('buildAuthStateReport — deepened beyond bare 3-state (born-203)', () => {
  it('omitting authProbes reproduces the exact legacy shape (sessionState/conflict undefined)', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const results = buildAuthStateReport(ROOT, { ANTHROPIC_API_KEY: 'sk-ant-xxx' });
    const claude = results.find(r => r.provider === 'claude');
    expect(claude?.state).toBe('connected');
    expect(claude?.sessionState).toBeUndefined();
    expect(claude?.conflict).toBeUndefined();
  });

  it('populates source="env" when connected via a native SDK env var', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const results = buildAuthStateReport(ROOT, { ANTHROPIC_API_KEY: 'sk-ant-xxx' });
    expect(results.find(r => r.provider === 'claude')?.source).toBe('env');
  });

  it('populates source="deck" when connected via the .deck file only', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      if (String(p).endsWith('.deck')) return 'DECKENT_CLAUDE_API_KEY=sk-ant-from-deck\n';
      return throwFor(String(p));
    });
    const results = buildAuthStateReport(ROOT, {});
    expect(results.find(r => r.provider === 'claude')?.source).toBe('deck');
  });

  it('source is "none" when missing', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const results = buildAuthStateReport(ROOT, {});
    expect(results.find(r => r.provider === 'claude')?.source).toBe('none');
  });

  it('cross-references a supplied authProbes: connected config + logged-out real session → conflict=true', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const probes: Record<string, AuthProbeResult> = { claude: { state: 'logged-out', detail: 'no session' } };
    const results = buildAuthStateReport(ROOT, { ANTHROPIC_API_KEY: 'sk-ant-xxx' }, undefined, probes);
    const claude = results.find(r => r.provider === 'claude');
    expect(claude?.state).toBe('connected');
    expect(claude?.sessionState).toBe('logged-out');
    expect(claude?.conflict).toBe(true);
  });

  it('cross-references a supplied authProbes: missing config + logged-in real session → conflict=true (config missed a working credential)', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const probes: Record<string, AuthProbeResult> = { claude: { state: 'logged-in', detail: 'session credentials present' } };
    const results = buildAuthStateReport(ROOT, {}, undefined, probes);
    const claude = results.find(r => r.provider === 'claude');
    expect(claude?.state).toBe('missing');
    expect(claude?.conflict).toBe(true);
  });

  it('agreeing config + session states → conflict=false (not true, not undefined)', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const probes: Record<string, AuthProbeResult> = { claude: { state: 'logged-in' } };
    const results = buildAuthStateReport(ROOT, { ANTHROPIC_API_KEY: 'sk-ant-xxx' }, undefined, probes);
    expect(results.find(r => r.provider === 'claude')?.conflict).toBe(false);
  });

  it('never invents a conflict verdict when the real probe itself says "unknown" (Law #2 — never guess)', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const probes: Record<string, AuthProbeResult> = { claude: { state: 'unknown', detail: 'timed out' } };
    const results = buildAuthStateReport(ROOT, { ANTHROPIC_API_KEY: 'sk-ant-xxx' }, undefined, probes);
    const claude = results.find(r => r.provider === 'claude');
    expect(claude?.sessionState).toBe('unknown');
    expect(claude?.conflict).toBeUndefined();
  });

  it('an authProbes entry for an unrelated provider does not affect other providers', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const probes: Record<string, AuthProbeResult> = { codex: { state: 'logged-in' } };
    const results = buildAuthStateReport(ROOT, {}, undefined, probes);
    const claude = results.find(r => r.provider === 'claude');
    expect(claude?.sessionState).toBeUndefined();
    expect(claude?.conflict).toBeUndefined();
  });
});

// ─── formatAuthStateLines — provenance + conflict rendering (born-203) ─────

describe('formatAuthStateLines — provenance + conflict rendering (born-203)', () => {
  it('bare fixtures (no source/sessionState/conflict) render byte-identically to the legacy 3-state output', () => {
    const lines = formatAuthStateLines([
      { provider: 'claude', state: 'connected' },
      { provider: 'codex', state: 'missing' },
      { provider: 'gemini', state: 'unknown' },
    ], 'en');
    expect(lines[0]).toBe('Auth State (config-based, no network):');
    expect(lines).toContain('  Claude: connected');
    expect(lines).toContain('  Codex: missing');
    expect(lines).toContain('  Gemini: unknown');
  });

  it('appends a provenance suffix when source is env/deck', () => {
    const lines = formatAuthStateLines([
      { provider: 'claude', state: 'connected', source: 'env' },
      { provider: 'codex', state: 'connected', source: 'deck' },
    ], 'en');
    expect(lines).toContain('  Claude: connected (env)');
    expect(lines).toContain('  Codex: connected (deck)');
  });

  it('omits the provenance suffix when source is "none"', () => {
    const lines = formatAuthStateLines([{ provider: 'claude', state: 'missing', source: 'none' }], 'en');
    expect(lines).toContain('  Claude: missing');
  });

  it('appends a conflict note only when conflict is true', () => {
    const lines = formatAuthStateLines([
      { provider: 'claude', state: 'connected', source: 'env', sessionState: 'logged-out', conflict: true },
    ], 'en');
    expect(lines.some(l => l.toLowerCase().includes('misconfigured'))).toBe(true);
    expect(lines.some(l => l.includes('logged-out'))).toBe(true);
  });

  it('renders no conflict note when conflict is false', () => {
    const lines = formatAuthStateLines([
      { provider: 'claude', state: 'connected', source: 'env', sessionState: 'logged-in', conflict: false },
    ], 'en');
    expect(lines.some(l => l.toLowerCase().includes('misconfigured'))).toBe(false);
  });
});

// Task 369-002 (DOCTOR-FOLLOWUPS) — checkTmux win32-branch honest-label fix +
// 368-002 debt-sweep closure.
//
// Bug fixed: checkTmux's win32 short-circuit branch used to fall through to
// "not required (subprocess backend)" even when NO spawn_backend override was
// configured (or one configured that is neither 'docker' nor 'subprocess',
// e.g. 'tmux'/'auto') — implying a config choice the user never made. The real
// reason in that case is platform incompatibility: tmux does not run natively
// on Windows. This file covers both scenarios (override present / absent) plus
// regression guards for the already-correct docker/subprocess/non-win32 cases,
// and verifies the new optional `lang` param (checkTmux + runDoctorChecks) is
// localized en+tr via messages.ts.
//
// Hermetic: mocks node:os (platform) and node:child_process (spawnSync) — same
// pattern as tests/cli/doctor-backend-aware.test.ts. No real host state read.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  chmodSync: vi.fn(),
  unlinkSync: vi.fn(),
  statSync: vi.fn(),
  accessSync: vi.fn(),
  constants: { W_OK: 2 },
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    platform: vi.fn().mockReturnValue('linux'),
  };
});

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
  spawn: vi.fn(),
  execSync: vi.fn().mockReturnValue(''),
}));

const mockMemoryStore = {
  totalCount: vi.fn().mockReturnValue(50),
  getByType: vi.fn().mockReturnValue([]),
  close: vi.fn(),
};
vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => mockMemoryStore),
}));

vi.mock('../../src/core/deck-file.js', () => ({
  loadDeckSecrets: vi.fn().mockReturnValue({}),
  validateDeckFile: vi.fn().mockReturnValue({ valid: true, warnings: [], errors: [] }),
  isDeckFileCommitted: vi.fn().mockReturnValue(false),
  KNOWN_DECK_KEYS: [
    'DECKENT_CLAUDE_API_KEY', 'DECKENT_OPENAI_API_KEY', 'DECKENT_GOOGLE_API_KEY',
    'DECKENT_SMTP_HOST', 'DECKENT_SMTP_USER', 'DECKENT_SMTP_PASS',
    'DECKENT_WEBHOOK_URL', 'DECKENT_DB_URL', 'DECKENT_TELEMETRY_ID',
  ],
}));

vi.mock('../../src/core/environment.js', () => ({
  detectEnvironment: vi.fn().mockReturnValue('vscode'),
}));

import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { platform } from 'node:os';
import { checkTmux, runDoctorChecks } from '../../src/cli/commands/doctor.js';

function mockSpawnNotFound(): void {
  vi.mocked(spawnSync).mockReturnValue(
    { status: 1, stdout: '', stderr: '', pid: 1, signal: null, output: [] } as ReturnType<typeof spawnSync>,
  );
}

describe('checkTmux — win32 honest-label fix (369-002)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── The bug: win32 WITHOUT an explicit override ────────────────────

  it('win32 + no override → honest platform-incompatibility label, NOT "subprocess backend"', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    const check = checkTmux();
    expect(check.passed).toBe(true);
    expect(check.required).toBe(false);
    expect(check.message).not.toContain('subprocess backend');
    expect(check.message).toMatch(/windows/i);
    expect(check.message).toContain('not required');
  });

  it('win32 + an override that is neither docker nor subprocess (e.g. "tmux") → still the platform label', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    const check = checkTmux(undefined, 'tmux');
    expect(check.message).not.toContain('subprocess backend');
    expect(check.message).toMatch(/windows/i);
  });

  it('win32 + "auto" override → still the platform label (no fake config-preference reason)', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    const check = checkTmux(undefined, 'auto');
    expect(check.message).not.toContain('subprocess backend');
    expect(check.message).toMatch(/windows/i);
  });

  // ─── The correct cases: win32 WITH an explicit override ─────────────

  it('win32 + spawnBackend="subprocess" → honest config-preference label', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    const check = checkTmux(undefined, 'subprocess');
    expect(check.passed).toBe(true);
    expect(check.required).toBe(false);
    expect(check.message).toContain('subprocess backend');
  });

  it('win32 + spawnBackend="docker" → honest config-preference label', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    const check = checkTmux(undefined, 'docker');
    expect(check.passed).toBe(true);
    expect(check.required).toBe(false);
    expect(check.message).toContain('docker backend');
  });

  // ─── Regression guard: non-win32 platforms unaffected ───────────────

  it('linux + spawnBackend="docker" → unaffected, still "docker backend"', () => {
    vi.mocked(platform).mockReturnValue('linux' as NodeJS.Platform);
    const check = checkTmux(undefined, 'docker');
    expect(check.message).toContain('docker backend');
  });

  it('linux + spawnBackend="subprocess" → unaffected, still "subprocess backend"', () => {
    vi.mocked(platform).mockReturnValue('linux' as NodeJS.Platform);
    const check = checkTmux(undefined, 'subprocess');
    expect(check.message).toContain('subprocess backend');
  });

  it('linux + no override + tmux missing → unaffected required-provider logic', () => {
    vi.mocked(platform).mockReturnValue('linux' as NodeJS.Platform);
    mockSpawnNotFound();
    const check = checkTmux(['claude']);
    expect(check.required).toBe(true);
    expect(check.passed).toBe(false);
  });

  // ─── i18n: en+tr localization of the new reason labels ──────────────

  it('win32 + no override, lang=tr → localized Turkish platform label', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    const en = checkTmux(undefined, undefined, 'en');
    const tr = checkTmux(undefined, undefined, 'tr');
    expect(tr.message).not.toBe(en.message);
    expect(tr.message).toMatch(/windows/i);
    expect(tr.message).toContain('gerekli değil');
  });

  it('win32 + docker, lang=tr → localized Turkish docker-backend label', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    const tr = checkTmux(undefined, 'docker', 'tr');
    expect(tr.message).toContain('docker backend');
    expect(tr.message).toContain('gerekli değil');
  });

  it('win32 + subprocess, lang=tr → localized Turkish subprocess-backend label', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    const tr = checkTmux(undefined, 'subprocess', 'tr');
    expect(tr.message).toContain('subprocess backend');
    expect(tr.message).toContain('gerekli değil');
  });

  it('lang omitted → defaults to English (backward-compatible for existing callers)', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    const noLangArg = checkTmux(undefined, 'docker');
    const explicitEn = checkTmux(undefined, 'docker', 'en');
    expect(noLangArg.message).toBe(explicitEn.message);
  });
});

describe('runDoctorChecks — lang threads through to the tmux entry (369-002)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readdirSync).mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue('# Content' as unknown as ReturnType<typeof readFileSync>);
  });

  it('win32 + no override + lang=tr → tmux entry uses the honest Turkish platform label', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    mockSpawnNotFound();
    const result = runDoctorChecks('/mock/root', ['claude'], undefined, 'tr');
    const tmuxCheck = result.checks.find(c => c.name === 'tmux');
    expect(tmuxCheck).toBeDefined();
    expect(tmuxCheck!.message).not.toContain('subprocess backend');
    expect(tmuxCheck!.message).toContain('gerekli değil');
  });

  it('win32 + no override + lang omitted → defaults to English, still honest (not "subprocess backend")', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    mockSpawnNotFound();
    const result = runDoctorChecks('/mock/root', ['claude']);
    const tmuxCheck = result.checks.find(c => c.name === 'tmux');
    expect(tmuxCheck!.message).not.toContain('subprocess backend');
    expect(tmuxCheck!.message).toMatch(/windows/i);
  });

  it('win32 + spawnBackend="subprocess" + lang=en → tmux entry correctly labels the config choice', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    mockSpawnNotFound();
    const result = runDoctorChecks('/mock/root', ['claude'], 'subprocess', 'en');
    const tmuxCheck = result.checks.find(c => c.name === 'tmux');
    expect(tmuxCheck!.message).toContain('subprocess backend');
  });
});

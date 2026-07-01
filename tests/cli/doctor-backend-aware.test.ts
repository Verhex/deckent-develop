import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks (same pattern as tests/cli/commands/doctor.test.ts) ────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
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
import { checkPlatform, runDoctorChecks } from '../../src/cli/commands/doctor.js';

function mockSpawnNotFound(): void {
  vi.mocked(spawnSync).mockReturnValue(
    { status: 1, stdout: '', stderr: '', pid: 1, signal: null, output: [] } as ReturnType<typeof spawnSync>,
  );
}

describe('checkPlatform — backend-aware (DOCTOR-1, row 210)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── win32 × backend matrix ─────────────────────────────────────────

  it('win32 + docker backend → PASS, no misdiagnosis (Win+docker fix)', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    const check = checkPlatform('docker');
    expect(check.passed).toBe(true);
    expect(check.required).toBe(false);
    expect(check.message).toMatch(/docker/i);
    expect(check.message).not.toMatch(/UNSUPPORTED/);
  });

  it('win32 + subprocess backend → PASS, honest line', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    const check = checkPlatform('subprocess');
    expect(check.passed).toBe(true);
    expect(check.required).toBe(false);
    expect(check.message).toMatch(/subprocess/i);
    expect(check.message).not.toMatch(/UNSUPPORTED/);
  });

  it('win32 + no configured backend (undefined) → unchanged legacy FAIL (regression guard)', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    const check = checkPlatform();
    expect(check.passed).toBe(false);
    expect(check.required).toBe(false);
    expect(check.message).toMatch(/UNSUPPORTED/);
    expect(check.message).toMatch(/WSL2/);
  });

  it('win32 + explicit tmux backend → still FAIL (tmux genuinely unsupported natively)', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    const check = checkPlatform('tmux');
    expect(check.passed).toBe(false);
    expect(check.message).toMatch(/UNSUPPORTED/);
  });

  it('win32 + auto backend → conservative legacy FAIL (unresolved at this layer)', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    const check = checkPlatform('auto');
    expect(check.passed).toBe(false);
    expect(check.message).toMatch(/UNSUPPORTED/);
  });

  // ─── non-win32 platforms: backend param is a no-op ──────────────────

  it('linux + docker backend → unaffected, still PASS "Linux"', () => {
    vi.mocked(platform).mockReturnValue('linux' as NodeJS.Platform);
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('no file'); });
    const check = checkPlatform('docker');
    expect(check.passed).toBe(true);
    expect(check.message).toMatch(/Linux/i);
  });

  it('linux + subprocess backend → unaffected, still PASS "Linux"', () => {
    vi.mocked(platform).mockReturnValue('linux' as NodeJS.Platform);
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('no file'); });
    const check = checkPlatform('subprocess');
    expect(check.passed).toBe(true);
    expect(check.message).toMatch(/Linux/i);
  });

  it('darwin + docker backend → unaffected, still PASS "macOS"', () => {
    vi.mocked(platform).mockReturnValue('darwin' as NodeJS.Platform);
    const check = checkPlatform('docker');
    expect(check.passed).toBe(true);
    expect(check.message).toMatch(/macOS/);
  });
});

describe('runDoctorChecks — spawnBackend wired into Platform check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readdirSync).mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue('# Content' as unknown as ReturnType<typeof readFileSync>);
  });

  it('win32 + docker backend end-to-end → Platform entry passed=true', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    mockSpawnNotFound(); // node/git/tmux/claude/docker all "not found" — irrelevant to this assertion
    const result = runDoctorChecks('/mock/root', ['claude'], 'docker');
    const platformCheck = result.checks.find(c => c.name === 'Platform');
    expect(platformCheck).toBeDefined();
    expect(platformCheck!.passed).toBe(true);
    expect(platformCheck!.message).toMatch(/docker/i);
  });

  it('win32 + subprocess backend end-to-end → Platform entry passed=true', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    mockSpawnNotFound();
    const result = runDoctorChecks('/mock/root', ['claude'], 'subprocess');
    const platformCheck = result.checks.find(c => c.name === 'Platform');
    expect(platformCheck!.passed).toBe(true);
    expect(platformCheck!.message).toMatch(/subprocess/i);
  });

  it('win32 + no backend configured end-to-end → Platform entry passed=false (unchanged)', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    mockSpawnNotFound();
    const result = runDoctorChecks('/mock/root', ['claude']);
    const platformCheck = result.checks.find(c => c.name === 'Platform');
    expect(platformCheck!.passed).toBe(false);
    expect(platformCheck!.message).toMatch(/UNSUPPORTED/);
  });

  it('linux + docker backend end-to-end → Platform entry unaffected (passed=true, Linux)', () => {
    vi.mocked(platform).mockReturnValue('linux' as NodeJS.Platform);
    mockSpawnNotFound();
    const result = runDoctorChecks('/mock/root', ['claude'], 'docker');
    const platformCheck = result.checks.find(c => c.name === 'Platform');
    expect(platformCheck!.passed).toBe(true);
    expect(platformCheck!.message).toMatch(/Linux/i);
  });
});

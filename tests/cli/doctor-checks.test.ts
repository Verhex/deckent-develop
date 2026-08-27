import { createRequire } from 'node:module';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Row 450: checkNode derives its floor from package.json engines.node, so the
// passing fixture must derive the same way — a version literal rots when the
// floor moves (the old 'v22.0.0' fixtures broke at the >=24 raise).
const enginesNode = (createRequire(import.meta.url)('../../package.json') as {
  engines: { node: string };
}).engines.node;
const PASSING_NODE_VERSION = `v${parseInt(enginesNode.match(/(\d+)/)?.[1] ?? '0', 10)}.0.0`;

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  accessSync: vi.fn(),
  constants: { W_OK: 2 },
}));

vi.mock('node:os', () => ({
  platform: vi.fn().mockReturnValue('linux'),
  homedir: () => '/home/test',
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

// importOriginal-spread (2026-08-27): doctor-checks pulls the constants budget
// (BRAIN_TOTAL_LINE_BUDGET fallback) — a hand-listed partial mock silently
// misses new exports and throws on access (CI 3219f3ae2 regression class).
vi.mock('../../src/core/constants.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/core/constants.js')>()),
}));

vi.mock('../../src/core/errors.js', () => ({
  ErrorRegistry: {
    get: vi.fn().mockReturnValue({ suggestion: 'test suggestion' }),
  },
  // Gercek imzayla uyumlu davranissal-notr stub (routing/journal zinciri
  // DeckentError'u modul yukunde referansliyor).
  DeckentError: class DeckentError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly suggestion?: string,
    ) {
      super(message);
      this.name = 'DeckentError';
    }
  },
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
  isDeckFileCommitted: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  formatCIHealthSection: vi.fn().mockReturnValue([]),
}));

import { readFileSync, existsSync, readdirSync, accessSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { platform } from 'node:os';
import { isDeckFileCommitted } from '../../src/core/deck-file.js';

import {
  isRunningInWSL,
  checkPlatform,
  checkTmux,
  checkClaude,
  checkDocker,
  checkGitignore,
  checkWritePermissions,
  checkDeckSecurity,
  getMemoryEntryCount,
  getLastSprintId,
  countDebtItems,
  countOpenDebtItems,
  readCIBaseline,
  readAllCIReports,
  readLatestCIReport,
  runDoctorChecks,
  runPreFlightHealthCheck,
} from '../../src/cli/commands/doctor-checks.js';

// ─── Helper ──────────────────────────────────────────────────────────

function makeSpawnResult(status: number, stdout: string) {
  return { status, stdout, stderr: '', pid: 1, signal: null, output: [] };
}

// ─── isRunningInWSL ──────────────────────────────────────────────────

describe('isRunningInWSL (checks module)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['WSL_DISTRO_NAME'];
    delete process.env['WSL_INTEROP'];
  });
  afterEach(() => {
    delete process.env['WSL_DISTRO_NAME'];
    delete process.env['WSL_INTEROP'];
  });

  it('returns true when WSL_DISTRO_NAME is set', () => {
    process.env['WSL_DISTRO_NAME'] = 'Ubuntu';
    expect(isRunningInWSL()).toBe(true);
  });

  it('returns true when /proc/version contains "microsoft"', () => {
    vi.mocked(readFileSync).mockReturnValue('Linux version 5.15.0-microsoft-standard-WSL2' as unknown as ReturnType<typeof readFileSync>);
    expect(isRunningInWSL()).toBe(true);
  });

  it('returns false when no WSL indicators', () => {
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    expect(isRunningInWSL()).toBe(false);
  });
});

// ─── checkPlatform ───────────────────────────────────────────────────

describe('checkPlatform (checks module)', () => {
  it('returns passed=true for darwin', () => {
    vi.mocked(platform).mockReturnValue('darwin' as NodeJS.Platform);
    const check = checkPlatform();
    expect(check.passed).toBe(true);
    expect(check.message).toContain('macOS');
  });

  it('returns passed=false for win32', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    const check = checkPlatform();
    expect(check.passed).toBe(false);
    expect(check.required).toBe(false);
  });

  it('returns untested for unknown platform', () => {
    vi.mocked(platform).mockReturnValue('freebsd' as NodeJS.Platform);
    const check = checkPlatform();
    expect(check.passed).toBe(true);
    expect(check.message).toContain('untested');
  });

  // born-651 (task 412-003, DOCTOR-TWIN dedup): checkPlatform used to be a
  // live twin — doctor.ts's copy was backend-aware on win32 (docker/subprocess
  // pass), doctor-checks.ts's copy hardcoded UNSUPPORTED regardless of
  // spawn_backend. The canonical body (now the only one) must keep the
  // backend-aware behavior, since that was the one actually shipped in
  // `deckent doctor`.
  it('win32 + docker backend passes (backend-aware, not a blanket UNSUPPORTED)', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    const check = checkPlatform('docker');
    expect(check.passed).toBe(true);
    expect(check.message).toContain('docker backend');
  });

  it('win32 + subprocess backend passes (backend-aware)', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    const check = checkPlatform('subprocess');
    expect(check.passed).toBe(true);
    expect(check.message).toContain('subprocess backend');
  });

  it('win32 with no backend override still fails (genuine platform incompatibility, not a config choice)', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    const check = checkPlatform();
    expect(check.passed).toBe(false);
  });
});

// ─── checkTmux ───────────────────────────────────────────────────────

describe('checkTmux (checks module)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(platform).mockReturnValue('linux' as NodeJS.Platform);
  });

  it('not required for docker backend', () => {
    const check = checkTmux(undefined, 'docker');
    expect(check.passed).toBe(true);
    expect(check.required).toBe(false);
    expect(check.message).toContain('docker backend');
  });

  it('not required for subprocess backend', () => {
    const check = checkTmux(undefined, 'subprocess');
    expect(check.passed).toBe(true);
    expect(check.required).toBe(false);
  });

  it('required when claude provider and tmux missing', () => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(1, '') as ReturnType<typeof spawnSync>);
    const check = checkTmux(['claude']);
    expect(check.required).toBe(true);
    expect(check.passed).toBe(false);
  });

  it('not required for non-claude providers', () => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(1, '') as ReturnType<typeof spawnSync>);
    const check = checkTmux(['codex']);
    expect(check.required).toBe(false);
  });

  // born-651 (task 412-003, DOCTOR-TWIN dedup): checkTmux was a live twin —
  // doctor.ts's copy i18n'd the "not required" reasons via getMessage;
  // doctor-checks.ts's copy hardcoded English-only text. The canonical body
  // must keep the i18n behavior.
  it('is i18n\'d via getMessage for the "not required" reason (lang param, born-651)', () => {
    const enCheck = checkTmux(undefined, 'docker', 'en');
    const trCheck = checkTmux(undefined, 'docker', 'tr');
    expect(enCheck.message).toContain('docker backend');
    expect(trCheck.message).not.toBe(enCheck.message);
  });
});

// ─── checkClaude ─────────────────────────────────────────────────────

describe('checkClaude (checks module)', () => {
  it('returns passed=false when not installed', () => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(1, '') as ReturnType<typeof spawnSync>);
    const check = checkClaude();
    expect(check.passed).toBe(false);
    expect(check.message).toContain('not found');
  });

  it('returns passed=true when installed', () => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, '2.1.0') as ReturnType<typeof spawnSync>);
    const check = checkClaude();
    expect(check.passed).toBe(true);
  });

  it('checks auth when checkAuth=true', () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce(makeSpawnResult(0, '2.1.0') as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce(makeSpawnResult(1, '') as ReturnType<typeof spawnSync>);
    const check = checkClaude(true);
    expect(check.passed).toBe(false);
    expect(check.message).toContain('not authenticated');
  });
});

// ─── checkDocker ─────────────────────────────────────────────────────

describe('checkDocker (checks module)', () => {
  it('passes when docker not installed and not wanted', () => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(1, '') as ReturnType<typeof spawnSync>);
    const check = checkDocker();
    expect(check.passed).toBe(true);
    expect(check.required).toBe(false);
  });

  it('fails when docker wanted but not available', () => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(1, '') as ReturnType<typeof spawnSync>);
    const check = checkDocker('docker');
    expect(check.passed).toBe(false);
    expect(check.required).toBe(true);
  });

  it('passes when docker available', () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      if (args?.includes('-q')) return makeSpawnResult(0, 'abc123') as ReturnType<typeof spawnSync>;
      return makeSpawnResult(0, 'Docker info') as ReturnType<typeof spawnSync>;
    });
    const check = checkDocker();
    expect(check.passed).toBe(true);
  });
});

// ─── checkGitignore ──────────────────────────────────────────────────

describe('checkGitignore (checks module)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('.brain/memory.db\n.brain/memory.db-shm\n.brain/memory.db-wal\n' as unknown as ReturnType<typeof readFileSync>);
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, '') as ReturnType<typeof spawnSync>);
  });

  it('passes when all files gitignored and not tracked', () => {
    const check = checkGitignore('/mock');
    expect(check.passed).toBe(true);
  });

  it('fails when .gitignore missing', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const check = checkGitignore('/mock');
    expect(check.passed).toBe(false);
  });

  it('fails when file is tracked', () => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, '.brain/memory.db\n') as ReturnType<typeof spawnSync>);
    const check = checkGitignore('/mock');
    expect(check.passed).toBe(false);
    expect(check.message).toContain('Tracked by git');
  });
});

// ─── checkWritePermissions ───────────────────────────────────────────

describe('checkWritePermissions (checks module)', () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReturnValue(true);
  });

  it('passes when directories writable', () => {
    vi.mocked(accessSync).mockReturnValue(undefined);
    const check = checkWritePermissions('/mock');
    expect(check.passed).toBe(true);
    expect(check.required).toBe(true);
  });

  it('fails when directory not writable', () => {
    vi.mocked(accessSync).mockImplementation((p: unknown) => {
      if (String(p).includes('.tasks')) throw new Error('EACCES');
    });
    const check = checkWritePermissions('/mock');
    expect(check.passed).toBe(false);
  });
});

// ─── checkDeckSecurity ───────────────────────────────────────────────

describe('checkDeckSecurity (checks module)', () => {
  it('passes when .deck not found', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const check = checkDeckSecurity('/mock');
    expect(check.passed).toBe(true);
  });

  it('fails when .deck tracked by git', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(isDeckFileCommitted).mockReturnValue(true);
    const check = checkDeckSecurity('/mock');
    expect(check.passed).toBe(false);
  });

  it('passes when .deck exists but not tracked', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(isDeckFileCommitted).mockReturnValue(false);
    const check = checkDeckSecurity('/mock');
    expect(check.passed).toBe(true);
  });
});

// ─── getMemoryEntryCount ─────────────────────────────────────────────

describe('getMemoryEntryCount (checks module)', () => {
  it('returns 0 when db file missing', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(getMemoryEntryCount('/mock')).toBe(0);
  });

  it('returns count from MemoryStore', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    mockMemoryStore.totalCount.mockReturnValue(42);
    expect(getMemoryEntryCount('/mock')).toBe(42);
    expect(mockMemoryStore.close).toHaveBeenCalled();
  });
});

// ─── getLastSprintId ─────────────────────────────────────────────────

describe('getLastSprintId (checks module)', () => {
  it('returns sprint ID from config', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ last_sprint_id: 'sprint-042' }) as unknown as ReturnType<typeof readFileSync>);
    expect(getLastSprintId('/mock')).toBe('sprint-042');
  });

  it('returns null when config missing', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(getLastSprintId('/mock')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('NOT JSON' as unknown as ReturnType<typeof readFileSync>);
    expect(getLastSprintId('/mock')).toBeNull();
  });
});

// ─── countDebtItems ──────────────────────────────────────────────────

describe('countDebtItems (checks module, DB-first)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns zero when no DB file', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(countDebtItems('/mock')).toEqual({ total: 0, critical: 0 });
  });

  it('counts debt entries from MemoryStore', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    mockMemoryStore.getByType.mockReturnValue([
      { type: 'debt', status: 'open', priority: 'HIGH' },
      { type: 'debt', status: 'open', priority: 'CRITICAL' },
    ]);
    const r = countDebtItems('/mock');
    expect(r.total).toBe(2);
    expect(r.critical).toBe(1);
  });
});

// ─── countOpenDebtItems ──────────────────────────────────────────────

describe('countOpenDebtItems (checks module, DB-first)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 0 when no DB file', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(countOpenDebtItems('/mock')).toBe(0);
  });

  it('filters resolved entries', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    mockMemoryStore.getByType.mockReturnValue([
      { type: 'debt', status: 'open', priority: 'HIGH' },
      { type: 'debt', status: 'resolved', priority: 'LOW' },
    ]);
    expect(countOpenDebtItems('/mock')).toBe(1);
  });
});

// ─── readCIBaseline ──────────────────────────────────────────────────

describe('readCIBaseline (checks module)', () => {
  it('returns null when file missing', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(readCIBaseline('/mock')).toBeNull();
  });

  it('returns parsed baseline', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ baseline: { testCount: 100 } }) as unknown as ReturnType<typeof readFileSync>);
    const result = readCIBaseline('/mock');
    expect(result).toHaveProperty('baseline');
  });
});

// ─── readAllCIReports ────────────────────────────────────────────────

describe('readAllCIReports (checks module)', () => {
  it('returns empty array when brain dir missing', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(readAllCIReports('/mock')).toEqual([]);
  });
});

// ─── readLatestCIReport ──────────────────────────────────────────────

describe('readLatestCIReport (checks module)', () => {
  it('returns null when no reports', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(readLatestCIReport('/mock')).toBeNull();
  });
});

// ─── runDoctorChecks ─────────────────────────────────────────────────

describe('runDoctorChecks (checks module)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(platform).mockReturnValue('linux' as NodeJS.Platform);
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, PASSING_NODE_VERSION) as ReturnType<typeof spawnSync>);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue('# Content' as unknown as ReturnType<typeof readFileSync>);
    mockMemoryStore.totalCount.mockReturnValue(50);
    vi.mocked(accessSync).mockReturnValue(undefined);
  });

  it('returns ok=true when all required pass', () => {
    const result = runDoctorChecks('/mock');
    expect(result.ok).toBe(true);
  });

  it('returns checks array with 17 items', () => {
    const result = runDoctorChecks('/mock');
    expect(result.checks.length).toBe(17); // 15 + '.deck Subprocess Visibility' (411-002) + 'Routing journal' (A2 dalgasi, 7b80acfc8)
  });

  it('returns ok=false when node missing', () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'node') return makeSpawnResult(1, '') as ReturnType<typeof spawnSync>;
      return makeSpawnResult(0, 'v22') as ReturnType<typeof spawnSync>;
    });
    const result = runDoctorChecks('/mock');
    expect(result.ok).toBe(false);
  });
});

// ─── checkDebt (born-651, task 412-003: DOCTOR-TWIN dedup) ────────────
//
// checkDebt was a live twin — doctor.ts's copy was DB-first (getDebtItems
// from core/debt-store.ts), doctor-checks.ts's copy still parsed the
// long-removed root .brain/DEBT.md file. Not exported (never was), so it's
// only reachable through runDoctorChecks()'s 'Debt' entry.

describe('checkDebt via runDoctorChecks (checks module, DB-first — born-651)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(platform).mockReturnValue('linux' as NodeJS.Platform);
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, PASSING_NODE_VERSION) as ReturnType<typeof spawnSync>);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue('# Content' as unknown as ReturnType<typeof readFileSync>);
    vi.mocked(accessSync).mockReturnValue(undefined);
    mockMemoryStore.totalCount.mockReturnValue(50);
    mockMemoryStore.getByType.mockReturnValue([]);
  });

  it('reads debt from MemoryStore.getByType("debt") (DB-first) — a CRITICAL entry fails the check', () => {
    mockMemoryStore.getByType.mockReturnValue([
      { id: '1', title: 'x', status: 'open', priority: 'CRITICAL', metadata: '{}', sprint_id: null, created_at: '2026-01-01' },
    ]);
    const result = runDoctorChecks('/mock');
    const debtCheck = result.checks.find(c => c.name === 'Debt');
    expect(debtCheck?.passed).toBe(false);
    expect(debtCheck?.message).toContain('CRITICAL');
  });

  it('uses DB-first "open debt items" wording, not the removed DEBT.md-parser\'s "debt items" wording', () => {
    const result = runDoctorChecks('/mock');
    const debtCheck = result.checks.find(c => c.name === 'Debt');
    expect(debtCheck?.message).toMatch(/open debt items/);
  });
});

// ─── runPreFlightHealthCheck ─────────────────────────────────────────

describe('runPreFlightHealthCheck (checks module)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(platform).mockReturnValue('linux' as NodeJS.Platform);
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, PASSING_NODE_VERSION) as ReturnType<typeof spawnSync>);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue('# Content' as unknown as ReturnType<typeof readFileSync>);
    mockMemoryStore.totalCount.mockReturnValue(50);
    vi.mocked(accessSync).mockReturnValue(undefined);
  });

  it('falls back to doctor checks when script fails', () => {
    // spawnSync for script returns error, then doctor checks run
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'node') return makeSpawnResult(1, '') as ReturnType<typeof spawnSync>;
      return makeSpawnResult(0, 'v22') as ReturnType<typeof spawnSync>;
    });
    const result = runPreFlightHealthCheck('/mock');
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('abortSprint');
    expect(result).toHaveProperty('checks');
  });
});

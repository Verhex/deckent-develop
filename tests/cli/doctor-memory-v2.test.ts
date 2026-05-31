/**
 * Sprint 179 W3-6 (Task 179-008) — doctor DECISIONS.md obsolete + Memory V2 accept-either.
 *
 * Tests that doctor's checkBrainDir accepts EITHER:
 *   - Legacy `.brain/DECISIONS.md` (V1 backward compat), OR
 *   - Memory V2 source of truth (`.brain/memory.db` + `.brain/exports/decisions.md`)
 *
 * On a clean Memory V2 install (no legacy DECISIONS.md), doctor must NOT report a false-positive "Missing" error.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('../../src/core/constants.js', () => ({
  DECKENT_DIR: '.deckent',
  BRAIN_DIR: '.brain',
  MEMORY_FILE: 'MEMORY.md',
  DEBT_FILE: 'DEBT.md',
  DECISIONS_FILE: 'DECISIONS.md',
  DIRECTIVES_FILE: 'DIRECTIVES.md',
  LOCKS_DIR: '.locks',
  LOCK_STALE_THRESHOLD_MS: 300000,
  DEBT_TABLE_HEADER: '| ID',
  PROJECT_CONFIG_PATH: '.deckent/config.json',
  MEMORY_DB_FILE: 'memory.db',
  MEMORY_EXPORTS_DIR: 'exports',
}));

vi.mock('../../src/core/errors.js', () => ({
  ErrorRegistry: {
    get: vi.fn().mockReturnValue({ suggestion: 'test suggestion' }),
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

import { existsSync, readFileSync, readdirSync, accessSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { runDoctorChecks } from '../../src/cli/commands/doctor-checks.js';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeSpawnResult(status: number, stdout: string) {
  return { status, stdout, stderr: '', pid: 1, signal: null, output: [] };
}

// ─── Test 1: Memory V2 clean install must NOT report DECISIONS.md missing ──

describe('checkBrainDir — Memory V2 clean install (no legacy DECISIONS.md)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default spawn for node/git/tmux/docker/claude/etc to "success"
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, 'v22.0.0') as ReturnType<typeof spawnSync>);
    vi.mocked(readdirSync).mockReturnValue([] as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue('# Content' as unknown as ReturnType<typeof readFileSync>);
    vi.mocked(accessSync).mockReturnValue(undefined);
    mockMemoryStore.totalCount.mockReturnValue(50);
  });

  it('passes when .brain/memory.db + .brain/exports/decisions.md exist (no DECISIONS.md)', () => {
    // Simulate a fresh Memory V2 install:
    //   - .brain/ dir exists
    //   - .brain/memory.db exists (Memory V2 source of truth)
    //   - .brain/exports/decisions.md exists (auto-generated export)
    //   - .brain/MEMORY.md + .brain/DEBT.md exist (V2 hybrid keeps these)
    //   - .brain/DECISIONS.md does NOT exist (deprecated)
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      // Legacy DECISIONS.md missing on a fresh V2 install
      if (path.endsWith('DECISIONS.md') && !path.endsWith('decisions.md')) return false;
      // memory.db + exports/decisions.md exist
      if (path.endsWith('memory.db')) return true;
      if (path.endsWith('exports/decisions.md')) return true;
      // Other brain files exist
      return true;
    });

    const result = runDoctorChecks('/mock');
    const brainCheck = result.checks.find(c => c.name === 'Brain Dir');
    expect(brainCheck).toBeDefined();
    expect(brainCheck?.passed).toBe(true);
    expect(brainCheck?.message).not.toMatch(/Missing.*DECISIONS\.md/);
  });
});

// ─── Test 2: Legacy V1 install still works (backward compat) ──────────

describe('checkBrainDir — Legacy V1 install (only DECISIONS.md, no Memory V2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, 'v22.0.0') as ReturnType<typeof spawnSync>);
    vi.mocked(readdirSync).mockReturnValue([] as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue('# Content' as unknown as ReturnType<typeof readFileSync>);
    vi.mocked(accessSync).mockReturnValue(undefined);
    mockMemoryStore.totalCount.mockReturnValue(50);
  });

  it('passes when only legacy .brain/DECISIONS.md exists (no memory.db, no exports/)', () => {
    // Simulate a pre-Sprint-154 V1 install:
    //   - .brain/ dir exists
    //   - .brain/DECISIONS.md exists (legacy source)
    //   - .brain/MEMORY.md + .brain/DEBT.md exist
    //   - .brain/memory.db does NOT exist (no V2)
    //   - .brain/exports/decisions.md does NOT exist (no V2)
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('memory.db')) return false; // V2 missing
      if (path.endsWith('exports/decisions.md')) return false; // V2 missing
      // All other brain files (legacy) present
      return true;
    });

    const result = runDoctorChecks('/mock');
    const brainCheck = result.checks.find(c => c.name === 'Brain Dir');
    expect(brainCheck).toBeDefined();
    expect(brainCheck?.passed).toBe(true);
    expect(brainCheck?.message).not.toMatch(/Missing/);
  });
});

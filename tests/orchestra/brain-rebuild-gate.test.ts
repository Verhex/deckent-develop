// Tests for the Sprint 156 Task 008 Brain Self-Rebuild Gate:
// checkBuildStaleness() emits SPRINT→USER:BUILD_STALE_WARNING when
// dist/orchestra/sprint-phases.js mtime > .deckent/sprint-state.json mtime.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  statSync: vi.fn(),
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

vi.mock('../../src/orchestra/event-stream.js', () => ({
  writeEvent: vi.fn(),
  getCurrentSprintId: vi.fn().mockReturnValue('sprint-156'),
  CHANNELS: {
    SPRINT_PHASE_CHANGE: 'BRAIN→*:SPRINT_PHASE_CHANGE',
  },
}));

// debugLog is used as fail-safe sink. Stub to silence + assert no throws.
vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/utils.js')>();
  return {
    ...actual,
    debugLog: vi.fn(),
  };
});

import { existsSync, statSync } from 'node:fs';
import type { Stats } from 'node:fs';
import { writeEvent } from '../../src/orchestra/event-stream.js';
import { checkBuildStaleness } from '../../src/orchestra/sprint-phases.js';

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Build a Stats-shaped object with the given mtime in milliseconds. */
function makeStats(mtimeMs: number): Stats {
  const mtime = new Date(mtimeMs);
  return {
    mtime,
    mtimeMs,
    atime: mtime, atimeMs: mtimeMs,
    ctime: mtime, ctimeMs: mtimeMs,
    birthtime: mtime, birthtimeMs: mtimeMs,
    size: 1024,
    isFile: () => true,
    isDirectory: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    dev: 0, ino: 0, mode: 0, nlink: 1, uid: 0, gid: 0,
    rdev: 0, blksize: 4096, blocks: 1,
  } as unknown as Stats;
}

const PROJECT_ROOT = '/test-root';
const SPRINT_ID = 'sprint-156';

const DIST_REL = 'dist/orchestra/sprint-phases.js';
const STATE_REL = '.deckent/sprint-state.json';

/**
 * Make existsSync return true for both files (the happy-path setup).
 * Returns the underlying mock so individual tests can override.
 */
function existsBothFiles(): void {
  vi.mocked(existsSync).mockImplementation((p: unknown) => {
    const s = String(p);
    return s.includes(DIST_REL) || s.includes(STATE_REL);
  });
}

/**
 * Wire statSync to return dist/state stats. Either side can be undefined to
 * simulate a non-existent file (matching existsSync mock).
 */
function wireStatSync(distMs: number | undefined, stateMs: number | undefined): void {
  vi.mocked(statSync).mockImplementation(((p: unknown) => {
    const s = String(p);
    if (s.includes(DIST_REL)) {
      if (distMs === undefined) { throw new Error('ENOENT: dist missing'); }
      return makeStats(distMs);
    }
    if (s.includes(STATE_REL)) {
      if (stateMs === undefined) { throw new Error('ENOENT: state missing'); }
      return makeStats(stateMs);
    }
    throw new Error(`ENOENT: unexpected stat for ${s}`);
  }) as unknown as typeof statSync);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe('checkBuildStaleness — Brain Self-Rebuild Gate (Sprint 156 Task 008)', () => {
  it('emits BUILD_STALE_WARNING when dist is 1 hour newer than sprint-state', () => {
    const now = Date.UTC(2026, 4, 12, 12, 0, 0);
    const distMs = now;                // dist rebuilt now
    const stateMs = now - 60 * 60_000; // sprint-state from 1 hour ago

    existsBothFiles();
    wireStatSync(distMs, stateMs);

    const result = checkBuildStaleness(PROJECT_ROOT, SPRINT_ID);

    expect(result.warningEmitted).toBe(true);
    expect(result.ageSeconds).toBe(3600);
    expect(result.distMtime).toBe(new Date(distMs).toISOString());
    expect(result.sprintStateMtime).toBe(new Date(stateMs).toISOString());

    expect(writeEvent).toHaveBeenCalledTimes(1);
    expect(writeEvent).toHaveBeenCalledWith(
      PROJECT_ROOT,
      SPRINT_ID,
      'sprint',
      'user',
      'SPRINT→USER:BUILD_STALE_WARNING',
      {
        distMtime: new Date(distMs).toISOString(),
        sprintStateMtime: new Date(stateMs).toISOString(),
        ageSeconds: 3600,
      },
    );
  });

  it('does NOT emit when dist is older than sprint-state', () => {
    const now = Date.UTC(2026, 4, 12, 12, 0, 0);
    const distMs = now - 2 * 60 * 60_000; // dist from 2h ago
    const stateMs = now;                  // sprint-state fresh

    existsBothFiles();
    wireStatSync(distMs, stateMs);

    const result = checkBuildStaleness(PROJECT_ROOT, SPRINT_ID);

    expect(result.warningEmitted).toBe(false);
    expect(result.skipReason).toBe('not-newer');
    expect(writeEvent).not.toHaveBeenCalled();
  });

  it('does NOT emit when dist and sprint-state mtimes are equal', () => {
    const sameMs = Date.UTC(2026, 4, 12, 12, 0, 0);

    existsBothFiles();
    wireStatSync(sameMs, sameMs);

    const result = checkBuildStaleness(PROJECT_ROOT, SPRINT_ID);

    expect(result.warningEmitted).toBe(false);
    expect(result.skipReason).toBe('not-newer');
    expect(writeEvent).not.toHaveBeenCalled();
  });

  it('skips check and returns dist-missing when dist file is absent', () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) =>
      String(p).includes(STATE_REL),
    );
    wireStatSync(undefined, Date.now());

    const result = checkBuildStaleness(PROJECT_ROOT, SPRINT_ID);

    expect(result.warningEmitted).toBe(false);
    expect(result.skipReason).toBe('dist-missing');
    expect(writeEvent).not.toHaveBeenCalled();
  });

  it('skips check and returns state-missing when sprint-state file is absent', () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) =>
      String(p).includes(DIST_REL),
    );
    wireStatSync(Date.now(), undefined);

    const result = checkBuildStaleness(PROJECT_ROOT, SPRINT_ID);

    expect(result.warningEmitted).toBe(false);
    expect(result.skipReason).toBe('state-missing');
    expect(writeEvent).not.toHaveBeenCalled();
  });

  it('is fail-safe when statSync throws — no warning, no crash', () => {
    existsBothFiles();
    vi.mocked(statSync).mockImplementation(() => {
      throw new Error('EACCES: simulated permission error');
    });

    const result = checkBuildStaleness(PROJECT_ROOT, SPRINT_ID);

    expect(result.warningEmitted).toBe(false);
    expect(result.skipReason).toBe('io-error');
    expect(writeEvent).not.toHaveBeenCalled();
  });

  it('computes ageSeconds correctly for large gaps (24h)', () => {
    const now = Date.UTC(2026, 4, 12, 12, 0, 0);
    const distMs = now;
    const stateMs = now - 24 * 60 * 60_000; // 24h gap

    existsBothFiles();
    wireStatSync(distMs, stateMs);

    const result = checkBuildStaleness(PROJECT_ROOT, SPRINT_ID);

    expect(result.warningEmitted).toBe(true);
    expect(result.ageSeconds).toBe(24 * 3600);

    const callArgs = vi.mocked(writeEvent).mock.calls[0]!;
    const payload = callArgs[5] as { ageSeconds: number };
    expect(payload.ageSeconds).toBe(24 * 3600);
  });

  it('emits with target=user and source=sprint (channel routing contract)', () => {
    const now = Date.UTC(2026, 4, 12, 12, 0, 0);
    existsBothFiles();
    wireStatSync(now, now - 60_000);

    checkBuildStaleness(PROJECT_ROOT, SPRINT_ID);

    const callArgs = vi.mocked(writeEvent).mock.calls[0]!;
    expect(callArgs[2]).toBe('sprint');
    expect(callArgs[3]).toBe('user');
    expect(callArgs[4]).toBe('SPRINT→USER:BUILD_STALE_WARNING');
  });
});

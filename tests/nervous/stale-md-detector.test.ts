// tests/nervous/stale-md-detector.test.ts
// Sprint 166 T9 — stale_md detector unit tests
// ADR-003: vitest over Jest

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
  renameSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: '', stderr: '' }),
}));

vi.mock('../../src/monitor/alert-emitter.js', () => ({
  emitAlert: vi.fn(),
}));

vi.mock('../../src/orchestra/event-stream.js', () => ({
  writeEvent: vi.fn().mockReturnValue(null),
  CHANNELS: {
    METRIC_EMITTED: 'BRAIN→*:METRIC_EMITTED',
    SCOPE_COLLISION_DETECTED: 'AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED',
  },
}));

vi.mock('../../src/orchestra/authority-enforcer.js', () => ({
  checkAuthority: vi.fn().mockReturnValue({ allowed: true }),
  emitAuthorityViolation: vi.fn(),
  runAuthorityChecks: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => ({
    upsert: vi.fn(),
    close: vi.fn(),
  })),
}));

import { existsSync, statSync } from 'node:fs';
import { emitAlert } from '../../src/monitor/alert-emitter.js';
import { runScanCycle, resetStaleMdThrottle } from '../../src/monitor/auditor.js';

const mockExistsSync = vi.mocked(existsSync);
const mockStatSync = vi.mocked(statSync);
const mockEmitAlert = vi.mocked(emitAlert);

// ─── Tests ───────────────────────────────────────────────────────────

describe('stale_md detector in runScanCycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStaleMdThrottle(); // B-STALEMD: isolate the module-level emit-throttle
    // Default: tasks dir and locks dir don't exist → minimal scan
    mockExistsSync.mockReturnValue(false);
  });

  it('emits stale_md alert when CLAUDE.md mtime exceeds 70 minutes', () => {
    const staleMtime = Date.now() - 75 * 60 * 1000; // 75 min ago
    mockExistsSync.mockImplementation((p: unknown) => {
      return String(p).endsWith('CLAUDE.md');
    });
    mockStatSync.mockReturnValue({ mtimeMs: staleMtime } as ReturnType<typeof statSync>);

    runScanCycle('/project', 'sprint-166');

    expect(mockEmitAlert).toHaveBeenCalledOnce();
    const [, , payload] = mockEmitAlert.mock.calls[0] as [string, string, { type: string }];
    expect(payload.type).toBe('stale_md');
  });

  it('does NOT emit stale_md alert when CLAUDE.md was updated recently', () => {
    const freshMtime = Date.now() - 5 * 60 * 1000; // 5 min ago
    mockExistsSync.mockImplementation((p: unknown) => {
      return String(p).endsWith('CLAUDE.md');
    });
    mockStatSync.mockReturnValue({ mtimeMs: freshMtime } as ReturnType<typeof statSync>);

    runScanCycle('/project', 'sprint-166');

    expect(mockEmitAlert).not.toHaveBeenCalled();
  });

  // B-STALEMD (Sprint 318): throttle — emit once per staleness, not every scan.
  it('emits stale_md only ONCE across repeated scans of the same stale mtime', () => {
    const staleMtime = Date.now() - 80 * 60 * 1000; // 80 min ago
    mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith('CLAUDE.md'));
    mockStatSync.mockReturnValue({ mtimeMs: staleMtime } as ReturnType<typeof statSync>);

    // Three consecutive scan cycles (e.g. the ~30s auditor loop) with the SAME
    // unchanged mtime — pre-fix this emitted 3 identical events (the spam).
    runScanCycle('/project', 'sprint-166');
    runScanCycle('/project', 'sprint-166');
    runScanCycle('/project', 'sprint-166');

    expect(mockEmitAlert).toHaveBeenCalledOnce();
  });

  it('re-emits when staleness clears then returns (mtime change is real news)', () => {
    mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith('CLAUDE.md'));

    // Stale → emit
    mockStatSync.mockReturnValue({ mtimeMs: Date.now() - 80 * 60 * 1000 } as ReturnType<typeof statSync>);
    runScanCycle('/project', 'sprint-166');
    // Fresh → no emit + reset throttle
    mockStatSync.mockReturnValue({ mtimeMs: Date.now() - 2 * 60 * 1000 } as ReturnType<typeof statSync>);
    runScanCycle('/project', 'sprint-166');
    // Stale again (different mtime) → emit again
    mockStatSync.mockReturnValue({ mtimeMs: Date.now() - 90 * 60 * 1000 } as ReturnType<typeof statSync>);
    runScanCycle('/project', 'sprint-166');

    expect(mockEmitAlert).toHaveBeenCalledTimes(2);
  });
});

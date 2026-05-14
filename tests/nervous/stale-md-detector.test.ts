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
import { runScanCycle } from '../../src/monitor/auditor.js';

const mockExistsSync = vi.mocked(existsSync);
const mockStatSync = vi.mocked(statSync);
const mockEmitAlert = vi.mocked(emitAlert);

// ─── Tests ───────────────────────────────────────────────────────────

describe('stale_md detector in runScanCycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});

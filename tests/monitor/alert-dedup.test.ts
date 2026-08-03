// tests/monitor/alert-dedup.test.ts
// Sprint 282 Task 8 — Alert dedup tests (DASH-UX-4)
// ADR-003: vitest over Jest; ADR-087: hermetic, no real I/O

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 2, mtimeMs: 0 })),
  renameSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock('../../src/orchestra/event-stream.js', () => ({
  writeEvent: vi.fn().mockReturnValue(null),
  CHANNELS: {
    METRIC_EMITTED: 'BRAIN→*:METRIC_EMITTED',
  },
}));

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { emitAlert, deduplicateAlert } from '../../src/monitor/alert-emitter.js';
import { dedupAlerts, DASHBOARD_MAX_ALERTS } from '../../src/monitor/dashboard-manager.js';
import { AlertLevel } from '../../src/core/types.js';
import type { Alert } from '../../src/core/types.js';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

function makeDashboard(alerts: Alert[] = []) {
  return {
    sprint: { id: 'sprint-282', number: 282, phase: 'EXECUTE', status: 'RUNNING' },
    agents: [],
    progress: { done: 0, active: 1, blocked: 0, total: 3 },
    alerts,
    updatedAt: '2026-06-11T00:00:00.000Z',
  };
}

function makeAlert(source: string, message = 'test', timestamp = '2026-06-11T00:00:00.000Z'): Alert {
  return { level: AlertLevel.WARNING, message, source, timestamp };
}

// ─── deduplicateAlert unit tests ─────────────────────────────────────

describe('deduplicateAlert', () => {
  it('returns single entry when same source is added twice — count increments', () => {
    const first = makeAlert('auditor:stale_md_detector', 'CLAUDE.md stale', '2026-06-11T00:00:00.000Z');
    const second = {
      ...makeAlert('auditor:stale_md_detector', 'CLAUDE.md stale', '2026-06-11T00:05:00.000Z'),
      lastSeenAt: '2026-06-11T00:05:00.000Z',
      count: 1,
    };

    const result1 = deduplicateAlert([], first);
    expect(result1).toHaveLength(1);
    expect(result1[0].count).toBe(1);

    const result2 = deduplicateAlert(result1 as Alert[], second);
    expect(result2).toHaveLength(1);
    expect(result2[0].count).toBe(2);
    expect(result2[0].lastSeenAt).toBe('2026-06-11T00:05:00.000Z');
  });

  it('creates separate entries for different sources', () => {
    const a1 = makeAlert('auditor:stale_md_detector', 'CLAUDE.md stale', '2026-06-11T00:00:00.000Z');
    const a2 = makeAlert('auditor:boundary_violation', 'file outside scope', '2026-06-11T00:01:00.000Z');

    const list = deduplicateAlert([], a1);
    const result = deduplicateAlert(list as Alert[], { ...a2, lastSeenAt: a2.timestamp, count: 1 });
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.source)).toContain('auditor:stale_md_detector');
    expect(result.map((a) => a.source)).toContain('auditor:boundary_violation');
  });

  it('caps list at MAX_ALERTS when many distinct alerts accumulate', () => {
    let list: Alert[] = [];
    for (let i = 0; i < 60; i++) {
      const incoming = {
        ...makeAlert(`source:${i}`, `msg-${i}`, '2026-06-11T00:00:00.000Z'),
        lastSeenAt: '2026-06-11T00:00:00.000Z',
        count: 1,
      };
      list = deduplicateAlert(list, incoming) as Alert[];
    }
    expect(list.length).toBeLessThanOrEqual(DASHBOARD_MAX_ALERTS);
  });
});

// ─── dedupAlerts batch helper tests ──────────────────────────────────

describe('dedupAlerts', () => {
  it('merges repeated source entries into one with count', () => {
    const alerts: Alert[] = [
      makeAlert('auditor:stale_md_detector', 'CLAUDE.md stale', '2026-06-11T00:00:00.000Z'),
      makeAlert('auditor:stale_md_detector', 'CLAUDE.md stale', '2026-06-11T00:05:00.000Z'),
      makeAlert('auditor:stale_md_detector', 'CLAUDE.md stale', '2026-06-11T00:10:00.000Z'),
    ];

    const result = dedupAlerts(alerts);
    expect(result).toHaveLength(1);
    expect((result[0] as Alert & { count?: number }).count).toBe(3);
  });

  it('keeps distinct sources as separate entries', () => {
    const alerts: Alert[] = [
      makeAlert('auditor:stale_md_detector', 'CLAUDE.md stale', '2026-06-11T00:00:00.000Z'),
      makeAlert('auditor:boundary_violation', 'scope exceeded', '2026-06-11T00:01:00.000Z'),
    ];

    const result = dedupAlerts(alerts);
    expect(result).toHaveLength(2);
  });

  it('sorts by lastSeenAt descending — most recent first', () => {
    const alerts: Alert[] = [
      makeAlert('source-A', 'old', '2026-06-11T00:00:00.000Z'),
      makeAlert('source-B', 'new', '2026-06-11T00:10:00.000Z'),
    ];

    const result = dedupAlerts(alerts);
    expect(result[0].source).toBe('source-B');
    expect(result[1].source).toBe('source-A');
  });

  it('caps at DASHBOARD_MAX_ALERTS when given more than 50 distinct entries', () => {
    const alerts: Alert[] = Array.from({ length: 60 }, (_, i) =>
      makeAlert(`source-${i}`, `msg-${i}`, '2026-06-11T00:00:00.000Z'),
    );

    const result = dedupAlerts(alerts);
    expect(result.length).toBe(DASHBOARD_MAX_ALERTS);
  });
});

// ─── emitAlert integration tests (dedup via dashboard write) ──────────

describe('emitAlert dedup integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('repeated emitAlert for same source produces one dashboard entry with count', () => {
    const initialDash = makeDashboard([]);
    mockExistsSync.mockReturnValue(true);
    // First call: empty dashboard
    mockReadFileSync.mockReturnValueOnce(JSON.stringify(initialDash));
    emitAlert('/root', 'sprint-282', {
      type: 'stale_md',
      message: 'CLAUDE.md stale (t1)',
      source: 'auditor:stale_md_detector',
    });

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const [, written1] = mockWriteFileSync.mock.calls[0] as [unknown, string];
    const state1 = JSON.parse(written1);
    expect(state1.alerts).toHaveLength(1);
    expect(state1.alerts[0].count).toBe(1);

    // Second call: dashboard now has 1 entry
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify(state1));
    emitAlert('/root', 'sprint-282', {
      type: 'stale_md',
      message: 'CLAUDE.md stale (t2)',
      source: 'auditor:stale_md_detector',
    });

    const [, written2] = mockWriteFileSync.mock.calls[0] as [unknown, string];
    const state2 = JSON.parse(written2);
    expect(state2.alerts).toHaveLength(1);
    expect(state2.alerts[0].count).toBe(2);
    expect(state2.alerts[0].lastSeenAt).toBeDefined();
  });

  it('different subjects produce separate dashboard entries', () => {
    const initialDash = makeDashboard([]);
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify(initialDash));
    emitAlert('/root', 'sprint-282', {
      type: 'stale_md',
      message: 'CLAUDE.md stale',
      source: 'auditor:stale_md_detector',
    });
    const [, written1] = mockWriteFileSync.mock.calls[0] as [unknown, string];
    const state1 = JSON.parse(written1);

    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify(state1));
    emitAlert('/root', 'sprint-282', {
      type: 'boundary_violation',
      message: 'file outside scope',
      source: 'auditor:boundary_checker',
    });

    const [, written2] = mockWriteFileSync.mock.calls[0] as [unknown, string];
    const state2 = JSON.parse(written2);
    expect(state2.alerts).toHaveLength(2);
    expect(state2.alerts.map((a: Alert) => a.source)).toContain('auditor:stale_md_detector');
    expect(state2.alerts.map((a: Alert) => a.source)).toContain('auditor:boundary_checker');
  });

  it('59 repeated calls result in exactly 1 dashboard entry with count=59', () => {
    let currentState = makeDashboard([]);
    mockExistsSync.mockReturnValue(true);

    for (let i = 0; i < 59; i++) {
      mockReadFileSync.mockReturnValueOnce(JSON.stringify(currentState));
      emitAlert('/root', 'sprint-282', {
        type: 'stale_md',
        message: `CLAUDE.md stale (scan ${i})`,
        source: 'auditor:stale_md_detector',
      });
      const calls = mockWriteFileSync.mock.calls;
      const [, lastWritten] = calls[calls.length - 1] as [unknown, string];
      currentState = JSON.parse(lastWritten);
    }

    expect(currentState.alerts).toHaveLength(1);
    expect((currentState.alerts[0] as Alert & { count?: number }).count).toBe(59);
  });
});

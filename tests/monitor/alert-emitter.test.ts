// tests/monitor/alert-emitter.test.ts
// Sprint 166 T9 — emitAlert helper unit tests
// ADR-003: vitest over Jest

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
import { writeEvent } from '../../src/orchestra/event-stream.js';
import { emitAlert, deduplicateAlert } from '../../src/monitor/alert-emitter.js';
import { AlertLevel } from '../../src/core/types.js';
import type { Alert } from '../../src/core/types.js';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockWriteEvent = vi.mocked(writeEvent);

const DASHBOARD_STATE = {
  sprint: { id: 'sprint-166', number: 166, phase: 'EXECUTE', status: 'RUNNING' },
  agents: [],
  progress: { done: 0, active: 1, blocked: 0, total: 3 },
  alerts: [],
  updatedAt: '2026-05-13T10:00:00.000Z',
};

// ─── Tests ───────────────────────────────────────────────────────────

describe('emitAlert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('appends alert to dashboard.json and emits to event stream', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(DASHBOARD_STATE));

    emitAlert('/root', 'sprint-166', {
      type: 'stale_md',
      message: 'CLAUDE.md is stale',
      source: 'auditor:stale_md_detector',
    });

    // dashboard.json was written with the new alert
    expect(mockWriteFileSync).toHaveBeenCalledOnce();
    const [, writtenContent] = mockWriteFileSync.mock.calls[0] as [unknown, string];
    const written = JSON.parse(writtenContent);
    expect(written.alerts).toHaveLength(1);
    expect(written.alerts[0].message).toBe('CLAUDE.md is stale');
    expect(written.alerts[0].source).toBe('auditor:stale_md_detector');

    // event stream was written
    expect(mockWriteEvent).toHaveBeenCalledOnce();
    const [, sprintArg, sourceArg, , channelArg] = mockWriteEvent.mock.calls[0] as [string, string, string, string, string];
    expect(sprintArg).toBe('sprint-166');
    expect(sourceArg).toBe('auditor');
    expect(channelArg).toBe('BRAIN→*:METRIC_EMITTED');
  });

  it('handles missing dashboard.json gracefully — only emits to event stream', () => {
    mockExistsSync.mockReturnValue(false);

    emitAlert('/root', 'sprint-166', {
      type: 'boundary_violation',
      message: 'file outside scope',
    });

    // dashboard.json not written (file did not exist)
    expect(mockWriteFileSync).not.toHaveBeenCalled();
    // event stream still called
    expect(mockWriteEvent).toHaveBeenCalledOnce();
  });

  it('provider parity — .codex .gemini .cursor rules all have paths frontmatter', async () => {
    const { readFileSync: realRead, existsSync: realExists } =
      await vi.importActual<typeof import('node:fs')>('node:fs');
    const { join: realJoin } =
      await vi.importActual<typeof import('node:path')>('node:path');

    const projectRoot = process.cwd();
    // rule-generator.ts:77-113 intentionally omits the `paths:` frontmatter
    // for .codex / .gemini / .cursor — Claude is the only provider whose
    // rule loader honours the frontmatter scope hint. The other three just
    // get plain markdown. Parity here means "file exists with the AUTO-START
    // marker", not "identical frontmatter". (Sprint 175 PR #16 CI dogfood.)
    //
    // Cursor uses the MDC format (`.mdc`) for Project Rules — plain `.md`
    // files are silently ignored by Cursor. See cursorAdapter.fileExt() in
    // src/core/rule-generator.ts:132-160. Sprint 190 alignment.
    const providers = [
      { dir: '.codex', ext: 'md' },
      { dir: '.gemini', ext: 'md' },
      { dir: '.cursor', ext: 'mdc' },
    ] as const;
    const ruleRoles = ['brain', 'auditor', 'worker-default'] as const;

    for (const { dir, ext } of providers) {
      for (const role of ruleRoles) {
        const fileName = `${role}.${ext}`;
        const fullPath = realJoin(projectRoot, dir, 'rules', fileName);
        if (!realExists(fullPath)) {
          throw new Error(`Missing rule file: ${dir}/rules/${fileName}`);
        }
        const content = realRead(fullPath, 'utf-8') as string;
        expect(
          content,
          `${dir}/rules/${fileName} must contain the AUTO-START marker`,
        ).toContain('<!-- AUTO-START -->');
      }
    }
  });
});

// ─── Divergence lock (321-003) ───────────────────────────────────────
// deduplicateAlert keys on `source` ONLY — this is the exact behavior that
// makes it INTENTIONALLY divergent from auditor.ts's deduplicateAlerts
// (which keys on `source + "::" + message`). Locking it here ensures a future
// "collapse the 3 dedup helpers" attempt fails loudly instead of silently
// flipping dedup semantics. See alert-emitter.ts doc-comment + sprint 319-010 NO_GO.

describe('deduplicateAlert — source-only identity (intentional divergence)', () => {
  it('merges same source + DIFFERENT message into one entry, refreshing the message', () => {
    const first: Alert = {
      level: AlertLevel.WARNING,
      message: 'CLAUDE.md stale (mtime t1)',
      source: 'auditor:stale_md_detector',
      timestamp: '2026-06-11T00:00:00.000Z',
    };
    const second: Alert & { lastSeenAt?: string; count?: number } = {
      level: AlertLevel.WARNING,
      message: 'CLAUDE.md stale (mtime t2)', // different message, SAME source
      source: 'auditor:stale_md_detector',
      timestamp: '2026-06-11T00:05:00.000Z',
      lastSeenAt: '2026-06-11T00:05:00.000Z',
      count: 1,
    };

    const afterFirst = deduplicateAlert([], first);
    const result = deduplicateAlert(afterFirst as Alert[], second);

    // source-only key ⇒ the differing message does NOT split the entry.
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(2);
    // message refreshed to the latest occurrence.
    expect(result[0].message).toBe('CLAUDE.md stale (mtime t2)');
    expect(result[0].lastSeenAt).toBe('2026-06-11T00:05:00.000Z');
  });
});

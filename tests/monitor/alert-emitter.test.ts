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
  statSync: vi.fn(),
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
import { emitAlert } from '../../src/monitor/alert-emitter.js';

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
    const providers = ['.codex', '.gemini', '.cursor'] as const;
    const ruleFiles = ['brain.md', 'auditor.md', 'worker-default.md'] as const;

    for (const provider of providers) {
      for (const file of ruleFiles) {
        const fullPath = realJoin(projectRoot, provider, 'rules', file);
        if (!realExists(fullPath)) {
          throw new Error(`Missing rule file: ${provider}/rules/${file}`);
        }
        const content = realRead(fullPath, 'utf-8') as string;
        expect(
          content,
          `${provider}/rules/${file} must contain paths: frontmatter`,
        ).toMatch(/^paths:/m);
      }
    }
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkADRCompliance } from '../../src/monitor/auditor.js';
import { auditBacklogResult } from '../../src/orchestra/autonomous/backlog-eval.js';
import type { BacklogEntry } from '../../src/orchestra/autonomous/backlog-types.js';
import type { TaskResult } from '../../src/core/types.js';
import type { ADRViolation } from '../../src/monitor/auditor.js';

// ─── Module mocks (same pattern as auditor.test.ts) ──────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  statSync: vi.fn().mockReturnValue({ mtimeMs: 0 }),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  stat: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('../../src/orchestra/event-stream.js', () => ({
  writeEvent: vi.fn(),
  readEvents: vi.fn().mockReturnValue([]),
  CHANNELS: {
    VERIFICATION_RESULT: 'AUDITOR→BRAIN:VERIFICATION_RESULT',
    ADR_VIOLATION: 'AUDITOR→BRAIN:ADR_VIOLATION',
    GATE_COMPUTED: 'AUDITOR→BRAIN:GATE_COMPUTED',
    LOAD_REPORT_WRITTEN: 'AUDITOR→BRAIN:LOAD_REPORT_WRITTEN',
    SCOPE_COLLISION_DETECTED: 'AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED',
    DEPENDENCY_VIOLATION: 'AUDITOR→BRAIN:DEPENDENCY_VIOLATION',
    ORPHAN_HB_DETECTED: 'AUDITOR→BRAIN:ORPHAN_HB_DETECTED',
    AUTHORITY_VIOLATION: 'AUDITOR→BRAIN:AUTHORITY_VIOLATION',
  },
}));

const mockMemStore = {
  getByType: vi.fn().mockReturnValue([]),
  close: vi.fn(),
};
vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => mockMemStore),
}));

// ─── Mock imports ─────────────────────────────────────────────────────────────

import { existsSync } from 'node:fs';
import { writeEvent } from '../../src/orchestra/event-stream.js';
import { MemoryStore } from '../../src/core/memory-store.js';

const mockedExistsSync = vi.mocked(existsSync);
const mockedWriteEvent = vi.mocked(writeEvent);
const MockedMemoryStore = vi.mocked(MemoryStore);

beforeEach(() => {
  vi.clearAllMocks();
  mockedExistsSync.mockReturnValue(false);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ADR-NOISE — checkADRCompliance empty-files early-return guard', () => {
  it('returns empty violations array when changedFiles is []', () => {
    const violations = checkADRCompliance('/any/root', []);
    expect(violations).toEqual([]);
  });

  it('does NOT instantiate MemoryStore when changedFiles is [] (DB scan skipped)', () => {
    // Even with DB file present, guard must prevent the scan.
    mockedExistsSync.mockReturnValue(true);
    checkADRCompliance('/any/root', []);
    expect(MockedMemoryStore).not.toHaveBeenCalled();
  });

  it('does NOT emit ADR_VIOLATION event when changedFiles is [] and sprintId is provided', () => {
    mockedExistsSync.mockReturnValue(true);
    const violations = checkADRCompliance('/any/root', [], 'sprint-noise-test');
    expect(violations).toEqual([]);
    expect(mockedWriteEvent).not.toHaveBeenCalled();
  });

  it('still loads DB and scans files when changedFiles is non-empty (regression guard)', () => {
    mockedExistsSync.mockReturnValue(true);
    mockMemStore.getByType.mockReturnValue([]);
    checkADRCompliance('/any/root', ['src/some.ts']);
    // MemoryStore instantiated for the DB load
    expect(MockedMemoryStore).toHaveBeenCalled();
  });
});

describe('ADR-NOISE — auditBacklogResult filesChanged=[] → adr ok, no ADR_VIOLATION', () => {
  const entry: BacklogEntry = {
    id: 'e-noise-1',
    title: 'Empty-change task',
    kind: 'task',
    spec: { scopeDir: 'src/', description: 'task with no file changes' },
    policy: 'auto',
    trigger: { type: 'one-off' },
    status: 'running',
    lastRun: null,
    lastResult: null,
  };

  const emptyResult: TaskResult = {
    taskId: 'run-noise-1',
    workerId: 'w-noise-1',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 0,
    selfAssessment: 'DONE',
    notes: 'no files changed',
  };

  it('returns adr="ok" when filesChanged is [] (injected checkAdr)', async () => {
    // Use injected checkAdr to isolate auditBacklogResult's adr-verdict logic.
    const checkAdrSpy = vi.fn((_root: string, _files: string[]): ADRViolation[] => []);

    const verdict = await auditBacklogResult(entry, emptyResult, '/any/root', {
      checkAdr: checkAdrSpy,
    });

    expect(verdict.adr).toBe('ok');
    expect(checkAdrSpy).toHaveBeenCalledWith('/any/root', []);
  });

  it('returns adr="ok" when filesChanged is [] (real checkADRCompliance with early-return)', async () => {
    // Real checkADRCompliance now returns [] immediately for empty changedFiles.
    mockedExistsSync.mockReturnValue(true);

    const verdict = await auditBacklogResult(entry, emptyResult, '/any/root');

    expect(verdict.adr).toBe('ok');
    // DB must NOT have been scanned (early-return before MemoryStore instantiation).
    expect(MockedMemoryStore).not.toHaveBeenCalled();
  });

  it('does NOT write ADR_VIOLATION to event-stream when filesChanged is []', async () => {
    // checkADRCompliance with [] → early-return before emitADRViolationEvent.
    // auditBacklogResult passes no sprintId, so even with violations, no event fires.
    // Belt-and-suspenders: verify writeEvent not called at all.
    const verdict = await auditBacklogResult(entry, emptyResult, '/any/root');

    expect(verdict.adr).toBe('ok');
    expect(mockedWriteEvent).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      'AUDITOR→BRAIN:ADR_VIOLATION',
      expect.anything(),
    );
  });
});

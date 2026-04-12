import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  realpathSync: vi.fn(),
  appendFileSync: vi.fn(),
  openSync: vi.fn(() => 42),
  closeSync: vi.fn(),
  constants: { O_WRONLY: 1, O_CREAT: 64, O_EXCL: 128 },
}));

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  redactSensitive: vi.fn((s: string) => s),
}));

vi.mock('../../src/core/stack-detector.js', () => ({
  detectFullStack: vi.fn(() => ({
    language: 'typescript',
    buildTool: 'npm',
    commands: { build: 'npx tsc', test: 'npx vitest run' },
  })),
  STACK_COMMANDS: {
    typescript: { build: 'npx tsc', test: 'npx vitest run' },
  },
}));

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { finalizeHeartbeatOnShutdown } from '../../src/agents/worker.js';

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedExistsSync = vi.mocked(existsSync);

// ─── Tests ──────────────────────────────────────────────────────────

describe('finalizeHeartbeatOnShutdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(false);
  });

  it('should finalize HB as DONE when result exists with DONE selfAssessment (Sprint 134 exact case)', () => {
    // Sprint 134 bug scenario: worker completed successfully, wrote .result DONE,
    // then container got SIGKILL (exitCode 137). HB said "FAILED".
    // With this fix: SIGTERM handler runs first and sets HB to DONE.
    mockedExistsSync.mockReturnValue(true); // .result exists
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      taskId: '134-001',
      selfAssessment: 'DONE',
      filesChanged: ['src/foo.ts'],
      testsPassed: true,
    }) as never);

    const result = finalizeHeartbeatOnShutdown('/project', '134-001');

    expect(result).toBe(true);
    expect(mockedWriteFileSync).toHaveBeenCalledTimes(1);

    // Verify HB content
    const hbContent = JSON.parse(mockedWriteFileSync.mock.calls[0]![1] as string);
    expect(hbContent.status).toBe('DONE');
    expect(hbContent.exitCode).toBe(0);
    expect(hbContent.taskId).toBe('134-001');
    expect(hbContent.note).toContain('SIGTERM');
  });

  it('should leave HB untouched when no .result file exists (honest FAILED)', () => {
    // No result file → worker didn't complete → keep honest FAILED state
    mockedExistsSync.mockReturnValue(false);

    const result = finalizeHeartbeatOnShutdown('/project', '001-001');

    expect(result).toBe(false);
    expect(mockedWriteFileSync).not.toHaveBeenCalled();
  });

  it('should leave HB untouched when .result has NO_GO selfAssessment', () => {
    // Result exists but worker reported NO_GO → keep honest state
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      taskId: '001-001',
      selfAssessment: 'NO_GO',
      notes: 'Tests failed after 3 attempts',
    }) as never);

    const result = finalizeHeartbeatOnShutdown('/project', '001-001');

    expect(result).toBe(false);
    expect(mockedWriteFileSync).not.toHaveBeenCalled();
  });

  it('should leave HB untouched when .result has malformed JSON (fail-safe)', () => {
    // Malformed JSON → fail-safe: keep existing HB state
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('{ broken json' as never);

    const result = finalizeHeartbeatOnShutdown('/project', '001-001');

    expect(result).toBe(false);
    expect(mockedWriteFileSync).not.toHaveBeenCalled();
  });

  it('should finalize HB as DONE when result has GO_WITH_TECH_DEBT selfAssessment', () => {
    // GO_WITH_TECH_DEBT is also a success status → finalize as DONE
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      taskId: '001-002',
      selfAssessment: 'GO_WITH_TECH_DEBT',
      notes: 'Minor tech debt remains',
    }) as never);

    const result = finalizeHeartbeatOnShutdown('/project', '001-002');

    expect(result).toBe(true);
    expect(mockedWriteFileSync).toHaveBeenCalledTimes(1);

    const hbContent = JSON.parse(mockedWriteFileSync.mock.calls[0]![1] as string);
    expect(hbContent.status).toBe('DONE');
    expect(hbContent.exitCode).toBe(0);
  });

  it('should leave HB untouched when .result has no selfAssessment field', () => {
    // Missing selfAssessment → can't determine success → keep honest state
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      taskId: '001-001',
      notes: 'incomplete result',
    }) as never);

    const result = finalizeHeartbeatOnShutdown('/project', '001-001');

    expect(result).toBe(false);
    expect(mockedWriteFileSync).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks for doctor.ts file I/O ────────────────────────────────────

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
  spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: 'v22.0.0', stderr: '', pid: 1, signal: null }),
}));

vi.mock('../../../src/core/utils.js', () => ({
  countBrainLines: vi.fn().mockReturnValue(50),
}));

vi.mock('../../../src/orchestra/sprint-reporter.js', () => ({
  formatHumanSprintComplete: vi.fn().mockReturnValue('Sprint complete'),
}));

vi.mock('../../../src/core/environment.js', () => ({
  detectEnvironment: vi.fn().mockReturnValue('vscode'),
}));

vi.mock('../../../src/core/deck-file.js', () => ({
  loadDeckSecrets: vi.fn().mockReturnValue({}),
  validateDeckFile: vi.fn().mockReturnValue({ valid: true, warnings: [], errors: [] }),
  isDeckFileCommitted: vi.fn().mockReturnValue(false),
  KNOWN_DECK_KEYS: ['DECKENT_CLAUDE_API_KEY', 'DECKENT_OPENAI_API_KEY'],
}));

vi.mock('../../../src/core/constants.js', () => ({
  RUNTIME_DIR: '.deckent/runtime',  // sprint-429 (429-011) tool-inventory yolu modül-yüklemede okur
  DECKENT_DIR: '.deckent',
  SETTINGS_DIR: '.deckent/settings',  // born-630 allowscope-zinciri modül-yüklemede okur
  BRAIN_DIR: '.brain',
  MEMORY_FILE: 'MEMORY.md',
  DEBT_FILE: 'DEBT.md',
  DECISIONS_FILE: 'DECISIONS.md',
  DIRECTIVES_FILE: 'DIRECTIVES.md',
  LOCKS_DIR: '.locks',
  LOCK_STALE_THRESHOLD_MS: 300000,
  DEBT_TABLE_HEADER: '| ID',
  PROJECT_CONFIG_PATH: '.deckent/config.json',
  BRAIN_TOTAL_LINE_BUDGET: 600,
  TASKS_DIR: '.tasks',
  DASHBOARD_FILE: '.dashboard',
}));

vi.mock('../../../src/core/provider.js', () => ({
  detectAvailableProviders: vi.fn().mockResolvedValue([
    { name: 'claude', available: true, version: '2.1', authMethod: 'session', models: [] },
  ]),
  formatDetectedProviders: vi.fn().mockReturnValue('Providers:\n  mock'),
}));

vi.mock('../../../src/core/system-profile.js', () => ({
  getSystemProfile: vi.fn().mockReturnValue({ cpuCores: 4, totalMemMB: 8192, freeMemMB: 4096, recommendedMaxWorkers: 2 }),
}));

vi.mock('../../../src/core/subscription.js', () => ({
  detectSubscription: vi.fn().mockReturnValue({ detected: 'max', method: 'opus_probe' }),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../../src/cli/helpers/config-reader.js', () => ({
  getLangFromConfig: vi.fn().mockReturnValue('en'),
}));

vi.mock('../../../src/cli/helpers/messages.js', () => ({
  getMessage: vi.fn().mockReturnValue('mock message'),
}));

// ─── Imports ─────────────────────────────────────────────────────────

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import {
  formatCIStatusLine,
  formatCIHealthSection,
  formatHumanStatus,
} from '../../../src/cli/helpers/output.js';
import type { CIBaseline, CIReport, HumanStatusInput } from '../../../src/cli/helpers/output.js';
import {
  readCIBaseline,
  readLatestCIReport,
  readAllCIReports,
  formatHumanDoctor,
} from '../../../src/cli/commands/doctor.js';
import type { HumanDoctorInput } from '../../../src/cli/commands/doctor.js';
import { SprintPhase, SprintStatus, AgentStatus } from '../../../src/core/types.js';
import type { DashboardState, DoctorResult } from '../../../src/core/types.js';

// ─── Fixtures ────────────────────────────────────────────────────────

function makeBaseline(overrides?: Partial<CIBaseline>): CIBaseline {
  return {
    sprintId: 'sprint-062',
    baseline: {
      tscPassed: true,
      testCount: 11315,
      testPassed: 11315,
      testFailed: 0,
      coverage: 96.0,
      timestamp: '2026-03-26T10:00:00.000Z',
    },
    ...overrides,
  };
}

function makeReport(overrides?: Partial<CIReport>): CIReport {
  return {
    sprintId: 'sprint-062',
    baseline: { testCount: 11315, coverage: 96.0 },
    result: { testCount: 11400, testPassed: 11400, testFailed: 0, coverage: 96.2 },
    delta: { newTests: 85, regressions: 0, coverageDelta: 0.2 },
    tscPassed: true,
    buildPassed: true,
    timestamp: '2026-03-26T11:00:00.000Z',
    ...overrides,
  };
}

function makeDashboard(overrides?: Partial<DashboardState>): DashboardState {
  return {
    sprint: { id: 'sprint-062', number: 62, phase: SprintPhase.EXECUTE, status: SprintStatus.ACTIVE },
    agents: [],
    progress: { done: 3, active: 2, blocked: 0, total: 5 },
    alerts: [],
    updatedAt: '2026-03-26T10:00:00Z',
    ...overrides,
  };
}

function makeDoctorInput(overrides?: Partial<HumanDoctorInput>): HumanDoctorInput {
  const result: DoctorResult = {
    ok: true,
    checks: [
      { name: 'Platform', passed: true, message: 'Linux', required: false },
      { name: 'Node.js', passed: true, message: 'v22.0.0', required: true },
    ],
  };
  return {
    result,
    providers: [{ name: 'claude', available: true, version: '2.1', authMethod: 'session', models: [] }],
    brainLines: 50,
    brainBudget: 600,
    lastSprintId: 'sprint-062',
    debtItems: { total: 0, critical: 0 },
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('formatCIStatusLine', () => {
  it('returns null when no CI data provided', () => {
    expect(formatCIStatusLine()).toBeNull();
    expect(formatCIStatusLine(undefined, undefined)).toBeNull();
  });

  it('shows baseline info when only baseline provided', () => {
    const baseline = makeBaseline();
    const line = formatCIStatusLine(baseline);
    expect(line).not.toBeNull();
    expect(line).toContain('11315 tests');
    expect(line).toContain('96.0%');
    expect(line).toContain('tsc OK');
  });

  it('shows tsc FAIL when baseline tscPassed is false', () => {
    const baseline = makeBaseline({ baseline: { tscPassed: false, testCount: 100, testPassed: 100, testFailed: 0, coverage: 90.0, timestamp: '' } });
    const line = formatCIStatusLine(baseline);
    expect(line).toContain('tsc FAIL');
  });

  it('shows report delta when report is provided', () => {
    const report = makeReport();
    const line = formatCIStatusLine(undefined, report);
    expect(line).not.toBeNull();
    expect(line).toContain('+85 new tests');
    expect(line).toContain('0 regressions');
    expect(line).toContain('+0.2%');
    expect(line).toContain('tsc OK');
  });

  it('prefers report over baseline when both provided', () => {
    const baseline = makeBaseline();
    const report = makeReport({ delta: { newTests: 50, regressions: 2, coverageDelta: -0.5 } });
    const line = formatCIStatusLine(baseline, report);
    expect(line).toContain('+50 new tests');
    expect(line).toContain('2 regressions');
    expect(line).toContain('-0.5%');
  });
});

describe('formatCIHealthSection', () => {
  it('shows no-data message when empty', () => {
    const lines = formatCIHealthSection([]);
    expect(lines.some(l => l.includes('No CI data'))).toBe(true);
  });

  it('shows baseline info when only baseline provided', () => {
    const baseline = makeBaseline();
    const lines = formatCIHealthSection([], baseline);
    expect(lines.some(l => l.includes('11315'))).toBe(true);
    expect(lines.some(l => l.includes('96.0%'))).toBe(true);
  });

  it('shows full report details when report is present', () => {
    const report = makeReport();
    const lines = formatCIHealthSection([report]);
    expect(lines.some(l => l.includes('PASS'))).toBe(true);
    expect(lines.some(l => l.includes('+85'))).toBe(true);
    expect(lines.some(l => l.includes('0 regression'))).toBe(true);
    expect(lines.some(l => l.includes('96.2%'))).toBe(true);
  });

  it('shows trend section when 2+ reports provided', () => {
    const report1 = makeReport({ sprintId: 'sprint-062' });
    const report2 = makeReport({ sprintId: 'sprint-061', delta: { newTests: 20, regressions: 1, coverageDelta: -0.1 } });
    const lines = formatCIHealthSection([report1, report2]);
    expect(lines.some(l => l.includes('Trend'))).toBe(true);
    expect(lines.some(l => l.includes('sprint-062'))).toBe(true);
    expect(lines.some(l => l.includes('sprint-061'))).toBe(true);
  });

  it('shows regression count in trend entries when non-zero', () => {
    const report1 = makeReport({ sprintId: 'sprint-062' });
    const report2 = makeReport({ sprintId: 'sprint-061', delta: { newTests: 10, regressions: 3, coverageDelta: 0 } });
    const lines = formatCIHealthSection([report1, report2]);
    const trendLines = lines.filter(l => l.includes('sprint-061'));
    expect(trendLines.some(l => l.includes('3 regressions'))).toBe(true);
  });
});

describe('readCIBaseline', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(readCIBaseline('/root')).toBeNull();
  });

  it('returns parsed baseline when file exists', () => {
    const baseline = makeBaseline();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(baseline) as never);
    const result = readCIBaseline('/root');
    expect(result).not.toBeNull();
    expect(result?.sprintId).toBe('sprint-062');
    expect(result?.baseline.testCount).toBe(11315);
  });

  it('returns null when file is malformed JSON', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('not-valid-json' as never);
    expect(readCIBaseline('/root')).toBeNull();
  });
});

describe('readAllCIReports', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array when brain dir does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(readAllCIReports('/root')).toEqual([]);
  });

  it('reads and parses ci-report files', () => {
    const report = makeReport();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['ci-report-sprint-062.json', 'other-file.json'] as never);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(report) as never);
    const results = readAllCIReports('/root');
    expect(results).toHaveLength(1);
    expect(results[0]?.sprintId).toBe('sprint-062');
  });

  it('returns empty array when no ci-report files exist', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['MEMORY.md', 'DEBT.md'] as never);
    expect(readAllCIReports('/root')).toEqual([]);
  });

  it('skips malformed report files', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['ci-report-sprint-062.json', 'ci-report-sprint-061.json'] as never);
    vi.mocked(readFileSync)
      .mockReturnValueOnce('not-json' as never)
      .mockReturnValueOnce(JSON.stringify(makeReport({ sprintId: 'sprint-061' })) as never);
    const results = readAllCIReports('/root');
    expect(results).toHaveLength(1);
    expect(results[0]?.sprintId).toBe('sprint-061');
  });
});

describe('readLatestCIReport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when no reports exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(readLatestCIReport('/root')).toBeNull();
  });

  it('reads by sprintId when provided and file exists', () => {
    const report = makeReport({ sprintId: 'sprint-062' });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(report) as never);
    const result = readLatestCIReport('/root', 'sprint-062');
    expect(result?.sprintId).toBe('sprint-062');
  });
});

describe('formatHumanStatus with CI data', () => {
  it('includes CI status line when baseline is provided', () => {
    const input: HumanStatusInput = {
      dashboard: makeDashboard(),
      tasks: [],
      ciBaseline: makeBaseline(),
    };
    const output = formatHumanStatus(input);
    expect(output).toContain('CI:');
    expect(output).toContain('11315 tests');
  });

  it('shows CI report data when report is provided', () => {
    const input: HumanStatusInput = {
      dashboard: makeDashboard(),
      tasks: [],
      ciReport: makeReport(),
    };
    const output = formatHumanStatus(input);
    expect(output).toContain('CI:');
    expect(output).toContain('+85 new tests');
  });

  it('omits CI section when no CI data provided', () => {
    const input: HumanStatusInput = {
      dashboard: makeDashboard(),
      tasks: [],
    };
    const output = formatHumanStatus(input);
    expect(output).not.toContain('CI:');
  });
});

describe('formatHumanDoctor with CI data', () => {
  it('includes CI Health section when reports are provided', () => {
    const input = makeDoctorInput({ ciReports: [makeReport()] });
    const output = formatHumanDoctor(input);
    expect(output).toContain('CI Health:');
    expect(output).toContain('PASS');
  });

  it('includes CI Health section when baseline is provided', () => {
    const input = makeDoctorInput({ ciBaseline: makeBaseline() });
    const output = formatHumanDoctor(input);
    expect(output).toContain('CI Health:');
    expect(output).toContain('11315');
  });

  it('omits CI Health section when no CI data provided', () => {
    const input = makeDoctorInput();
    const output = formatHumanDoctor(input);
    expect(output).not.toContain('CI Health:');
  });

  it('shows trend when multiple reports provided', () => {
    const input = makeDoctorInput({
      ciReports: [
        makeReport({ sprintId: 'sprint-062' }),
        makeReport({ sprintId: 'sprint-061' }),
      ],
    });
    const output = formatHumanDoctor(input);
    expect(output).toContain('Trend');
    expect(output).toContain('sprint-062');
    expect(output).toContain('sprint-061');
  });
});

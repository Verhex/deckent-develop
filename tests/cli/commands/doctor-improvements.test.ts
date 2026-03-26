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

vi.mock('../../../src/core/subscription.js', () => ({
  detectSubscription: vi.fn().mockReturnValue({ detected: 'max', opusAvailable: true, testedAt: '', method: 'opus_probe' }),
  checkModeCompatibility: vi.fn().mockReturnValue(null),
}));

vi.mock('../../../src/core/provider.js', () => ({
  detectAvailableProviders: vi.fn().mockResolvedValue([]),
  formatDetectedProviders: vi.fn().mockReturnValue(''),
}));

vi.mock('../../../src/core/environment.js', () => ({
  detectEnvironment: vi.fn().mockReturnValue('vscode'),
}));

vi.mock('../../../src/core/deck-file.js', () => ({
  loadDeckSecrets: vi.fn().mockReturnValue({}),
  validateDeckFile: vi.fn().mockReturnValue({ valid: true, warnings: [], errors: [] }),
  isDeckFileCommitted: vi.fn().mockReturnValue(false),
  KNOWN_DECK_KEYS: ['DECKENT_CLAUDE_API_KEY', 'DECKENT_OPENAI_API_KEY', 'DECKENT_GOOGLE_API_KEY'],
}));

vi.mock('../../../src/core/utils.js', () => ({
  countBrainLines: vi.fn().mockReturnValue(50),
}));

vi.mock('../../../src/core/constants.js', () => ({
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
  BRAIN_TOTAL_LINE_BUDGET: 600,
}));

import { readFileSync, existsSync, accessSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { detectSubscription, checkModeCompatibility } from '../../../src/core/subscription.js';
import { isDeckFileCommitted } from '../../../src/core/deck-file.js';
import {
  formatHumanDoctor,
  checkSubscriptionMode,
  runDoctorChecks,
} from '../../../src/cli/commands/doctor.js';

function makeSpawnResult(status: number, stdout: string) {
  return { status, stdout, stderr: '', pid: 1, signal: null, output: [] };
}

// ─── A) Memory Deduplication Tests ───────────────────────────────────

describe('A) formatHumanDoctor - no System Health duplication', () => {
  it('output does NOT contain "System Health:" section', () => {
    const input = {
      result: { ok: true, checks: [] },
      providers: [],
      brainLines: 100,
      brainBudget: 600,
      lastSprintId: 'sprint-010',
      debtItems: { total: 3, critical: 0 },
    };
    const output = formatHumanDoctor(input);
    expect(output).not.toContain('System Health:');
  });

  it('"Your Project" still shows debt info when present', () => {
    const input = {
      result: { ok: true, checks: [] },
      providers: [],
      brainLines: 100,
      brainBudget: 600,
      lastSprintId: null,
      debtItems: { total: 5, critical: 1 },
    };
    const output = formatHumanDoctor(input);
    expect(output).toContain('1 critical');
    expect(output).toContain('4 open debt items');
  });

  it('"Your Project" shows last sprint when present', () => {
    const input = {
      result: { ok: true, checks: [] },
      providers: [],
      brainLines: 100,
      brainBudget: 600,
      lastSprintId: 'sprint-042',
      debtItems: { total: 0, critical: 0 },
    };
    const output = formatHumanDoctor(input);
    expect(output).toContain('sprint-042');
    expect(output).not.toContain('System Health:');
  });

  it('memory budget appears only once in output', () => {
    const input = {
      result: { ok: true, checks: [] },
      providers: [],
      brainLines: 300,
      brainBudget: 600,
      lastSprintId: null,
      debtItems: { total: 0, critical: 0 },
    };
    const output = formatHumanDoctor(input);
    const memoryOccurrences = (output.match(/Memory:/g) ?? []).length;
    expect(memoryOccurrences).toBe(1);
  });
});

// ─── B) Debt Cache Tests ─────────────────────────────────────────────

describe('B) runDoctorChecks - precomputed debt avoids double-read', () => {
  beforeEach(() => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, 'v22.0.0') as ReturnType<typeof spawnSync>);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('# Directives content' as unknown as ReturnType<typeof readFileSync>);
    vi.mocked(accessSync).mockReturnValue(undefined);
    vi.mocked(isDeckFileCommitted).mockReturnValue(false);
    vi.mocked(detectSubscription).mockReturnValue({ detected: 'unknown', opusAvailable: false, testedAt: '', method: 'cli_missing' });
  });

  it('accepts precomputedDebt parameter and uses it for Debt check', () => {
    const precomputed = { total: 3, critical: 1 };
    const result = runDoctorChecks('/mock/root', undefined, precomputed);
    const debtCheck = result.checks.find(c => c.name === 'Debt');
    expect(debtCheck).toBeDefined();
    expect(debtCheck!.passed).toBe(false);
    expect(debtCheck!.message).toContain('CRITICAL');
  });

  it('uses countDebtItems internally when precomputedDebt not provided', () => {
    // readFileSync returns non-JSON — countDebtItems returns {total:0, critical:0}
    const result = runDoctorChecks('/mock/root');
    const debtCheck = result.checks.find(c => c.name === 'Debt');
    expect(debtCheck).toBeDefined();
    expect(debtCheck!.passed).toBe(true); // No critical debt
  });

  it('precomputed zero debt shows no-debt message', () => {
    const result = runDoctorChecks('/mock/root', undefined, { total: 0, critical: 0 });
    const debtCheck = result.checks.find(c => c.name === 'Debt');
    expect(debtCheck!.passed).toBe(true);
    expect(debtCheck!.message).toContain('No debt');
  });
});

// ─── C) ErrorRegistry Consistency Tests ──────────────────────────────

describe('C) checks use ErrorRegistry suggestions', () => {
  beforeEach(() => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, 'v22.0.0') as ReturnType<typeof spawnSync>);
    vi.mocked(existsSync).mockReturnValue(false); // workspace not found
    vi.mocked(readFileSync).mockReturnValue('# Content' as unknown as ReturnType<typeof readFileSync>);
    vi.mocked(accessSync).mockReturnValue(undefined);
    vi.mocked(isDeckFileCommitted).mockReturnValue(false);
    vi.mocked(detectSubscription).mockReturnValue({ detected: 'unknown', opusAvailable: false, testedAt: '', method: 'cli_missing' });
  });

  it('checkWorkspace failure message contains deckent init suggestion', () => {
    const result = runDoctorChecks('/mock/root');
    const wsCheck = result.checks.find(c => c.name === 'Workspace');
    expect(wsCheck).toBeDefined();
    expect(wsCheck!.passed).toBe(false);
    // ErrorRegistry E020 suggestion mentions deckent init
    expect(wsCheck!.message).toMatch(/init/i);
  });

  it('checkStaleLocks failure message uses ErrorRegistry suggestion', async () => {
    const { readdirSync } = await import('node:fs');
    // Make locks exist and stale
    vi.mocked(existsSync).mockImplementation((p: string) => {
      return String(p).includes('.locks');
    });
    const staleEntry = JSON.stringify({ acquiredAt: new Date(Date.now() - 600000).toISOString() });
    vi.mocked(readFileSync).mockReturnValue(staleEntry as unknown as ReturnType<typeof readFileSync>);
    vi.mocked(readdirSync).mockReturnValue(['old.lock'] as unknown as ReturnType<typeof readdirSync>);

    const result = runDoctorChecks('/mock/root');
    const lockCheck = result.checks.find(c => c.name === 'Locks');
    expect(lockCheck).toBeDefined();
    if (lockCheck && !lockCheck.passed) {
      // ErrorRegistry E006 suggestion mentions cleanup
      expect(lockCheck.message).toMatch(/cleanup/i);
    }
  });
});

// ─── D) Write Permissions Already Present ─────────────────────────────

describe('D) checkWritePermissions is included in runDoctorChecks', () => {
  beforeEach(() => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, 'v22.0.0') as ReturnType<typeof spawnSync>);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('# Content' as unknown as ReturnType<typeof readFileSync>);
    vi.mocked(accessSync).mockReturnValue(undefined);
    vi.mocked(isDeckFileCommitted).mockReturnValue(false);
    vi.mocked(detectSubscription).mockReturnValue({ detected: 'unknown', opusAvailable: false, testedAt: '', method: 'cli_missing' });
  });

  it('runDoctorChecks includes Write Permissions check', () => {
    const result = runDoctorChecks('/mock/root');
    const wpCheck = result.checks.find(c => c.name === 'Write Permissions');
    expect(wpCheck).toBeDefined();
  });

  it('Write Permissions check passes when directories are writable', () => {
    vi.mocked(accessSync).mockReturnValue(undefined);
    const result = runDoctorChecks('/mock/root');
    const wpCheck = result.checks.find(c => c.name === 'Write Permissions');
    expect(wpCheck!.passed).toBe(true);
  });

  it('Write Permissions check fails when directory is not writable', () => {
    vi.mocked(accessSync).mockImplementation(() => {
      throw new Error('EACCES');
    });
    const result = runDoctorChecks('/mock/root');
    const wpCheck = result.checks.find(c => c.name === 'Write Permissions');
    expect(wpCheck!.passed).toBe(false);
    expect(wpCheck!.message).toContain('No write access');
  });
});

// ─── E) Subscription Mode Compatibility Tests ─────────────────────────

describe('E) checkSubscriptionMode', () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockReturnValue('{}' as unknown as ReturnType<typeof readFileSync>);
    vi.mocked(detectSubscription).mockReturnValue({ detected: 'max', opusAvailable: true, testedAt: '', method: 'opus_probe' });
    vi.mocked(checkModeCompatibility).mockReturnValue(null);
  });

  it('returns passed check when config file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const check = checkSubscriptionMode('/mock/root');
    expect(check.passed).toBe(true);
    expect(check.message).toMatch(/skip/i);
  });

  it('returns passed check when config has no mode field', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('{}' as unknown as ReturnType<typeof readFileSync>);
    const check = checkSubscriptionMode('/mock/root');
    expect(check.passed).toBe(true);
    expect(check.message).toMatch(/No mode/i);
  });

  it('returns passed check for pro_plan without probing subscription', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ mode: 'pro_plan' }) as unknown as ReturnType<typeof readFileSync>);
    const check = checkSubscriptionMode('/mock/root');
    expect(check.passed).toBe(true);
    expect(detectSubscription).not.toHaveBeenCalled();
    expect(check.message).toContain('"pro_plan"');
  });

  it('returns passed check for api mode without probing subscription', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ mode: 'api' }) as unknown as ReturnType<typeof readFileSync>);
    const check = checkSubscriptionMode('/mock/root');
    expect(check.passed).toBe(true);
    expect(detectSubscription).not.toHaveBeenCalled();
  });

  it('probes subscription for max_plan mode', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ mode: 'max_plan' }) as unknown as ReturnType<typeof readFileSync>);
    vi.mocked(detectSubscription).mockReturnValue({ detected: 'max', opusAvailable: true, testedAt: '', method: 'opus_probe' });
    vi.mocked(checkModeCompatibility).mockReturnValue(null);
    const check = checkSubscriptionMode('/mock/root');
    expect(detectSubscription).toHaveBeenCalled();
    expect(check.passed).toBe(true);
  });

  it('returns failed check when max_plan used with pro subscription', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ mode: 'max_plan' }) as unknown as ReturnType<typeof readFileSync>);
    vi.mocked(detectSubscription).mockReturnValue({ detected: 'pro', opusAvailable: false, testedAt: '', method: 'opus_probe' });
    vi.mocked(checkModeCompatibility).mockReturnValue('Warning: Config mode "max_plan" requires Max subscription, but only Pro was detected.');
    const check = checkSubscriptionMode('/mock/root');
    expect(check.passed).toBe(false);
    expect(check.message).toMatch(/Max subscription/i);
  });

  it('runDoctorChecks includes Subscription Mode check', () => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, 'v22.0.0') as ReturnType<typeof spawnSync>);
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockReturnValue('# content' as unknown as ReturnType<typeof readFileSync>);
    vi.mocked(accessSync).mockReturnValue(undefined);
    vi.mocked(isDeckFileCommitted).mockReturnValue(false);
    const result = runDoctorChecks('/mock/root');
    const smCheck = result.checks.find(c => c.name === 'Subscription Mode');
    expect(smCheck).toBeDefined();
  });

  it('returns passed check when config JSON is invalid', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('invalid json{{{' as unknown as ReturnType<typeof readFileSync>);
    const check = checkSubscriptionMode('/mock/root');
    expect(check.passed).toBe(true);
    expect(check.message).toMatch(/unreadable|skip/i);
  });
});

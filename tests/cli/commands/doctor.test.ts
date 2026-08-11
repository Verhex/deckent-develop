import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { createRequire } from 'node:module';

// Row 450: checkNode derives its floor from the manifest engines.node at
// runtime, so the "passing" fixture must track the same source dynamically —
// a literal here would re-create the exact duplicated-floor drift the row
// closes. node:module is not mocked below, so this read stays real.
const enginesNode = (createRequire(import.meta.url)('../../../package.json') as {
  engines: { node: string };
}).engines.node;
const PASSING_NODE_VERSION = `v${parseInt(enginesNode.match(/(\d+)/)?.[1] ?? '0', 10)}.0.0`;

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
  spawn: vi.fn(),
  execSync: vi.fn().mockReturnValue(''),
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  formatDoctorResult: vi.fn().mockReturnValue('Doctor Output'),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../../src/core/utils.js', () => ({}));

vi.mock('../../../src/core/system-profile.js', () => ({
  getSystemProfile: vi.fn().mockReturnValue({
    cpuCores: 8,
    totalMemMB: 16384,
    freeMemMB: 8192,
    recommendedMaxWorkers: 4,
  }),
}));

vi.mock('../../../src/core/subscription.js', () => ({
  detectSubscription: vi.fn().mockReturnValue({
    detected: 'max',
    method: 'opus_probe',
  }),
}));

vi.mock('../../../src/core/provider.js', () => ({
  detectAvailableProviders: vi.fn().mockResolvedValue([
    { name: 'claude', available: true, version: '2.1', authMethod: 'session', models: [] },
    { name: 'codex', available: false, authMethod: 'none', models: [] },
    { name: 'gemini', available: false, authMethod: 'none', models: [] },
  ]),
  formatDetectedProviders: vi.fn().mockReturnValue('Providers:\n  mock'),
  // Sprint 192 Task 192-007: doctor-checks.ts:runProviderDiagnostics is built on
  // top of this `runProviderDiagnostics` re-export — mocking it lets the Ollama
  // wrapper test run without spawning real adapters.
  runProviderDiagnostics: vi.fn().mockResolvedValue([
    { name: 'claude', binaryFound: true, version: '2.1', versionStatus: 'ok', authMethod: 'session', authStatus: 'ok', available: true, partial: false, models: [], reason: 'ok', hints: [] },
    { name: 'codex', binaryFound: false, versionStatus: 'missing', authMethod: 'none', authStatus: 'missing', available: false, partial: false, models: [], reason: 'missing', hints: [] },
    { name: 'gemini', binaryFound: false, versionStatus: 'missing', authMethod: 'none', authStatus: 'missing', available: false, partial: false, models: [], reason: 'missing', hints: [] },
  ]),
}));

vi.mock('../../../src/core/environment.js', () => ({
  detectEnvironment: vi.fn().mockReturnValue('vscode'),
}));

vi.mock('../../../src/cli/commands/provider-authority.js', () => ({
  readKeyringState: vi.fn().mockReturnValue({
    state: 'present',
    snapshot: { revision: 7 },
  }),
}));

vi.mock('../../../src/core/deck-file.js', () => ({
  loadDeckSecrets: vi.fn().mockReturnValue({}),
  validateDeckFile: vi.fn().mockReturnValue({ valid: true, warnings: [], errors: [] }),
  isDeckFileCommitted: vi.fn().mockReturnValue(false),
  KNOWN_DECK_KEYS: [
    'DECKENT_CLAUDE_API_KEY', 'DECKENT_OPENAI_API_KEY', 'DECKENT_GOOGLE_API_KEY',
    'DECKENT_SMTP_HOST', 'DECKENT_SMTP_USER', 'DECKENT_SMTP_PASS',
    'DECKENT_WEBHOOK_URL', 'DECKENT_DB_URL', 'DECKENT_TELEMETRY_ID',
  ],
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
  TASKS_DIR: '.tasks',  // FAZ4B: spawn-backend-docker.ts import zinciri modül-yüklemede okur
  LOCK_STALE_THRESHOLD_MS: 300000,
  DEBT_TABLE_HEADER: '| ID',
  PROJECT_CONFIG_PATH: '.deckent/config.json',
  BRAIN_TOTAL_LINE_BUDGET: 600,
  MEMORY_DB_FILE: 'memory.db',
}));

const mockMemoryStore = {
  totalCount: vi.fn().mockReturnValue(50),
  getByType: vi.fn().mockReturnValue([]),
  close: vi.fn(),
};
vi.mock('../../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => mockMemoryStore),
}));

import { readFileSync, existsSync, readdirSync, accessSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { platform } from 'node:os';
import { print, formatDoctorResult } from '../../../src/cli/helpers/output.js';
import { resolveProjectRoot } from '../../../src/cli/helpers/process.js';
// countBrainLines removed — doctor.ts now uses MemoryStore
import { getSystemProfile } from '../../../src/core/system-profile.js';
import { detectSubscription } from '../../../src/core/subscription.js';
import {
  registerDoctor, runDoctorChecks, formatSystemProfile, checkPlatform, isRunningInWSL,
  formatHumanDoctor, getLastSprintId, countDebtItems, getProviderTips,
  getMemoryHealthLabel, getProviderSummary, getReadinessLabel,
  getDeckFileStatus, formatProviderHealthSection,
  getProviderInstallHint, buildConnectorHealthResults, formatConnectorHealthLines,
  checkTmux, checkClaude, checkDeckSecurity, checkWritePermissions, checkGitignore,
  checkDocker,
} from '../../../src/cli/commands/doctor.js';
import type { HumanDoctorInput } from '../../../src/cli/commands/doctor.js';
import type { HealthCheckResult } from '../../../src/orchestra/connector.js';
import type { DetectedProvider } from '../../../src/core/provider.js';
import { detectEnvironment } from '../../../src/core/environment.js';
import { loadDeckSecrets, validateDeckFile, isDeckFileCommitted } from '../../../src/core/deck-file.js';
import { readKeyringState } from '../../../src/cli/commands/provider-authority.js';

// ─── Helper ──────────────────────────────────────────────────────────

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerDoctor(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride
  }
}

function makeSpawnResult(status: number, stdout: string) {
  return { status, stdout, stderr: '', pid: 1, signal: null, output: [] };
}

function makePassingKeyringCheck(): NonNullable<HumanDoctorInput['keyringCheck']> {
  return {
    name: 'Provider authority keyring',
    passed: true,
    message: 'Host keyring ready (revision 7)',
    required: true,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('registerDoctor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    // Default: all tools found, workspace exists, linux platform
    vi.mocked(platform).mockReturnValue('linux' as NodeJS.Platform);
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, PASSING_NODE_VERSION) as ReturnType<typeof spawnSync>);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as ReturnType<typeof readdirSync>);
    mockMemoryStore.totalCount.mockReturnValue(50);
    vi.mocked(readFileSync).mockReturnValue('# Directives content' as unknown as ReturnType<typeof readFileSync>);
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('registers the doctor command', async () => {
    const program = new Command();
    registerDoctor(program);
    const cmd = program.commands.find(c => c.name() === 'doctor');
    expect(cmd).toBeDefined();
  });

  it('registers --profile flag on doctor command', async () => {
    const program = new Command();
    registerDoctor(program);
    const cmd = program.commands.find(c => c.name() === 'doctor');
    expect(cmd).toBeDefined();
    const profileOption = cmd!.options.find(o => o.long === '--profile');
    expect(profileOption).toBeDefined();
  });

  it('has correct description for doctor command', async () => {
    const program = new Command();
    registerDoctor(program);
    const cmd = program.commands.find(c => c.name() === 'doctor');
    expect(cmd!.description()).toMatch(/check/i);
  });

  it('calls formatDoctorResult and print on --legacy run', async () => {
    await runCommand(['doctor', '--legacy']);
    expect(formatDoctorResult).toHaveBeenCalled();
    expect(print).toHaveBeenCalledWith('Doctor Output');
  });

  it('uses human-friendly format by default', async () => {
    await runCommand(['doctor']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.some(c => String(c).includes('Deckent Health Check'))).toBe(true);
  });

  it('injects the required provider-authority keyring check at the production boundary', async () => {
    vi.mocked(readKeyringState).mockReturnValueOnce({ state: 'absent' });

    await runCommand(['doctor']);

    expect(readKeyringState).toHaveBeenCalledTimes(1);
    const humanOutput = vi.mocked(print).mock.calls
      .map(call => String(call[0]))
      .find(value => value.includes('Deckent Health Check'));
    expect(humanOutput).toContain('Status: NOT READY');
    expect(humanOutput).toContain('Provider authority keyring');
  });

  it('does NOT show profile info without --profile flag', async () => {
    await runCommand(['doctor']);
    expect(getSystemProfile).not.toHaveBeenCalled();
    expect(detectSubscription).not.toHaveBeenCalled();
  });

  it('shows profile info when --profile flag is used', async () => {
    await runCommand(['doctor', '--profile']);
    expect(getSystemProfile).toHaveBeenCalled();
    expect(detectSubscription).toHaveBeenCalled();
  });

  it('uses resolveProjectRoot to determine project root', async () => {
    await runCommand(['doctor']);
    expect(resolveProjectRoot).toHaveBeenCalled();
  });

  it('falls back to process.cwd() if resolveProjectRoot throws', async () => {
    vi.mocked(resolveProjectRoot).mockImplementationOnce(() => { throw new Error('no root'); });
    await runCommand(['doctor']);
    // Should not throw, should still call print
    expect(print).toHaveBeenCalled();
  });
});

// ─── runDoctorChecks ─────────────────────────────────────────────────

describe('runDoctorChecks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    vi.mocked(platform).mockReturnValue('linux' as NodeJS.Platform);
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, PASSING_NODE_VERSION) as ReturnType<typeof spawnSync>);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as ReturnType<typeof readdirSync>);
    mockMemoryStore.totalCount.mockReturnValue(50);
    vi.mocked(readFileSync).mockReturnValue('# Directives content' as unknown as ReturnType<typeof readFileSync>);
  });

  it('returns DoctorResult with ok and checks array', () => {
    const result = runDoctorChecks('/mock/root');
    expect(result).toHaveProperty('ok');
    expect(result).toHaveProperty('checks');
    expect(Array.isArray(result.checks)).toBe(true);
  });

  it('includes node check in results', () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'node') return makeSpawnResult(0, PASSING_NODE_VERSION) as ReturnType<typeof spawnSync>;
      return makeSpawnResult(0, '') as ReturnType<typeof spawnSync>;
    });
    const result = runDoctorChecks('/mock/root');
    const nodeCheck = result.checks.find(c => c.name === 'Node.js');
    expect(nodeCheck).toBeDefined();
    expect(nodeCheck!.passed).toBe(true);
  });

  it('includes git check in results', () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'git') return makeSpawnResult(0, 'git version 2.40.0') as ReturnType<typeof spawnSync>;
      return makeSpawnResult(0, PASSING_NODE_VERSION) as ReturnType<typeof spawnSync>;
    });
    const result = runDoctorChecks('/mock/root');
    const gitCheck = result.checks.find(c => c.name === 'git');
    expect(gitCheck).toBeDefined();
    expect(gitCheck!.passed).toBe(true);
  });

  it('includes tmux check in results', () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'tmux') return makeSpawnResult(0, 'tmux 3.3') as ReturnType<typeof spawnSync>;
      return makeSpawnResult(0, PASSING_NODE_VERSION) as ReturnType<typeof spawnSync>;
    });
    const result = runDoctorChecks('/mock/root');
    const tmuxCheck = result.checks.find(c => c.name === 'tmux');
    expect(tmuxCheck).toBeDefined();
    expect(tmuxCheck!.passed).toBe(true);
  });

  it('includes claude check in results', () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'claude') return makeSpawnResult(0, '1.2.3') as ReturnType<typeof spawnSync>;
      return makeSpawnResult(0, PASSING_NODE_VERSION) as ReturnType<typeof spawnSync>;
    });
    const result = runDoctorChecks('/mock/root');
    const claudeCheck = result.checks.find(c => c.name === 'Claude CLI');
    expect(claudeCheck).toBeDefined();
    expect(claudeCheck!.passed).toBe(true);
  });

  it('marks ok=true when all required checks pass', () => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, PASSING_NODE_VERSION) as ReturnType<typeof spawnSync>);
    const result = runDoctorChecks('/mock/root');
    expect(result.ok).toBe(true);
  });

  it('marks ok=false when a required check fails (node not found)', () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'node') return makeSpawnResult(1, '') as ReturnType<typeof spawnSync>;
      return makeSpawnResult(0, PASSING_NODE_VERSION) as ReturnType<typeof spawnSync>;
    });
    const result = runDoctorChecks('/mock/root');
    expect(result.ok).toBe(false);
  });

  it('marks ok=false when tmux is missing', () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'tmux') return makeSpawnResult(1, '') as ReturnType<typeof spawnSync>;
      return makeSpawnResult(0, PASSING_NODE_VERSION) as ReturnType<typeof spawnSync>;
    });
    const result = runDoctorChecks('/mock/root');
    expect(result.ok).toBe(false);
  });

  it('marks ok=false when git is missing', () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'git') return makeSpawnResult(1, '') as ReturnType<typeof spawnSync>;
      return makeSpawnResult(0, PASSING_NODE_VERSION) as ReturnType<typeof spawnSync>;
    });
    const result = runDoctorChecks('/mock/root');
    expect(result.ok).toBe(false);
  });

  it('marks node check failed for Node <18', () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'node') return makeSpawnResult(0, 'v16.0.0') as ReturnType<typeof spawnSync>;
      return makeSpawnResult(0, PASSING_NODE_VERSION) as ReturnType<typeof spawnSync>;
    });
    const result = runDoctorChecks('/mock/root');
    const nodeCheck = result.checks.find(c => c.name === 'Node.js');
    expect(nodeCheck!.passed).toBe(false);
    expect(result.ok).toBe(false);
  });

  it('non-required checks do not affect ok', () => {
    // All tools pass, workspace missing (non-required)
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, PASSING_NODE_VERSION) as ReturnType<typeof spawnSync>);
    vi.mocked(existsSync).mockReturnValue(false); // workspace/brain missing
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('no file'); });
    const result = runDoctorChecks('/mock/root');
    // Required checks (node, git, tmux, claude) still pass → ok=true
    expect(result.ok).toBe(true);
    const workspaceCheck = result.checks.find(c => c.name === 'Workspace');
    expect(workspaceCheck!.passed).toBe(false);
  });
});

// ─── formatDoctorResult output ────────────────────────────────────────

describe('formatDoctorResult (output.ts helper)', () => {
  // We test the real formatDoctorResult from output.ts by importing it directly
  // We need to unmock output and reimport
  // Instead test through runDoctorChecks output shape
  beforeEach(() => {
    vi.mocked(platform).mockReturnValue('linux' as NodeJS.Platform);
  });

  it('doctor result checks have name, passed, message, required fields', () => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, PASSING_NODE_VERSION) as ReturnType<typeof spawnSync>);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue('content' as unknown as ReturnType<typeof readFileSync>);
    mockMemoryStore.totalCount.mockReturnValue(100);
    const result = runDoctorChecks('/mock/root');
    for (const check of result.checks) {
      expect(check).toHaveProperty('name');
      expect(check).toHaveProperty('passed');
      expect(check).toHaveProperty('message');
      expect(check).toHaveProperty('required');
    }
  });

  it('failed check has passed=false and descriptive message', () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'tmux') return makeSpawnResult(1, '') as ReturnType<typeof spawnSync>;
      return makeSpawnResult(0, PASSING_NODE_VERSION) as ReturnType<typeof spawnSync>;
    });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue('content' as unknown as ReturnType<typeof readFileSync>);
    mockMemoryStore.totalCount.mockReturnValue(100);
    const result = runDoctorChecks('/mock/root');
    const tmuxCheck = result.checks.find(c => c.name === 'tmux');
    expect(tmuxCheck!.passed).toBe(false);
    expect(tmuxCheck!.message).toMatch(/not found/i);
  });

  it('passed check has passed=true and version info in message', () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'git') return makeSpawnResult(0, 'git version 2.40.1') as ReturnType<typeof spawnSync>;
      return makeSpawnResult(0, PASSING_NODE_VERSION) as ReturnType<typeof spawnSync>;
    });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue('content' as unknown as ReturnType<typeof readFileSync>);
    mockMemoryStore.totalCount.mockReturnValue(100);
    const result = runDoctorChecks('/mock/root');
    const gitCheck = result.checks.find(c => c.name === 'git');
    expect(gitCheck!.passed).toBe(true);
    expect(gitCheck!.message).toMatch(/2\.40\.1/);
  });
});

// ─── formatSystemProfile ──────────────────────────────────────────────

describe('formatSystemProfile', () => {
  const profile = {
    cpuCores: 8,
    totalMemMB: 16384,
    freeMemMB: 8192,
    recommendedMaxWorkers: 4,
  };

  it('returns a string containing System Profile header', () => {
    const output = formatSystemProfile(profile);
    expect(output).toContain('System Profile');
  });

  it('includes cpu core count in output', () => {
    const output = formatSystemProfile(profile);
    expect(output).toContain('8');
  });

  it('includes RAM info in output', () => {
    const output = formatSystemProfile(profile);
    expect(output).toContain('16.0 GB');
    expect(output).toContain('8.0 GB');
  });

  it('includes subscription info when provided', () => {
    const output = formatSystemProfile(profile, 'max');
    expect(output).toContain('max');
    expect(output).toContain('Subscription');
  });

  it('omits subscription line when no subscription provided', () => {
    const output = formatSystemProfile(profile);
    expect(output).not.toContain('Subscription');
  });

  it('formats as box with border characters', () => {
    const output = formatSystemProfile(profile);
    expect(output).toContain('═');
    expect(output).toContain('╔');
    expect(output).toContain('╗');
    expect(output).toContain('╚');
    expect(output).toContain('╝');
  });

  it('includes recommended workers count', () => {
    const output = formatSystemProfile(profile);
    expect(output).toContain('Workers: 4');
  });
});

// ─── --profile flag integration ──────────────────────────────────────

describe('--profile flag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    vi.mocked(platform).mockReturnValue('linux' as NodeJS.Platform);
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, PASSING_NODE_VERSION) as ReturnType<typeof spawnSync>);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as ReturnType<typeof readdirSync>);
    mockMemoryStore.totalCount.mockReturnValue(50);
    vi.mocked(readFileSync).mockReturnValue('# Content' as unknown as ReturnType<typeof readFileSync>);
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('prints system profile when --profile is used', async () => {
    await runCommand(['doctor', '--profile']);
    expect(getSystemProfile).toHaveBeenCalled();
  });

  it('detects subscription when --profile is used', async () => {
    await runCommand(['doctor', '--profile']);
    expect(detectSubscription).toHaveBeenCalled();
  });

  it('passes unknown subscription label as "unknown"', async () => {
    vi.mocked(detectSubscription).mockReturnValueOnce({
      detected: 'unknown',
      method: 'error',
    });
    await runCommand(['doctor', '--profile']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    const profileCall = calls.find(c => typeof c === 'string' && c.includes('System Profile'));
    expect(profileCall).toBeDefined();
    expect(profileCall).toContain('unknown');
  });

  it('passes detected plan label when subscription is known', async () => {
    vi.mocked(detectSubscription).mockReturnValueOnce({
      detected: 'max',
      method: 'opus_probe',
    });
    await runCommand(['doctor', '--profile']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    const profileCall = calls.find(c => typeof c === 'string' && c.includes('System Profile'));
    expect(profileCall).toBeDefined();
    expect(profileCall).toContain('max');
  });
});

// ─── Error handling ───────────────────────────────────────────────────

describe('error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    vi.mocked(platform).mockReturnValue('linux' as NodeJS.Platform);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as ReturnType<typeof readdirSync>);
    mockMemoryStore.totalCount.mockReturnValue(50);
    vi.mocked(readFileSync).mockReturnValue('content' as unknown as ReturnType<typeof readFileSync>);
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('node not found — check returns passed=false with message', () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'node') return makeSpawnResult(1, '') as ReturnType<typeof spawnSync>;
      return makeSpawnResult(0, 'v1.0') as ReturnType<typeof spawnSync>;
    });
    const result = runDoctorChecks('/mock/root');
    const check = result.checks.find(c => c.name === 'Node.js');
    expect(check!.passed).toBe(false);
    expect(check!.message).toContain('not found');
  });

  it('claude not found — check returns passed=false', () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'claude') return makeSpawnResult(1, '') as ReturnType<typeof spawnSync>;
      return makeSpawnResult(0, PASSING_NODE_VERSION) as ReturnType<typeof spawnSync>;
    });
    const result = runDoctorChecks('/mock/root');
    const check = result.checks.find(c => c.name === 'Claude CLI');
    expect(check!.passed).toBe(false);
    expect(check!.message).toContain('not found');
  });

  it('workspace missing — check returns passed=false with hint message', () => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, PASSING_NODE_VERSION) as ReturnType<typeof spawnSync>);
    vi.mocked(existsSync).mockImplementation((p: string) => {
      if (String(p).includes('.deckent')) return false;
      return true;
    });
    const result = runDoctorChecks('/mock/root');
    const check = result.checks.find(c => c.name === 'Workspace');
    expect(check!.passed).toBe(false);
    expect(check!.message).toMatch(/deckent init/);
  });

  it('stale lock detected — locks check returns passed=false', () => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, PASSING_NODE_VERSION) as ReturnType<typeof spawnSync>);
    const staleTime = new Date(Date.now() - 600000).toISOString(); // 10 min ago
    vi.mocked(readdirSync).mockReturnValue(['task-001.lock'] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockImplementation((p: string) => {
      if (String(p).endsWith('.lock')) {
        return JSON.stringify({ acquiredAt: staleTime, ownerWorkerId: 'w-001', taskId: '001', filePath: 'x' });
      }
      return 'content';
    });
    const result = runDoctorChecks('/mock/root');
    const check = result.checks.find(c => c.name === 'Locks');
    expect(check!.passed).toBe(false);
    expect(check!.message).toMatch(/stale/i);
  });

  it('brain budget over 900 — check passes=false with decay hint', () => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, PASSING_NODE_VERSION) as ReturnType<typeof spawnSync>);
    mockMemoryStore.totalCount.mockReturnValue(950);
    const result = runDoctorChecks('/mock/root');
    const check = result.checks.find(c => c.name === 'Brain Budget');
    expect(check!.passed).toBe(false);
    expect(check!.message).toMatch(/decay/i);
  });
});

// ─── Exit code ───────────────────────────────────────────────────────

describe('exit code', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    vi.mocked(platform).mockReturnValue('linux' as NodeJS.Platform);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as ReturnType<typeof readdirSync>);
    mockMemoryStore.totalCount.mockReturnValue(50);
    vi.mocked(readFileSync).mockReturnValue('# Content' as unknown as ReturnType<typeof readFileSync>);
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('sets process.exitCode=1 when a required check fails', async () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'tmux') return makeSpawnResult(1, '') as ReturnType<typeof spawnSync>;
      return makeSpawnResult(0, PASSING_NODE_VERSION) as ReturnType<typeof spawnSync>;
    });
    await runCommand(['doctor']);
    expect(process.exitCode).toBe(1);
  });

  it('does NOT set process.exitCode=1 when all required checks pass', async () => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, PASSING_NODE_VERSION) as ReturnType<typeof spawnSync>);
    await runCommand(['doctor']);
    expect(process.exitCode).toBeUndefined();
  });
});

// ─── i18n integration ─────────────────────────────────────────────────

describe('i18n integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    vi.mocked(platform).mockReturnValue('linux' as NodeJS.Platform);
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, PASSING_NODE_VERSION) as ReturnType<typeof spawnSync>);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as ReturnType<typeof readdirSync>);
    mockMemoryStore.totalCount.mockReturnValue(50);
    vi.mocked(readFileSync).mockReturnValue('# Content' as unknown as ReturnType<typeof readFileSync>);
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('prints doctor.checks_passed message in legacy mode', async () => {
    await runCommand(['doctor', '--legacy']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.some(c => String(c).includes('checks passed'))).toBe(true);
  });

  it('checks_passed message includes total check count in legacy mode', async () => {
    await runCommand(['doctor', '--legacy']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    const passedMsg = calls.find(c => String(c).includes('checks passed'));
    expect(passedMsg).toBeDefined();
    // runDoctorChecks returns 16 checks total (15 + '.deck Subprocess Visibility', 411-002/412-003)
    expect(String(passedMsg)).toMatch(/\/16/);
  });

  it('uses tr language when config has language=tr in legacy mode', async () => {
    vi.mocked(existsSync).mockImplementation((p: string) => {
      if (String(p).includes('config.json')) return true;
      return true;
    });
    vi.mocked(readFileSync).mockImplementation((p: string) => {
      if (String(p).includes('config.json')) return JSON.stringify({ language: 'tr' });
      return '# Content';
    });
    await runCommand(['doctor', '--legacy']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    // Turkish: 'Sonuç: {passed}/{total} kontrol geçti'
    expect(calls.some(c => String(c).includes('kontrol geçti'))).toBe(true);
  });

  it('falls back to en when config missing in legacy mode', async () => {
    vi.mocked(existsSync).mockImplementation((p: string) => {
      if (String(p).includes('config.json')) return false;
      return true;
    });
    await runCommand(['doctor', '--legacy']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.some(c => String(c).includes('checks passed'))).toBe(true);
  });

  it('falls back to en when config has invalid JSON in legacy mode', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation((p: string) => {
      if (String(p).includes('config.json')) return 'NOT JSON';
      return '# Content';
    });
    await runCommand(['doctor', '--legacy']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.some(c => String(c).includes('checks passed'))).toBe(true);
  });
});

// ─── checkPlatform ────────────────────────────────────────────────────

describe('checkPlatform', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns passed=false for win32 with unsupported message', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    const check = checkPlatform();
    expect(check.passed).toBe(false);
    expect(check.name).toBe('Platform');
    expect(check.message).toMatch(/UNSUPPORTED/);
    expect(check.message).toMatch(/WSL2/);
  });

  it('win32 check is not required (warning only)', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    const check = checkPlatform();
    expect(check.required).toBe(false);
  });

  it('returns passed=true for linux', () => {
    vi.mocked(platform).mockReturnValue('linux' as NodeJS.Platform);
    // readFileSync mock: /proc/version returns empty (not WSL)
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('no file'); });
    const check = checkPlatform();
    expect(check.passed).toBe(true);
    expect(check.message).toMatch(/Linux/i);
  });

  it('returns passed=true for darwin (macOS)', () => {
    vi.mocked(platform).mockReturnValue('darwin' as NodeJS.Platform);
    const check = checkPlatform();
    expect(check.passed).toBe(true);
    expect(check.message).toMatch(/macOS/);
  });

  it('returns passed=true with untested note for unknown platform', () => {
    vi.mocked(platform).mockReturnValue('freebsd' as NodeJS.Platform);
    const check = checkPlatform();
    expect(check.passed).toBe(true);
    expect(check.message).toMatch(/untested/);
  });

  it('detects WSL2 via WSL_DISTRO_NAME env var', () => {
    vi.mocked(platform).mockReturnValue('linux' as NodeJS.Platform);
    const original = process.env['WSL_DISTRO_NAME'];
    process.env['WSL_DISTRO_NAME'] = 'Ubuntu';
    try {
      const check = checkPlatform();
      expect(check.passed).toBe(true);
      expect(check.message).toMatch(/WSL/i);
    } finally {
      if (original === undefined) {
        delete process.env['WSL_DISTRO_NAME'];
      } else {
        process.env['WSL_DISTRO_NAME'] = original;
      }
    }
  });

  it('detects WSL2 via WSL_INTEROP env var', () => {
    vi.mocked(platform).mockReturnValue('linux' as NodeJS.Platform);
    const original = process.env['WSL_INTEROP'];
    process.env['WSL_INTEROP'] = '/run/WSL/1_interop';
    try {
      const check = checkPlatform();
      expect(check.passed).toBe(true);
      expect(check.message).toMatch(/WSL/i);
    } finally {
      if (original === undefined) {
        delete process.env['WSL_INTEROP'];
      } else {
        process.env['WSL_INTEROP'] = original;
      }
    }
  });

  it('native Windows platform check does not affect ok (non-required)', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, PASSING_NODE_VERSION) as ReturnType<typeof spawnSync>);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as ReturnType<typeof readdirSync>);
    mockMemoryStore.totalCount.mockReturnValue(50);
    vi.mocked(readFileSync).mockReturnValue('# Content' as unknown as ReturnType<typeof readFileSync>);
    const result = runDoctorChecks('/mock/root');
    // Platform check is not required — ok still true when other required checks pass
    expect(result.ok).toBe(true);
    const platformCheck = result.checks.find(c => c.name === 'Platform');
    expect(platformCheck!.passed).toBe(false);
  });
});

// ─── isRunningInWSL ──────────────────────────────────────────────────

describe('isRunningInWSL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear WSL env vars for clean test state
    delete process.env['WSL_DISTRO_NAME'];
    delete process.env['WSL_INTEROP'];
  });

  afterEach(() => {
    delete process.env['WSL_DISTRO_NAME'];
    delete process.env['WSL_INTEROP'];
  });

  it('returns true when WSL_DISTRO_NAME is set', () => {
    process.env['WSL_DISTRO_NAME'] = 'Ubuntu-22.04';
    expect(isRunningInWSL()).toBe(true);
  });

  it('returns true when WSL_INTEROP is set', () => {
    process.env['WSL_INTEROP'] = '/run/WSL/1_interop';
    expect(isRunningInWSL()).toBe(true);
  });

  it('returns true when /proc/version contains "microsoft"', () => {
    vi.mocked(readFileSync).mockImplementation((p: string) => {
      if (String(p) === '/proc/version') return 'Linux version 5.15.0-microsoft-standard-WSL2';
      return '';
    });
    expect(isRunningInWSL()).toBe(true);
  });

  it('returns true when /proc/version contains "Microsoft" (case insensitive)', () => {
    vi.mocked(readFileSync).mockImplementation((p: string) => {
      if (String(p) === '/proc/version') return 'Linux version 4.4.0-Microsoft';
      return '';
    });
    expect(isRunningInWSL()).toBe(true);
  });

  it('returns false when no WSL env vars and /proc/version throws', () => {
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    expect(isRunningInWSL()).toBe(false);
  });

  it('returns false when /proc/version exists but no microsoft mention', () => {
    vi.mocked(readFileSync).mockImplementation((p: string) => {
      if (String(p) === '/proc/version') return 'Linux version 5.15.0-75-generic (buildd@ubuntu)';
      return '';
    });
    expect(isRunningInWSL()).toBe(false);
  });
});

// ─── formatHumanDoctor ──────────────────────────────────────────────

describe('formatHumanDoctor', () => {
  function makeCheck(name: string, passed: boolean, message: string, required = false) {
    return { name, passed, message, required };
  }

  function makeProvider(name: string, available: boolean, version?: string, authMethod: 'session' | 'api_key' | 'none' = 'none'): DetectedProvider {
    return { name: name as DetectedProvider['name'], available, version, authMethod, models: [] as unknown as DetectedProvider['models'] };
  }

  const baseInput: HumanDoctorInput = {
    result: {
      ok: true,
      checks: [
        makeCheck('Platform', true, 'Linux (fully supported)'),
        makeCheck('Node.js', true, 'v22.1.0 (>=18 required)', true),
        makeCheck('git', true, 'v2.43.0', true),
        makeCheck('tmux', true, 'tmux 3.4', true),
        makeCheck('Claude CLI', true, 'v2.1', true),
        makeCheck('Workspace', true, '.deckent/ found'),
        makeCheck('Brain Dir', true, 'All brain files present'),
        makeCheck('Directives', true, 'DIRECTIVES.md found'),
        makeCheck('Brain Budget', true, '347/600 lines'),
        makeCheck('Debt', true, 'No debt file'),
        makeCheck('Locks', true, 'No lock files'),
      ],
    },
    providers: [
      makeProvider('claude', true, '2.1', 'session'),
      makeProvider('codex', true, '1.0', 'api_key'),
      makeProvider('gemini', false),
    ],
    keyringCheck: makePassingKeyringCheck(),
    brainLines: 347,
    brainBudget: 600,
    lastSprintId: 'sprint-039',
    debtItems: { total: 0, critical: 0 },
  };

  it('starts with "Deckent Health Check" header', () => {
    const output = formatHumanDoctor(baseInput);
    expect(output).toMatch(/^Deckent Health Check/);
  });

  it('shows "Your System:" section', () => {
    const output = formatHumanDoctor(baseInput);
    expect(output).toContain('Your System:');
  });

  it('shows "Your Project:" section', () => {
    const output = formatHumanDoctor(baseInput);
    expect(output).toContain('Your Project:');
  });

  it('shows "Recommendation:" section', () => {
    const output = formatHumanDoctor(baseInput);
    expect(output).toContain('Recommendation:');
  });

  it('shows system checks with version numbers', () => {
    const output = formatHumanDoctor(baseInput);
    expect(output).toContain('OK Node.js');
    expect(output).toContain('v22.1.0');
    expect(output).toContain('OK git');
    expect(output).toContain('v2.43.0');
  });

  it('shows provider status with auth method', () => {
    const output = formatHumanDoctor(baseInput);
    expect(output).toContain('OK Claude CLI v2.1 — Ready (session auth)');
    expect(output).toContain('OK Codex CLI v1.0 — Ready (API key set)');
  });

  it('shows failed provider with hint', () => {
    const output = formatHumanDoctor(baseInput);
    expect(output).toContain('SKIP Gemini — Not configured (set GOOGLE_API_KEY to enable)');
  });

  it('shows memory percentage and health', () => {
    const output = formatHumanDoctor(baseInput);
    expect(output).toContain('Memory: 347/600 lines (58% — moderate)');
  });

  it('shows memory OVER BUDGET when exceeds limit', () => {
    const input = { ...baseInput, brainLines: 650 };
    const output = formatHumanDoctor(input);
    expect(output).toContain('FAIL Memory: 650/600 lines');
    expect(output).toContain('OVER BUDGET');
  });

  it('shows last sprint ID', () => {
    const output = formatHumanDoctor(baseInput);
    expect(output).toContain('OK Last sprint: sprint-039 (completed)');
  });

  it('omits last sprint when null', () => {
    const input = { ...baseInput, lastSprintId: null };
    const output = formatHumanDoctor(input);
    expect(output).not.toContain('Last sprint');
  });

  it('shows debt items with warning', () => {
    const input = { ...baseInput, debtItems: { total: 5, critical: 0 } };
    const output = formatHumanDoctor(input);
    expect(output).toContain('Warning 5 open debt items');
    expect(output).toContain('deckent status --debt');
  });

  it('shows critical debt items count', () => {
    const input = { ...baseInput, debtItems: { total: 5, critical: 2 } };
    const output = formatHumanDoctor(input);
    expect(output).toContain('Warning 2 critical + 3 open debt items');
  });

  it('shows positive recommendation when all ok', () => {
    const output = formatHumanDoctor(baseInput);
    expect(output).toContain('Everything looks good!');
    expect(output).toContain('deckent start');
  });

  it('shows fix recommendation when required check fails', () => {
    const input = {
      ...baseInput,
      result: {
        ok: false,
        checks: [
          ...baseInput.result.checks.map(c =>
            c.name === 'tmux' ? { ...c, passed: false, message: 'not found' } : c,
          ),
        ],
      },
    };
    const output = formatHumanDoctor(input);
    expect(output).toContain('Fix 1 required issue');
    expect(output).toContain('tmux: not found');
  });

  it('uses the explicit required keyring check without reading host authority state', () => {
    vi.mocked(readKeyringState).mockClear();
    const output = formatHumanDoctor({
      ...baseInput,
      keyringCheck: {
        name: 'Provider authority keyring',
        passed: false,
        message: 'Host provider authority keyring is not provisioned',
        required: true,
      },
    });

    expect(readKeyringState).not.toHaveBeenCalled();
    expect(output).toContain('Status: NOT READY');
    expect(output).toContain('Provider authority keyring: Host provider authority keyring is not provisioned');
  });

  it('keeps compatibility fixtures deterministic without an ambient keyring fallback', () => {
    vi.mocked(readKeyringState).mockClear();
    const { keyringCheck: _keyringCheck, ...compatibilityInput } = baseInput;

    const output = formatHumanDoctor(compatibilityInput);

    expect(readKeyringState).not.toHaveBeenCalled();
    expect(output).toContain('Status: READY');
  });

  it('shows provider tips for unavailable providers', () => {
    const output = formatHumanDoctor(baseInput);
    expect(output).toContain('Tip: Set GOOGLE_API_KEY to enable Gemini');
  });

  it('shows brain decay tip when over budget', () => {
    const input = { ...baseInput, brainLines: 650 };
    const output = formatHumanDoctor(input);
    expect(output).toContain('Tip: Run `deckent cleanup --decay`');
  });

  it('shows stale lock warning in project section', () => {
    const input = {
      ...baseInput,
      result: {
        ok: true,
        checks: baseInput.result.checks.map(c =>
          c.name === 'Locks' ? { ...c, passed: false, message: '2 stale lock(s)' } : c,
        ),
      },
    };
    const output = formatHumanDoctor(input);
    expect(output).toContain('Warning 2 stale lock(s)');
  });

  it('shows codex provider hint when unavailable', () => {
    const input = {
      ...baseInput,
      providers: [
        makeProvider('claude', true, '2.1', 'session'),
        makeProvider('codex', false),
        makeProvider('gemini', false),
      ],
    };
    const output = formatHumanDoctor(input);
    expect(output).toContain('SKIP Codex — Not configured (set OPENAI_API_KEY to enable)');
  });

  it('shows all providers as OK when all available', () => {
    const input = {
      ...baseInput,
      providers: [
        makeProvider('claude', true, '2.1', 'session'),
        makeProvider('codex', true, '1.0', 'api_key'),
        makeProvider('gemini', true, undefined, 'api_key'),
      ],
    };
    const output = formatHumanDoctor(input);
    expect(output).not.toContain('FAIL Gemini');
    expect(output).not.toContain('FAIL Codex');
    expect(output).toContain('OK Gemini');
  });

  it('does not include tips when all providers available', () => {
    const input = {
      ...baseInput,
      providers: [
        makeProvider('claude', true, '2.1', 'session'),
        makeProvider('codex', true, '1.0', 'api_key'),
        makeProvider('gemini', true, undefined, 'api_key'),
      ],
    };
    const output = formatHumanDoctor(input);
    expect(output).not.toContain('Tip:');
  });
});

// ─── getLastSprintId ────────────────────────────────────────────────

describe('getLastSprintId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns sprint ID from config', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ last_sprint_id: 'sprint-039' }));
    expect(getLastSprintId('/mock/root')).toBe('sprint-039');
  });

  it('returns null when config file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(getLastSprintId('/mock/root')).toBeNull();
  });

  it('returns null when config has no last_sprint_id', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ language: 'en' }));
    expect(getLastSprintId('/mock/root')).toBeNull();
  });

  it('returns null when config is invalid JSON', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('NOT JSON');
    expect(getLastSprintId('/mock/root')).toBeNull();
  });
});

// ─── countDebtItems ─────────────────────────────────────────────────

describe('countDebtItems (DB-first)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
  });

  it('returns zero when no DB file', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const result = countDebtItems('/mock/root');
    expect(result).toEqual({ total: 0, critical: 0 });
  });

  it('counts debt entries from MemoryStore', () => {
    mockMemoryStore.getByType.mockReturnValue([
      { type: 'debt', status: 'open', priority: 'HIGH' },
      { type: 'debt', status: 'open', priority: 'CRITICAL' },
      { type: 'debt', status: 'resolved', priority: 'LOW' },
    ]);
    const result = countDebtItems('/mock/root');
    expect(result.total).toBe(3);
    expect(result.critical).toBe(1);
  });

  it('returns zero for empty DB', () => {
    mockMemoryStore.getByType.mockReturnValue([]);
    const result = countDebtItems('/mock/root');
    expect(result).toEqual({ total: 0, critical: 0 });
  });

  it('handles MemoryStore error gracefully', () => {
    mockMemoryStore.getByType.mockImplementation(() => { throw new Error('db error'); });
    const result = countDebtItems('/mock/root');
    expect(result).toEqual({ total: 0, critical: 0 });
  });
});

// ─── getProviderTips ────────────────────────────────────────────────

describe('getProviderTips', () => {
  function makeProvider(name: string, available: boolean): DetectedProvider {
    return { name: name as DetectedProvider['name'], available, authMethod: 'none', models: [] as unknown as DetectedProvider['models'] };
  }

  it('returns Gemini tip when Gemini unavailable', () => {
    const tips = getProviderTips([makeProvider('gemini', false)]);
    expect(tips).toHaveLength(1);
    expect(tips[0]).toContain('GOOGLE_API_KEY');
  });

  it('returns Codex tip when Codex unavailable', () => {
    const tips = getProviderTips([makeProvider('codex', false)]);
    expect(tips).toHaveLength(1);
    expect(tips[0]).toContain('OPENAI_API_KEY');
  });

  it('returns no tips when all providers available', () => {
    const tips = getProviderTips([
      makeProvider('claude', true),
      makeProvider('codex', true),
      makeProvider('gemini', true),
    ]);
    expect(tips).toHaveLength(0);
  });

  it('returns multiple tips when multiple providers unavailable', () => {
    const tips = getProviderTips([
      makeProvider('codex', false),
      makeProvider('gemini', false),
    ]);
    expect(tips).toHaveLength(2);
  });

  it('returns Claude tip when Claude unavailable', () => {
    const tips = getProviderTips([makeProvider('claude', false)]);
    expect(tips).toHaveLength(1);
    expect(tips[0]).toContain('Claude CLI');
  });
});

// --- getMemoryHealthLabel ---

describe('getMemoryHealthLabel', () => {
  it('returns "healthy" for usage below 50%', () => {
    expect(getMemoryHealthLabel(0)).toBe('healthy');
    expect(getMemoryHealthLabel(10)).toBe('healthy');
    expect(getMemoryHealthLabel(49)).toBe('healthy');
  });

  it('returns "moderate" for usage 50-79%', () => {
    expect(getMemoryHealthLabel(50)).toBe('moderate');
    expect(getMemoryHealthLabel(65)).toBe('moderate');
    expect(getMemoryHealthLabel(79)).toBe('moderate');
  });

  it('returns "high" for usage 80-100%', () => {
    expect(getMemoryHealthLabel(80)).toBe('high');
    expect(getMemoryHealthLabel(90)).toBe('high');
    expect(getMemoryHealthLabel(100)).toBe('high');
  });

  it('returns "OVER BUDGET" for usage above 100%', () => {
    expect(getMemoryHealthLabel(101)).toBe('OVER BUDGET');
    expect(getMemoryHealthLabel(150)).toBe('OVER BUDGET');
  });
});

// --- getProviderSummary ---

describe('getProviderSummary', () => {
  function makeProvider(name: string, available: boolean): DetectedProvider {
    return { name: name as DetectedProvider['name'], available, authMethod: 'none', models: [] as unknown as DetectedProvider['models'] };
  }

  it('returns "2/3 providers ready" when 2 of 3 available', () => {
    const summary = getProviderSummary([
      makeProvider('claude', true),
      makeProvider('codex', true),
      makeProvider('gemini', false),
    ]);
    expect(summary).toBe('2/3 providers ready');
  });

  it('returns "0/3 providers ready" when none available', () => {
    const summary = getProviderSummary([
      makeProvider('claude', false),
      makeProvider('codex', false),
      makeProvider('gemini', false),
    ]);
    expect(summary).toBe('0/3 providers ready');
  });

  it('returns "3/3 providers ready" when all available', () => {
    const summary = getProviderSummary([
      makeProvider('claude', true),
      makeProvider('codex', true),
      makeProvider('gemini', true),
    ]);
    expect(summary).toBe('3/3 providers ready');
  });

  it('returns "0/0 providers ready" for empty array', () => {
    expect(getProviderSummary([])).toBe('0/0 providers ready');
  });
});

// --- getReadinessLabel ---

describe('getReadinessLabel', () => {
  function makeCheck(name: string, passed: boolean, required: boolean) {
    return { name, passed, message: '', required };
  }

  it('returns "READY" when all checks pass', () => {
    const result = {
      ok: true,
      checks: [
        makeCheck('Node.js', true, true),
        makeCheck('git', true, true),
        makeCheck('Workspace', true, false),
      ],
    };
    expect(getReadinessLabel(result, 100, 600)).toBe('READY');
  });

  it('returns "NOT READY" when a required check fails', () => {
    const result = {
      ok: false,
      checks: [
        makeCheck('Node.js', false, true),
        makeCheck('git', true, true),
      ],
    };
    expect(getReadinessLabel(result, 100, 600)).toBe('NOT READY');
  });

  it('returns "READY (with warnings)" when brain over budget', () => {
    const result = {
      ok: true,
      checks: [
        makeCheck('Node.js', true, true),
        makeCheck('git', true, true),
      ],
    };
    expect(getReadinessLabel(result, 700, 600)).toBe('READY (with warnings)');
  });

  it('returns "READY (with warnings)" when optional check fails', () => {
    const result = {
      ok: true,
      checks: [
        makeCheck('Node.js', true, true),
        makeCheck('Workspace', false, false),
      ],
    };
    expect(getReadinessLabel(result, 100, 600)).toBe('READY (with warnings)');
  });
});

// --- formatHumanDoctor enhancements ---

describe('formatHumanDoctor enhancements', () => {
  function makeCheck(name: string, passed: boolean, message: string, required = false) {
    return { name, passed, message, required };
  }

  function makeProvider(name: string, available: boolean, version?: string, authMethod: 'session' | 'api_key' | 'none' = 'none'): DetectedProvider {
    return { name: name as DetectedProvider['name'], available, version, authMethod, models: [] as unknown as DetectedProvider['models'] };
  }

  const baseInput: HumanDoctorInput = {
    result: {
      ok: true,
      checks: [
        makeCheck('Platform', true, 'Linux (fully supported)'),
        makeCheck('Node.js', true, 'v22.1.0 (>=18 required)', true),
        makeCheck('git', true, 'v2.43.0', true),
        makeCheck('tmux', true, 'tmux 3.4', true),
        makeCheck('Claude CLI', true, 'v2.1', true),
        makeCheck('Workspace', true, '.deckent/ found'),
        makeCheck('Brain Dir', true, 'All brain files present'),
        makeCheck('Directives', true, 'DIRECTIVES.md found'),
        makeCheck('Brain Budget', true, '347/600 lines'),
        makeCheck('Debt', true, 'No debt file'),
        makeCheck('Locks', true, 'No lock files'),
      ],
    },
    providers: [
      makeProvider('claude', true, '2.1', 'session'),
      makeProvider('codex', true, '1.0', 'api_key'),
      makeProvider('gemini', false),
    ],
    keyringCheck: makePassingKeyringCheck(),
    brainLines: 347,
    brainBudget: 600,
    lastSprintId: 'sprint-039',
    debtItems: { total: 0, critical: 0 },
  };

  it('shows provider summary line', () => {
    const output = formatHumanDoctor(baseInput);
    expect(output).toContain('2/3 providers ready');
  });

  it('shows Status: READY when all ok', () => {
    const output = formatHumanDoctor(baseInput);
    expect(output).toContain('Status: READY');
  });

  it('shows Status: NOT READY when required check fails', () => {
    const input = {
      ...baseInput,
      result: {
        ok: false,
        checks: baseInput.result.checks.map(c =>
          c.name === 'tmux' ? { ...c, passed: false } : c,
        ),
      },
    };
    const output = formatHumanDoctor(input);
    expect(output).toContain('Status: NOT READY');
  });

  it('shows Status: READY (with warnings) when optional check fails', () => {
    const input = {
      ...baseInput,
      result: {
        ok: true,
        checks: baseInput.result.checks.map(c =>
          c.name === 'Workspace' ? { ...c, passed: false } : c,
        ),
      },
    };
    const output = formatHumanDoctor(input);
    expect(output).toContain('Status: READY (with warnings)');
  });

  it('shows tiered memory label "healthy" for low usage', () => {
    const input = { ...baseInput, brainLines: 100, brainBudget: 600 };
    const output = formatHumanDoctor(input);
    expect(output).toContain('17% — healthy');
  });

  it('shows tiered memory label "high" for 80%+ usage', () => {
    const input = { ...baseInput, brainLines: 500, brainBudget: 600 };
    const output = formatHumanDoctor(input);
    expect(output).toContain('83% — high');
  });

  it('shows claude provider hint when claude is missing', () => {
    const input = {
      ...baseInput,
      providers: [
        makeProvider('claude', false),
        makeProvider('codex', true, '1.0', 'api_key'),
        makeProvider('gemini', false),
      ],
    };
    const output = formatHumanDoctor(input);
    expect(output).toContain('SKIP Claude — Not configured (install Claude CLI');
  });

  it('shows claude provider tip when claude is unavailable', () => {
    const input = {
      ...baseInput,
      providers: [
        makeProvider('claude', false),
      ],
    };
    const output = formatHumanDoctor(input);
    expect(output).toContain('Tip: Install Claude CLI');
  });
});

// ─── Provider Health Section ────────────────────────────────────────

describe('formatProviderHealthSection', () => {
  function makeProvider(name: string, available: boolean, version?: string, authMethod: 'session' | 'api_key' | 'none' = 'none'): DetectedProvider {
    return { name: name as DetectedProvider['name'], available, version, authMethod, models: [] as unknown as DetectedProvider['models'] };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadDeckSecrets).mockReturnValue({});
    vi.mocked(validateDeckFile).mockReturnValue({ valid: true, warnings: [], errors: [] });
    vi.mocked(detectEnvironment).mockReturnValue('vscode');
  });

  it('shows "Provider Health:" header', () => {
    const providers = [makeProvider('claude', true, '2.1.81', 'session')];
    const lines = formatProviderHealthSection(providers, '/mock/root');
    expect(lines[0]).toBe('Provider Health:');
  });

  it('shows available provider with session auth', () => {
    const providers = [makeProvider('claude', true, '2.1.81', 'session')];
    const lines = formatProviderHealthSection(providers, '/mock/root');
    const claudeLine = lines.find(l => l.includes('Claude'));
    expect(claudeLine).toContain('OK Claude CLI v2.1.81');
    expect(claudeLine).toContain('session auth active');
  });

  it('shows available provider with API key auth', () => {
    const providers = [makeProvider('codex', true, '1.0', 'api_key')];
    const lines = formatProviderHealthSection(providers, '/mock/root');
    const codexLine = lines.find(l => l.includes('Codex'));
    expect(codexLine).toContain('OK Codex CLI v1.0');
    expect(codexLine).toContain('API key configured');
  });

  it('shows unavailable provider with hint', () => {
    const providers = [makeProvider('gemini', false)];
    const lines = formatProviderHealthSection(providers, '/mock/root');
    const geminiLine = lines.find(l => l.includes('Gemini'));
    expect(geminiLine).toContain('FAIL Gemini');
    expect(geminiLine).toContain('not available');
  });

  it('shows .deck file status when secrets exist', () => {
    vi.mocked(loadDeckSecrets).mockReturnValue({
      DECKENT_CLAUDE_API_KEY: 'sk-test',
      DECKENT_OPENAI_API_KEY: 'sk-openai',
      DECKENT_GOOGLE_API_KEY: 'AIza-test',
    });
    const providers = [makeProvider('claude', true, '2.1', 'session')];
    const lines = formatProviderHealthSection(providers, '/mock/root');
    const deckLine = lines.find(l => l.includes('.deck'));
    expect(deckLine).toContain('OK');
    expect(deckLine).toContain('3/9 keys configured');
  });

  it('shows .deck file not found status', () => {
    vi.mocked(loadDeckSecrets).mockReturnValue({});
    const providers = [makeProvider('claude', true, '2.1', 'session')];
    const lines = formatProviderHealthSection(providers, '/mock/root');
    const deckLine = lines.find(l => l.includes('.deck'));
    expect(deckLine).toContain('WARN');
    expect(deckLine).toContain('not found');
  });

  it('shows detected environment', () => {
    vi.mocked(detectEnvironment).mockReturnValue('vscode');
    const providers = [makeProvider('claude', true, '2.1', 'session')];
    const lines = formatProviderHealthSection(providers, '/mock/root');
    const envLine = lines.find(l => l.includes('Environment'));
    expect(envLine).toContain('OK Environment: vscode detected');
  });

  it('shows tmux environment when detected', () => {
    vi.mocked(detectEnvironment).mockReturnValue('tmux');
    const providers = [makeProvider('claude', true, '2.1', 'session')];
    const lines = formatProviderHealthSection(providers, '/mock/root');
    const envLine = lines.find(l => l.includes('Environment'));
    expect(envLine).toContain('tmux detected');
  });
});

// ─── getDeckFileStatus ──────────────────────────────────────────────

describe('getDeckFileStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadDeckSecrets).mockReturnValue({});
    vi.mocked(validateDeckFile).mockReturnValue({ valid: true, warnings: [], errors: [] });
  });

  it('returns "not found" when no secrets loaded', () => {
    vi.mocked(loadDeckSecrets).mockReturnValue({});
    const status = getDeckFileStatus('/mock/root');
    expect(status).toContain('not found');
  });

  it('returns configured key count when secrets present', () => {
    vi.mocked(loadDeckSecrets).mockReturnValue({
      DECKENT_CLAUDE_API_KEY: 'sk-test',
      DECKENT_OPENAI_API_KEY: 'sk-openai',
    });
    const status = getDeckFileStatus('/mock/root');
    expect(status).toContain('2/9 keys configured');
    expect(status).toContain('.deck file found');
  });

  it('does not count empty string values as configured', () => {
    vi.mocked(loadDeckSecrets).mockReturnValue({
      DECKENT_CLAUDE_API_KEY: '',
      DECKENT_OPENAI_API_KEY: 'sk-openai',
    });
    const status = getDeckFileStatus('/mock/root');
    expect(status).toContain('1/9 keys configured');
  });

  it('shows error flag when validation fails', () => {
    vi.mocked(loadDeckSecrets).mockReturnValue({
      'INVALID KEY': 'value',
    });
    vi.mocked(validateDeckFile).mockReturnValue({
      valid: false,
      warnings: [],
      errors: ['Invalid key format'],
    });
    const status = getDeckFileStatus('/mock/root');
    expect(status).toContain('has errors');
  });

  it('does not show error flag when validation passes', () => {
    vi.mocked(loadDeckSecrets).mockReturnValue({
      DECKENT_CLAUDE_API_KEY: 'sk-test',
    });
    vi.mocked(validateDeckFile).mockReturnValue({ valid: true, warnings: [], errors: [] });
    const status = getDeckFileStatus('/mock/root');
    expect(status).not.toContain('has errors');
  });
});

// ─── formatHumanDoctor with provider health section ────────────────

describe('formatHumanDoctor with provider health', () => {
  function makeCheck(name: string, passed: boolean, message: string, required = false) {
    return { name, passed, message, required };
  }

  function makeProvider(name: string, available: boolean, version?: string, authMethod: 'session' | 'api_key' | 'none' = 'none'): DetectedProvider {
    return { name: name as DetectedProvider['name'], available, version, authMethod, models: [] as unknown as DetectedProvider['models'] };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadDeckSecrets).mockReturnValue({});
    vi.mocked(validateDeckFile).mockReturnValue({ valid: true, warnings: [], errors: [] });
    vi.mocked(detectEnvironment).mockReturnValue('vscode');
  });

  const baseInput: HumanDoctorInput = {
    result: {
      ok: true,
      checks: [
        makeCheck('Platform', true, 'Linux'),
        makeCheck('Node.js', true, 'v22.1.0', true),
        makeCheck('git', true, 'v2.43.0', true),
        makeCheck('tmux', true, 'tmux 3.4', true),
        makeCheck('Claude CLI', true, 'v2.1', true),
        makeCheck('Workspace', true, '.deckent/ found'),
        makeCheck('Brain Dir', true, 'All brain files present'),
        makeCheck('Directives', true, 'DIRECTIVES.md found'),
        makeCheck('Brain Budget', true, '347/600 lines'),
        makeCheck('Debt', true, 'No debt file'),
        makeCheck('Locks', true, 'No lock files'),
      ],
    },
    providers: [
      makeProvider('claude', true, '2.1', 'session'),
      makeProvider('codex', false),
      makeProvider('gemini', false),
    ],
    keyringCheck: makePassingKeyringCheck(),
    brainLines: 347,
    brainBudget: 600,
    lastSprintId: 'sprint-042',
    debtItems: { total: 0, critical: 0 },
    projectRoot: '/mock/root',
  };

  it('includes Provider Health section when projectRoot is provided', () => {
    const output = formatHumanDoctor(baseInput);
    expect(output).toContain('Provider Health:');
  });

  it('does not include Provider Health section when projectRoot is missing', () => {
    const input = { ...baseInput, projectRoot: undefined };
    const output = formatHumanDoctor(input);
    expect(output).not.toContain('Provider Health:');
  });

  it('shows environment detection in provider health section', () => {
    vi.mocked(detectEnvironment).mockReturnValue('cursor');
    const output = formatHumanDoctor(baseInput);
    expect(output).toContain('Environment: cursor detected');
  });
});
// ─── getProviderInstallHint ──────────────────────────────────────────

describe('getProviderInstallHint', () => {
  it('returns npm install command for claude', () => {
    const hint = getProviderInstallHint('claude');
    expect(hint).toContain('npm i -g');
    expect(hint).toContain('@anthropic-ai/claude-code');
  });

  it('returns npm install command for codex', () => {
    const hint = getProviderInstallHint('codex');
    expect(hint).toContain('npm i -g');
    expect(hint).toContain('@openai/codex');
  });

  it('returns npm install command for gemini', () => {
    const hint = getProviderInstallHint('gemini');
    expect(hint).toContain('npm i -g');
    expect(hint).toContain('@google/gemini-cli');
  });

  it('returns empty string for unknown provider', () => {
    expect(getProviderInstallHint('unknown')).toBe('');
  });

  it('all install hints start with "install:"', () => {
    expect(getProviderInstallHint('claude')).toMatch(/^install:/);
    expect(getProviderInstallHint('codex')).toMatch(/^install:/);
    expect(getProviderInstallHint('gemini')).toMatch(/^install:/);
  });
});

// ─── buildConnectorHealthResults ────────────────────────────────────

describe('buildConnectorHealthResults', () => {
  function makeProvider(name: string, available: boolean, version?: string, authMethod: 'session' | 'api_key' | 'none' = 'none'): DetectedProvider {
    return { name: name as DetectedProvider['name'], available, version, authMethod, models: [] as unknown as DetectedProvider['models'] };
  }

  it('maps available provider with session auth to ok status', () => {
    const results = buildConnectorHealthResults([makeProvider('claude', true, '2.1.81', 'session')]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      provider: 'claude',
      available: true,
      authStatus: 'ok',
      cliVersion: '2.1.81',
      error: null,
    });
  });

  it('maps unavailable provider to missing auth status', () => {
    const results = buildConnectorHealthResults([makeProvider('gemini', false)]);
    expect(results[0]).toMatchObject({
      provider: 'gemini',
      available: false,
      authStatus: 'missing',
      cliVersion: null,
    });
  });

  it('converts full provider list to health results', () => {
    const providers = [
      makeProvider('claude', true, '2.1', 'session'),
      makeProvider('codex', false),
      makeProvider('gemini', false),
    ];
    const results = buildConnectorHealthResults(providers);
    expect(results).toHaveLength(3);
    expect(results.map(r => r.provider)).toEqual(['claude', 'codex', 'gemini']);
  });

  it('returns empty array for empty provider list', () => {
    expect(buildConnectorHealthResults([])).toHaveLength(0);
  });

  it('maps api_key auth to ok status', () => {
    const results = buildConnectorHealthResults([makeProvider('codex', true, '1.0', 'api_key')]);
    expect(results[0]?.authStatus).toBe('ok');
  });

  it('maps available local Ollama runtime to auth-not-applicable ok status', () => {
    const results = buildConnectorHealthResults([makeProvider('ollama', true, undefined, 'none')]);
    expect(results[0]).toMatchObject({
      provider: 'ollama',
      available: true,
      authStatus: 'ok',
    });
  });

  it('sets cliVersion to null when version is undefined', () => {
    const results = buildConnectorHealthResults([makeProvider('gemini', false, undefined)]);
    expect(results[0]?.cliVersion).toBeNull();
  });
});

// ─── formatConnectorHealthLines ─────────────────────────────────────

describe('formatConnectorHealthLines', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadDeckSecrets).mockReturnValue({});
    vi.mocked(validateDeckFile).mockReturnValue({ valid: true, warnings: [], errors: [] });
    vi.mocked(detectEnvironment).mockReturnValue('vscode');
  });

  function makeResult(
    provider: string,
    available: boolean,
    authStatus: 'ok' | 'missing' | 'expired' = 'ok',
    cliVersion: string | null = null,
  ): HealthCheckResult {
    return { provider: provider as HealthCheckResult['provider'], available, authStatus, cliVersion, error: null };
  }

  it('starts with "Provider Health:" header', () => {
    const lines = formatConnectorHealthLines([], '/mock/root');
    expect(lines[0]).toBe('Provider Health:');
  });

  it('shows [PASS] for available provider with ok auth', () => {
    const results = [makeResult('claude', true, 'ok', 'v2.1.81')];
    const lines = formatConnectorHealthLines(results, '/mock/root');
    const claudeLine = lines.find(l => l.includes('Claude'));
    expect(claudeLine).toContain('[PASS]');
    expect(claudeLine).toContain('v2.1.81');
    expect(claudeLine).toContain('session auth active');
  });

  it('shows [PASS] with API key label for non-Claude provider', () => {
    const results = [makeResult('codex', true, 'ok', 'v1.2.0')];
    const lines = formatConnectorHealthLines(results, '/mock/root');
    const codexLine = lines.find(l => l.includes('Codex'));
    expect(codexLine).toContain('[PASS]');
    expect(codexLine).toContain('API key configured');
  });

  it('shows [WARN] with install hint for unavailable provider', () => {
    const results = [makeResult('gemini', false, 'missing')];
    const lines = formatConnectorHealthLines(results, '/mock/root');
    const geminiLine = lines.find(l => l.includes('Gemini'));
    expect(geminiLine).toContain('[WARN]');
    expect(geminiLine).toContain('not installed');
    expect(geminiLine).toContain('install: npm i -g @google/gemini-cli');
  });

  it('shows [WARN] with auth missing for available provider with missing auth', () => {
    const results = [makeResult('codex', true, 'missing', 'v1.0')];
    const lines = formatConnectorHealthLines(results, '/mock/root');
    const codexLine = lines.find(l => l.includes('Codex'));
    expect(codexLine).toContain('[WARN]');
    expect(codexLine).toContain('auth missing');
  });

  it('shows local Ollama as available without inventing cloud auth', () => {
    const results = [makeResult('ollama', true, 'ok')];
    const lines = formatConnectorHealthLines(results, '/mock/root');
    const ollamaLine = lines.find(l => l.includes('Ollama'));
    expect(ollamaLine).toContain('[PASS]');
    expect(ollamaLine).toContain('local runtime available');
    expect(ollamaLine).toContain('authentication not required');
    expect(ollamaLine).not.toContain('auth missing');
    expect(ollamaLine).not.toContain('API key');
  });

  it('shows .deck file status line', () => {
    vi.mocked(loadDeckSecrets).mockReturnValue({
      DECKENT_CLAUDE_API_KEY: 'sk-test',
    });
    const lines = formatConnectorHealthLines([], '/mock/root');
    const deckLine = lines.find(l => l.includes('.deck'));
    expect(deckLine).toBeDefined();
    expect(deckLine).toContain('[PASS]');
    expect(deckLine).toContain('1/9 keys configured');
  });

  it('shows [WARN] for missing .deck file', () => {
    vi.mocked(loadDeckSecrets).mockReturnValue({});
    const lines = formatConnectorHealthLines([], '/mock/root');
    const deckLine = lines.find(l => l.includes('.deck'));
    expect(deckLine).toContain('[WARN]');
  });

  it('shows environment detection line', () => {
    vi.mocked(detectEnvironment).mockReturnValue('cursor');
    const lines = formatConnectorHealthLines([], '/mock/root');
    const envLine = lines.find(l => l.includes('Environment'));
    expect(envLine).toContain('[PASS]');
    expect(envLine).toContain('cursor detected');
  });

  it('shows install hint for codex when unavailable', () => {
    const results = [makeResult('codex', false, 'missing')];
    const lines = formatConnectorHealthLines(results, '/mock/root');
    const codexLine = lines.find(l => l.includes('Codex'));
    expect(codexLine).toContain('@openai/codex');
  });

  it('shows install hint for claude when unavailable', () => {
    const results = [makeResult('claude', false, 'missing')];
    const lines = formatConnectorHealthLines(results, '/mock/root');
    const claudeLine = lines.find(l => l.includes('Claude'));
    expect(claudeLine).toContain('@anthropic-ai/claude-code');
  });
});

// ─── formatHumanDoctor with connectorHealthResults ──────────────────

describe('formatHumanDoctor with connectorHealthResults', () => {
  function makeCheck(name: string, passed: boolean, message: string, required = false) {
    return { name, passed, message, required };
  }

  function makeProvider(name: string, available: boolean, version?: string, authMethod: 'session' | 'api_key' | 'none' = 'none'): DetectedProvider {
    return { name: name as DetectedProvider['name'], available, version, authMethod, models: [] as unknown as DetectedProvider['models'] };
  }

  function makeHealthResult(
    provider: string,
    available: boolean,
    authStatus: 'ok' | 'missing' | 'expired' = 'ok',
    cliVersion: string | null = null,
  ): HealthCheckResult {
    return { provider: provider as HealthCheckResult['provider'], available, authStatus, cliVersion, error: null };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadDeckSecrets).mockReturnValue({});
    vi.mocked(validateDeckFile).mockReturnValue({ valid: true, warnings: [], errors: [] });
    vi.mocked(detectEnvironment).mockReturnValue('vscode');
  });

  const baseInput: HumanDoctorInput = {
    result: {
      ok: true,
      checks: [
        makeCheck('Platform', true, 'Linux'),
        makeCheck('Node.js', true, 'v22.1.0', true),
        makeCheck('git', true, 'v2.43.0', true),
        makeCheck('tmux', true, 'tmux 3.4', true),
        makeCheck('Claude CLI', true, 'v2.1', true),
        makeCheck('Workspace', true, '.deckent/ found'),
        makeCheck('Brain Dir', true, 'All brain files present'),
        makeCheck('Directives', true, 'DIRECTIVES.md found'),
        makeCheck('Brain Budget', true, '347/600 lines'),
        makeCheck('Debt', true, 'No debt file'),
        makeCheck('Locks', true, 'No lock files'),
      ],
    },
    providers: [makeProvider('claude', true, '2.1', 'session')],
    keyringCheck: makePassingKeyringCheck(),
    brainLines: 347,
    brainBudget: 600,
    lastSprintId: 'sprint-046',
    debtItems: { total: 0, critical: 0 },
    projectRoot: '/mock/root',
  };

  it('uses connector format ([PASS]) when connectorHealthResults provided', () => {
    const input = {
      ...baseInput,
      connectorHealthResults: [makeHealthResult('claude', true, 'ok', 'v2.1.81')],
    };
    const output = formatHumanDoctor(input);
    expect(output).toContain('[PASS]');
    expect(output).toContain('session auth active');
  });

  it('shows [WARN] for missing provider in connector format', () => {
    const input = {
      ...baseInput,
      connectorHealthResults: [makeHealthResult('gemini', false, 'missing')],
    };
    const output = formatHumanDoctor(input);
    expect(output).toContain('[WARN]');
    expect(output).toContain('not installed');
  });

  it('falls back to OK/FAIL format when connectorHealthResults absent', () => {
    const input = { ...baseInput };
    // No connectorHealthResults — should use old formatProviderHealthSection
    const output = formatHumanDoctor(input);
    // Old format uses "OK" not "[PASS]"
    expect(output).toContain('OK Claude CLI');
    expect(output).not.toContain('[PASS]');
  });

  it('shows environment in connector health section', () => {
    vi.mocked(detectEnvironment).mockReturnValue('tmux');
    const input = {
      ...baseInput,
      connectorHealthResults: [makeHealthResult('claude', true, 'ok', 'v2.1')],
    };
    const output = formatHumanDoctor(input);
    expect(output).toContain('[PASS] Environment — tmux detected');
  });
});

// ─── Sprint 056-009: New improvements ──────────────────────────────

describe('checkTmux - multi-provider fix (A)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(platform).mockReturnValue('linux' as NodeJS.Platform);
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '', stderr: '', pid: 1, signal: null, output: [] } as ReturnType<typeof spawnSync>);
  });

  it('tmux not found is required=true when only claude provider', () => {
    const check = checkTmux(['claude']);
    expect(check.required).toBe(true);
    expect(check.passed).toBe(false);
  });

  it('tmux not found is required=false when codex provider used', () => {
    const check = checkTmux(['codex']);
    expect(check.required).toBe(false);
    expect(check.message).toContain('not required');
  });

  it('tmux not found is required=false when gemini provider used', () => {
    const check = checkTmux(['gemini']);
    expect(check.required).toBe(false);
  });

  it('tmux found is required=true when only claude (default)', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: 'tmux 3.3', stderr: '', pid: 1, signal: null, output: [] } as ReturnType<typeof spawnSync>);
    const check = checkTmux(['claude']);
    expect(check.required).toBe(true);
    expect(check.passed).toBe(true);
  });

  it('tmux not found is required=true when no provider names given (default)', () => {
    const check = checkTmux();
    expect(check.required).toBe(true);
  });

  it('tmux not found is required=true when mixed but claude included', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '', stderr: '', pid: 1, signal: null, output: [] } as ReturnType<typeof spawnSync>);
    const check = checkTmux(['claude', 'codex']);
    // When claude is present, tmux is still required
    expect(check.required).toBe(true);
  });
});

describe('checkClaude auth check (C)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns passed=false when auth check fails', () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce({ status: 0, stdout: '2.1.0', stderr: '', pid: 1, signal: null, output: [] } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: '', pid: 1, signal: null, output: [] } as ReturnType<typeof spawnSync>);
    const check = checkClaude(true);
    expect(check.passed).toBe(false);
    expect(check.message).toContain('not authenticated');
    expect(check.message).toContain('claude login');
  });

  it('returns passed=true when auth check passes', () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce({ status: 0, stdout: '2.1.0', stderr: '', pid: 1, signal: null, output: [] } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({ status: 0, stdout: 'user@example.com', stderr: '', pid: 1, signal: null, output: [] } as ReturnType<typeof spawnSync>);
    const check = checkClaude(true);
    expect(check.passed).toBe(true);
  });

  it('does not run auth check when checkAuth=false (default)', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '2.1.0', stderr: '', pid: 1, signal: null, output: [] } as ReturnType<typeof spawnSync>);
    const check = checkClaude(false);
    // Only one spawnSync call (version check)
    expect(vi.mocked(spawnSync)).toHaveBeenCalledTimes(1);
    expect(check.passed).toBe(true);
  });
});

// ─── checkDocker false-negative reproducer (473-019 DOCTOR-DOCKER diagnosis) ──
//
// checkDocker() probes availability with `spawnSync('docker', ['info'], ...)`
// ONLY — it never calls `docker version`/`docker --version`, and it only
// inspects `result.status`, never `result.error` (ENOENT vs ETIMEDOUT) or
// `result.signal`. These two tests separate "direct Docker evidence" (what a
// user sees running `docker version` themselves) from "doctor call-path
// evidence" (what checkDocker's own `docker info` probe reports), and prove
// the classification collapse that makes the two diverge.
describe('checkDocker false-negative (473-019 diagnosis reproducer)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('collapses a docker-info timeout into the same message as a genuinely missing binary', () => {
    // A timed-out `docker info` (spawnOpts.timeout=5000 killed the process):
    // Node sets status=null, signal='SIGTERM', and does NOT set error.code to
    // ENOENT the way a missing binary would — but checkDocker only reads
    // `result.status !== 0`, so both cases produce identical output text.
    vi.mocked(spawnSync).mockImplementation((_cmd, args) => {
      if (Array.isArray(args) && args[0] === 'info') {
        return { status: null, signal: 'SIGTERM', stdout: '', stderr: '', pid: 1, output: [] } as unknown as ReturnType<typeof spawnSync>;
      }
      return makeSpawnResult(0, '') as ReturnType<typeof spawnSync>;
    });
    const timedOut = checkDocker(undefined);

    vi.mocked(spawnSync).mockImplementation((_cmd, args) => {
      if (Array.isArray(args) && args[0] === 'info') {
        const err = Object.assign(new Error('spawn docker ENOENT'), { code: 'ENOENT' });
        return { status: null, signal: null, stdout: '', stderr: '', pid: 0, output: [], error: err } as unknown as ReturnType<typeof spawnSync>;
      }
      return makeSpawnResult(0, '') as ReturnType<typeof spawnSync>;
    });
    const missingBinary = checkDocker(undefined);

    // Both surface the exact same advisory text — a daemon timeout is
    // indistinguishable from "docker isn't installed" in doctor's own output.
    expect(timedOut.message).toBe(missingBinary.message);
    expect(timedOut.message).toBe('not installed (optional — enables isolated worker containers)');
  });

  it('reports Docker unavailable via `docker info` even while direct `docker version` (client+server) succeeds', () => {
    vi.mocked(spawnSync).mockImplementation((cmd, args) => {
      if (cmd === 'docker' && Array.isArray(args) && args[0] === 'version') {
        // Direct Docker evidence: a user (or the sprint's tool inventory) runs
        // this and sees both Client and Server sections — Docker IS reachable.
        return makeSpawnResult(0, 'Client:\n Version: 24.0.7\nServer:\n Version: 24.0.7') as ReturnType<typeof spawnSync>;
      }
      if (cmd === 'docker' && Array.isArray(args) && args[0] === 'info') {
        // Doctor's actual call-path: `docker info` fails independently of the
        // `version` handshake above (heavier daemon call — storage driver,
        // plugin, and cgroup introspection; more failure/timeout surface).
        return makeSpawnResult(1, '') as ReturnType<typeof spawnSync>;
      }
      return makeSpawnResult(0, '') as ReturnType<typeof spawnSync>;
    });

    const directEvidence = spawnSync('docker', ['version'], { encoding: 'utf-8' });
    expect(directEvidence.status).toBe(0);
    expect(String(directEvidence.stdout)).toContain('Server:');

    const doctorCallPath = checkDocker('docker');
    expect(doctorCallPath.passed).toBe(false);
    expect(doctorCallPath.required).toBe(true);
    expect(doctorCallPath.message).toContain('Docker not available');

    // checkDocker never issues a `version` call of its own — confirms the
    // call-path is `info`-only, the root of the direct-vs-doctor divergence.
    const infoCalls = vi.mocked(spawnSync).mock.calls.filter(
      ([cmd, args]) => cmd === 'docker' && Array.isArray(args) && args[0] === 'info',
    );
    const versionCallsFromCheckDocker = vi.mocked(spawnSync).mock.calls.filter(
      ([cmd, args]) => cmd === 'docker' && Array.isArray(args) && args[0] === 'version',
    );
    expect(infoCalls.length).toBeGreaterThan(0);
    // The only `version` call was the direct-evidence call this test made itself.
    expect(versionCallsFromCheckDocker.length).toBe(1);
  });
});

describe('checkStaleLocks cleanup hint (D)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stale lock message includes cleanup hint', () => {
    const staleTime = new Date(Date.now() - 600000).toISOString();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['task-001.lock'] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ acquiredAt: staleTime, ownerWorkerId: 'w-001', taskId: '001', filePath: 'x' }));
    const result = runDoctorChecks('/mock/root');
    const lockCheck = result.checks.find(c => c.name === 'Locks');
    expect(lockCheck?.message).toContain('deckent cleanup');
  });
});

describe('checkWritePermissions (E)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
  });

  it('returns passed=true when directories are writable', () => {
    vi.mocked(accessSync).mockReturnValue(undefined);
    const check = checkWritePermissions('/mock/root');
    expect(check.passed).toBe(true);
    expect(check.name).toBe('Write Permissions');
  });

  it('returns passed=false when .tasks/ is not writable', () => {
    vi.mocked(accessSync).mockImplementation((p: unknown) => {
      if (String(p).includes('.tasks')) throw new Error('EACCES');
    });
    const check = checkWritePermissions('/mock/root');
    expect(check.passed).toBe(false);
    expect(check.message).toContain('.tasks');
  });

  it('returns passed=true when directories do not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const check = checkWritePermissions('/mock/root');
    expect(check.passed).toBe(true);
  });

  it('is a required check', () => {
    vi.mocked(accessSync).mockReturnValue(undefined);
    const check = checkWritePermissions('/mock/root');
    expect(check.required).toBe(true);
  });
});

describe('checkDeckSecurity (B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns passed=true when .deck file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const check = checkDeckSecurity('/mock/root');
    expect(check.passed).toBe(true);
    expect(check.message).toContain('not found');
  });

  it('returns passed=false when .deck is tracked by git', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(isDeckFileCommitted).mockReturnValue(true);
    const check = checkDeckSecurity('/mock/root');
    expect(check.passed).toBe(false);
    expect(check.message).toContain('tracked by git');
    expect(check.message).toContain('.gitignore');
  });

  it('returns passed=true when .deck exists but not tracked', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(isDeckFileCommitted).mockReturnValue(false);
    const check = checkDeckSecurity('/mock/root');
    expect(check.passed).toBe(true);
    expect(check.message).toContain('NOT tracked by git');
  });

  it('is not a required check', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const check = checkDeckSecurity('/mock/root');
    expect(check.required).toBe(false);
  });
});

describe('System Health memory deduplication (F)', () => {
  function makeCheck(name: string, passed: boolean, message: string, required = false) {
    return { name, passed, message, required };
  }

  it('System Health section does not repeat memory line from Your Project', () => {
    const input = {
      result: {
        ok: true,
        checks: [
          makeCheck('Platform', true, 'Linux'),
          makeCheck('Node.js', true, 'v22', true),
          makeCheck('git', true, 'v2.40', true),
          makeCheck('tmux', true, 'tmux 3.3', true),
          makeCheck('Claude CLI', true, 'v2', true),
        ],
      },
      providers: [],
      keyringCheck: makePassingKeyringCheck(),
      brainLines: 200,
      brainBudget: 600,
      lastSprintId: null,
      debtItems: { total: 0, critical: 0 },
    };
    const output = formatHumanDoctor(input);
    // Memory line should appear only once (in Your Project, not System Health)
    const memoryOccurrences = (output.match(/Memory:/g) ?? []).length;
    expect(memoryOccurrences).toBe(1);
  });

  it('System Health uses debtItems.total without re-reading file', () => {
    // This test verifies countOpenDebtItems is NOT called from formatHumanDoctor
    // The formatHumanDoctor should use debtItems passed in, not re-compute
    const input = {
      result: { ok: true, checks: [] },
      providers: [],
      keyringCheck: makePassingKeyringCheck(),
      brainLines: 100,
      brainBudget: 600,
      lastSprintId: null,
      debtItems: { total: 7, critical: 2 },
    };
    const output = formatHumanDoctor(input);
    expect(output).toContain('Debt: 7 open item(s)');
    expect(output).toContain('2 critical');
  });
});

describe('runDoctorChecks - includes new checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(platform).mockReturnValue('linux' as NodeJS.Platform);
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: 'v22.0.0', stderr: '', pid: 1, signal: null, output: [] } as ReturnType<typeof spawnSync>);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as ReturnType<typeof readdirSync>);
    mockMemoryStore.totalCount.mockReturnValue(50);
    vi.mocked(readFileSync).mockReturnValue('# Directives content' as unknown as ReturnType<typeof readFileSync>);
    vi.mocked(accessSync).mockReturnValue(undefined);
    vi.mocked(isDeckFileCommitted).mockReturnValue(false);
  });

  it('includes .deck Security check', () => {
    const result = runDoctorChecks('/mock/root');
    const check = result.checks.find(c => c.name === '.deck Security');
    expect(check).toBeDefined();
  });

  it('includes Write Permissions check', () => {
    const result = runDoctorChecks('/mock/root');
    const check = result.checks.find(c => c.name === 'Write Permissions');
    expect(check).toBeDefined();
  });

  it('passes providerNames to checkTmux — tmux not required for non-claude', () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'tmux') return { status: 1, stdout: '', stderr: '', pid: 1, signal: null, output: [] } as ReturnType<typeof spawnSync>;
      return { status: 0, stdout: PASSING_NODE_VERSION, stderr: '', pid: 1, signal: null, output: [] } as ReturnType<typeof spawnSync>;
    });
    // Pass only codex providers → tmux not required
    const result = runDoctorChecks('/mock/root', ['codex']);
    const tmuxCheck = result.checks.find(c => c.name === 'tmux');
    expect(tmuxCheck?.required).toBe(false);
    // ok should still be true since tmux not required
    expect(result.ok).toBe(true);
  });
});

describe('checkGitignore', () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      '.brain/memory.db\n.brain/memory.db-shm\n.brain/memory.db-wal\n'
    );
    vi.mocked(spawnSync).mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as ReturnType<typeof spawnSync>);
  });

  it('passes when all files are gitignored and not tracked', () => {
    const check = checkGitignore('/mock/root');
    expect(check.passed).toBe(true);
    expect(check.name).toBe('Gitignore');
    expect(check.message).toContain('properly gitignored');
  });

  it('fails when a file is tracked by git', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0, stdout: '.brain/memory.db\n', stderr: '', pid: 1, signal: null, output: [],
    } as ReturnType<typeof spawnSync>);
    const check = checkGitignore('/mock/root');
    expect(check.passed).toBe(false);
    expect(check.message).toContain('Tracked by git');
    expect(check.message).toContain('git rm --cached');
  });

  it('fails when .gitignore is missing', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const check = checkGitignore('/mock/root');
    expect(check.passed).toBe(false);
    expect(check.message).toContain('.gitignore not found');
  });

  it('fails when .gitignore entry is missing', () => {
    vi.mocked(readFileSync).mockReturnValue(
      '.brain/memory.db\n# no shm/wal entries\n'
    );
    const check = checkGitignore('/mock/root');
    expect(check.passed).toBe(false);
    expect(check.message).toContain('Missing from .gitignore');
  });

  it('is not a required check', () => {
    const check = checkGitignore('/mock/root');
    expect(check.required).toBe(false);
  });
});

// ─── Sprint 192 Task 192-007 — Ollama in --providers ────────────────

describe('getProviderPartialHint (Sprint 192 Task 192-007 — Ollama hint)', async () => {
  const { getProviderPartialHint, formatProviderDiagnosticsActionable } = await import(
    '../../../src/cli/commands/doctor.js'
  );

  it('returns the ollama-specific actionable hint', () => {
    expect(getProviderPartialHint('ollama')).toMatch(/ollama pull/);
  });

  it('still returns sensible hints for the cloud CLI providers', () => {
    expect(getProviderPartialHint('codex')).toMatch(/OPENAI_API_KEY/);
    expect(getProviderPartialHint('gemini')).toMatch(/GOOGLE_API_KEY/);
    expect(getProviderPartialHint('claude')).toMatch(/claude login/);
  });

  it('falls back to a generic message for unknown providers', () => {
    expect(getProviderPartialHint('unknown-provider')).toMatch(/configure authentication/i);
  });

  it('formats an Ollama partial-state line with the "server reachable" reason', () => {
    const out = formatProviderDiagnosticsActionable([
      {
        name: 'ollama',
        binaryFound: true,
        version: '0.1.30',
        versionStatus: 'ok',
        authMethod: 'none',
        authStatus: 'ok',
        available: false,
        partial: true,
        models: [],
        reason: 'Ollama server reachable but no models installed',
        hints: ['Pull a model: `ollama pull qwen2.5-coder:7b`'],
      },
    ]);

    expect(out).toMatch(/server reachable, no models/);
    expect(out).toMatch(/ollama pull/);
  });

  it('formats an Ollama unreachable line as "server not reachable"', () => {
    const out = formatProviderDiagnosticsActionable([
      {
        name: 'ollama',
        binaryFound: false,
        versionStatus: 'missing',
        authMethod: 'none',
        authStatus: 'missing',
        available: false,
        partial: false,
        models: [],
        reason: 'Ollama probe failed: ECONNREFUSED',
        hints: ['Install Ollama: https://ollama.com/download'],
      },
    ]);

    expect(out).toMatch(/server not reachable/);
  });

  it('labels Ollama ready state with "server" instead of "CLI" in the version suffix', () => {
    const out = formatProviderDiagnosticsActionable([
      {
        name: 'ollama',
        binaryFound: true,
        version: '0.1.30',
        versionStatus: 'ok',
        authMethod: 'none',
        authStatus: 'ok',
        available: true,
        partial: false,
        models: ['qwen2.5-coder:7b'],
        reason: 'Ollama server reachable (1 model)',
        hints: [],
      },
    ]);

    expect(out).toMatch(/Ollama server 0\.1\.30/);
    expect(out).not.toMatch(/Ollama CLI/);
  });
});

describe('runProviderDiagnosticsWithOllama (Sprint 192 Task 192-007)', async () => {
  const { runProviderDiagnosticsWithOllama } = await import(
    '../../../src/cli/commands/doctor.js'
  );

  it('exists as an exported function from doctor.ts', () => {
    expect(typeof runProviderDiagnosticsWithOllama).toBe('function');
  });

  it('returns an entry for every provider including ollama', async () => {
    const r = await runProviderDiagnosticsWithOllama(
      '/mock/root',
      async () => ({
        state: 'logged-in',
        present: true,
        authenticated: true,
        method: 'subscription',
      }),
    );
    const names = r.map(p => p.name).sort();
    expect(names).toContain('claude');
    expect(names).toContain('codex');
    expect(names).toContain('gemini');
    expect(names).toContain('ollama');
  });

  it('ollama entry always carries the ollama-specific hints array', async () => {
    const r = await runProviderDiagnosticsWithOllama(
      '/mock/root',
      async () => ({
        state: 'logged-in',
        present: true,
        authenticated: true,
        method: 'subscription',
      }),
    );
    const ollama = r.find(p => p.name === 'ollama');
    expect(ollama).toBeDefined();
    expect(Array.isArray(ollama!.hints)).toBe(true);
    expect(ollama!.modelsEvidence).toBe('catalog-only');
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  formatDoctorResult: vi.fn().mockReturnValue('Doctor Output'),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../../src/core/utils.js', () => ({
  countBrainLines: vi.fn().mockReturnValue(50),
}));

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
}));

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { print, formatDoctorResult } from '../../../src/cli/helpers/output.js';
import { resolveProjectRoot } from '../../../src/cli/helpers/process.js';
import { countBrainLines } from '../../../src/core/utils.js';
import { getSystemProfile } from '../../../src/core/system-profile.js';
import { detectSubscription } from '../../../src/core/subscription.js';
import { registerDoctor, runDoctorChecks, formatSystemProfile } from '../../../src/cli/commands/doctor.js';

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

// ─── Tests ───────────────────────────────────────────────────────────

describe('registerDoctor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    // Default: all tools found, workspace exists
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, 'v22.0.0') as ReturnType<typeof spawnSync>);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as ReturnType<typeof readdirSync>);
    vi.mocked(countBrainLines).mockReturnValue(50);
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

  it('calls formatDoctorResult and print on basic run', async () => {
    await runCommand(['doctor']);
    expect(formatDoctorResult).toHaveBeenCalled();
    expect(print).toHaveBeenCalledWith('Doctor Output');
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
    // Should not throw, should still call formatDoctorResult
    expect(formatDoctorResult).toHaveBeenCalled();
  });
});

// ─── runDoctorChecks ─────────────────────────────────────────────────

describe('runDoctorChecks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, 'v22.0.0') as ReturnType<typeof spawnSync>);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as ReturnType<typeof readdirSync>);
    vi.mocked(countBrainLines).mockReturnValue(50);
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
      if (cmd === 'node') return makeSpawnResult(0, 'v22.0.0') as ReturnType<typeof spawnSync>;
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
      return makeSpawnResult(0, 'v22.0.0') as ReturnType<typeof spawnSync>;
    });
    const result = runDoctorChecks('/mock/root');
    const gitCheck = result.checks.find(c => c.name === 'git');
    expect(gitCheck).toBeDefined();
    expect(gitCheck!.passed).toBe(true);
  });

  it('includes tmux check in results', () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'tmux') return makeSpawnResult(0, 'tmux 3.3') as ReturnType<typeof spawnSync>;
      return makeSpawnResult(0, 'v22.0.0') as ReturnType<typeof spawnSync>;
    });
    const result = runDoctorChecks('/mock/root');
    const tmuxCheck = result.checks.find(c => c.name === 'tmux');
    expect(tmuxCheck).toBeDefined();
    expect(tmuxCheck!.passed).toBe(true);
  });

  it('includes claude check in results', () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'claude') return makeSpawnResult(0, '1.2.3') as ReturnType<typeof spawnSync>;
      return makeSpawnResult(0, 'v22.0.0') as ReturnType<typeof spawnSync>;
    });
    const result = runDoctorChecks('/mock/root');
    const claudeCheck = result.checks.find(c => c.name === 'Claude CLI');
    expect(claudeCheck).toBeDefined();
    expect(claudeCheck!.passed).toBe(true);
  });

  it('marks ok=true when all required checks pass', () => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, 'v22.0.0') as ReturnType<typeof spawnSync>);
    const result = runDoctorChecks('/mock/root');
    expect(result.ok).toBe(true);
  });

  it('marks ok=false when a required check fails (node not found)', () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'node') return makeSpawnResult(1, '') as ReturnType<typeof spawnSync>;
      return makeSpawnResult(0, 'v22.0.0') as ReturnType<typeof spawnSync>;
    });
    const result = runDoctorChecks('/mock/root');
    expect(result.ok).toBe(false);
  });

  it('marks ok=false when tmux is missing', () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'tmux') return makeSpawnResult(1, '') as ReturnType<typeof spawnSync>;
      return makeSpawnResult(0, 'v22.0.0') as ReturnType<typeof spawnSync>;
    });
    const result = runDoctorChecks('/mock/root');
    expect(result.ok).toBe(false);
  });

  it('marks ok=false when git is missing', () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'git') return makeSpawnResult(1, '') as ReturnType<typeof spawnSync>;
      return makeSpawnResult(0, 'v22.0.0') as ReturnType<typeof spawnSync>;
    });
    const result = runDoctorChecks('/mock/root');
    expect(result.ok).toBe(false);
  });

  it('marks node check failed for Node <18', () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'node') return makeSpawnResult(0, 'v16.0.0') as ReturnType<typeof spawnSync>;
      return makeSpawnResult(0, 'v22.0.0') as ReturnType<typeof spawnSync>;
    });
    const result = runDoctorChecks('/mock/root');
    const nodeCheck = result.checks.find(c => c.name === 'Node.js');
    expect(nodeCheck!.passed).toBe(false);
    expect(result.ok).toBe(false);
  });

  it('non-required checks do not affect ok', () => {
    // All tools pass, workspace missing (non-required)
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, 'v22.0.0') as ReturnType<typeof spawnSync>);
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
  it('doctor result checks have name, passed, message, required fields', () => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, 'v22.0.0') as ReturnType<typeof spawnSync>);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue('content' as unknown as ReturnType<typeof readFileSync>);
    vi.mocked(countBrainLines).mockReturnValue(100);
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
      return makeSpawnResult(0, 'v22.0.0') as ReturnType<typeof spawnSync>;
    });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue('content' as unknown as ReturnType<typeof readFileSync>);
    vi.mocked(countBrainLines).mockReturnValue(100);
    const result = runDoctorChecks('/mock/root');
    const tmuxCheck = result.checks.find(c => c.name === 'tmux');
    expect(tmuxCheck!.passed).toBe(false);
    expect(tmuxCheck!.message).toMatch(/not found/i);
  });

  it('passed check has passed=true and version info in message', () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'git') return makeSpawnResult(0, 'git version 2.40.1') as ReturnType<typeof spawnSync>;
      return makeSpawnResult(0, 'v22.0.0') as ReturnType<typeof spawnSync>;
    });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue('content' as unknown as ReturnType<typeof readFileSync>);
    vi.mocked(countBrainLines).mockReturnValue(100);
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
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, 'v22.0.0') as ReturnType<typeof spawnSync>);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as ReturnType<typeof readdirSync>);
    vi.mocked(countBrainLines).mockReturnValue(50);
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
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as ReturnType<typeof readdirSync>);
    vi.mocked(countBrainLines).mockReturnValue(50);
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
    expect(check!.message).toBe('not found');
  });

  it('claude not found — check returns passed=false', () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'claude') return makeSpawnResult(1, '') as ReturnType<typeof spawnSync>;
      return makeSpawnResult(0, 'v22.0.0') as ReturnType<typeof spawnSync>;
    });
    const result = runDoctorChecks('/mock/root');
    const check = result.checks.find(c => c.name === 'Claude CLI');
    expect(check!.passed).toBe(false);
    expect(check!.message).toBe('not found');
  });

  it('workspace missing — check returns passed=false with hint message', () => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, 'v22.0.0') as ReturnType<typeof spawnSync>);
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
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, 'v22.0.0') as ReturnType<typeof spawnSync>);
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

  it('brain budget over 300 — check passes=false with decay hint', () => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, 'v22.0.0') as ReturnType<typeof spawnSync>);
    vi.mocked(countBrainLines).mockReturnValue(350);
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
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as ReturnType<typeof readdirSync>);
    vi.mocked(countBrainLines).mockReturnValue(50);
    vi.mocked(readFileSync).mockReturnValue('# Content' as unknown as ReturnType<typeof readFileSync>);
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('sets process.exitCode=1 when a required check fails', async () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'tmux') return makeSpawnResult(1, '') as ReturnType<typeof spawnSync>;
      return makeSpawnResult(0, 'v22.0.0') as ReturnType<typeof spawnSync>;
    });
    await runCommand(['doctor']);
    expect(process.exitCode).toBe(1);
  });

  it('does NOT set process.exitCode=1 when all required checks pass', async () => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, 'v22.0.0') as ReturnType<typeof spawnSync>);
    await runCommand(['doctor']);
    expect(process.exitCode).toBeUndefined();
  });
});

// ─── i18n integration ─────────────────────────────────────────────────

describe('i18n integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, 'v22.0.0') as ReturnType<typeof spawnSync>);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as ReturnType<typeof readdirSync>);
    vi.mocked(countBrainLines).mockReturnValue(50);
    vi.mocked(readFileSync).mockReturnValue('# Content' as unknown as ReturnType<typeof readFileSync>);
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('prints doctor.checks_passed message after running checks', async () => {
    await runCommand(['doctor']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.some(c => String(c).includes('checks passed'))).toBe(true);
  });

  it('checks_passed message includes total check count', async () => {
    await runCommand(['doctor']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    const passedMsg = calls.find(c => String(c).includes('checks passed'));
    expect(passedMsg).toBeDefined();
    // runDoctorChecks returns 10 checks total
    expect(String(passedMsg)).toMatch(/\/10/);
  });

  it('uses tr language when config has language=tr', async () => {
    vi.mocked(existsSync).mockImplementation((p: string) => {
      if (String(p).includes('config.json')) return true;
      return true;
    });
    vi.mocked(readFileSync).mockImplementation((p: string) => {
      if (String(p).includes('config.json')) return JSON.stringify({ language: 'tr' });
      return '# Content';
    });
    await runCommand(['doctor']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    // Turkish: 'Sonuç: {passed}/{total} kontrol geçti'
    expect(calls.some(c => String(c).includes('kontrol geçti'))).toBe(true);
  });

  it('falls back to en when config missing', async () => {
    vi.mocked(existsSync).mockImplementation((p: string) => {
      if (String(p).includes('config.json')) return false;
      return true;
    });
    await runCommand(['doctor']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.some(c => String(c).includes('checks passed'))).toBe(true);
  });

  it('falls back to en when config has invalid JSON', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation((p: string) => {
      if (String(p).includes('config.json')) return 'NOT JSON';
      return '# Content';
    });
    await runCommand(['doctor']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.some(c => String(c).includes('checks passed'))).toBe(true);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

import { spawnSync } from 'node:child_process';
import { print, printError } from '../../../src/cli/helpers/output.js';
import {
  registerUpgrade,
  compareVersions,
  checkLatestVersion,
  executeUpgrade,
} from '../../../src/cli/commands/upgrade.js';

// ─── Setup ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
});

afterEach(() => {
  process.exitCode = undefined;
});

// ─── compareVersions ────────────────────────────────────────────────

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });

  it('returns -1 when current < latest', () => {
    expect(compareVersions('1.0.0', '1.1.0')).toBe(-1);
  });

  it('returns 1 when current > latest', () => {
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
  });

  it('handles v prefix', () => {
    expect(compareVersions('v1.0.0', 'v1.0.0')).toBe(0);
  });

  it('compares patch versions', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
  });

  it('compares major versions', () => {
    expect(compareVersions('1.9.9', '2.0.0')).toBe(-1);
  });
});

// ─── checkLatestVersion ─────────────────────────────────────────────

describe('checkLatestVersion', () => {
  it('returns version when npm view succeeds', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '1.2.3\n',
      stderr: '',
      error: undefined,
      pid: 0,
      output: [],
      signal: null,
    });
    expect(checkLatestVersion()).toBe('1.2.3');
  });

  it('returns null when npm view fails', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'not found',
      error: undefined,
      pid: 0,
      output: [],
      signal: null,
    });
    expect(checkLatestVersion()).toBeNull();
  });

  it('returns null when spawnSync throws', () => {
    vi.mocked(spawnSync).mockImplementation(() => { throw new Error('ENOENT'); });
    expect(checkLatestVersion()).toBeNull();
  });
});

// ─── executeUpgrade ─────────────────────────────────────────────────

describe('executeUpgrade', () => {
  it('prints current version', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: '',
      stderr: '',
      error: undefined,
      pid: 0,
      output: [],
      signal: null,
    });
    executeUpgrade({});
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.some(msg => msg.includes('Current version'))).toBe(true);
  });

  it('shows "Could not check" when npm fails', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: '',
      stderr: '',
      error: undefined,
      pid: 0,
      output: [],
      signal: null,
    });
    executeUpgrade({});
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.some(msg => msg.includes('Could not check'))).toBe(true);
  });

  it('shows "Already up to date" when same version', () => {
    // First call: checkLatestVersion, returns current version
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '0.0.0\n', // matches DECKENT_VERSION default
      stderr: '',
      error: undefined,
      pid: 0,
      output: [],
      signal: null,
    });
    executeUpgrade({});
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.some(msg => msg.includes('up to date'))).toBe(true);
  });

  it('--check flag only shows info without installing', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '99.99.99\n',
      stderr: '',
      error: undefined,
      pid: 0,
      output: [],
      signal: null,
    });
    executeUpgrade({ check: true });
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.some(msg => msg.includes('Update available'))).toBe(true);
    expect(calls.some(msg => msg.includes('without --check'))).toBe(true);
  });
});

// ─── registerUpgrade ────────────────────────────────────────────────

describe('registerUpgrade', () => {
  it('registers upgrade command on program', () => {
    const program = new Command();
    registerUpgrade(program);
    const cmd = program.commands.find(c => c.name() === 'upgrade');
    expect(cmd).toBeDefined();
  });

  it('upgrade command has a description', () => {
    const program = new Command();
    registerUpgrade(program);
    const cmd = program.commands.find(c => c.name() === 'upgrade');
    expect(cmd!.description()).toBeTruthy();
  });

  it('has --check option', () => {
    const program = new Command();
    registerUpgrade(program);
    const cmd = program.commands.find(c => c.name() === 'upgrade');
    const opts = cmd!.options.map(o => o.long);
    expect(opts).toContain('--check');
  });
});

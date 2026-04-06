import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: '1.0.0\n', stderr: '', error: undefined }),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue('{"name": "test-project"}'),
}));

// Mock getSystemProfile at the right path (relative to the source module that imports it)
vi.mock('../../core/system-profile.js', () => ({
  getSystemProfile: vi.fn().mockReturnValue({
    cpuCores: 8,
    totalMemMB: 16384,
    freeMemMB: 8192,
    recommendedMaxWorkers: 4,
  }),
}));

vi.mock('../../src/cli/helpers/wizard.js', () => ({
  runWizard: vi.fn().mockResolvedValue({
    language: 'en',
    mode: 'performance',
    runInit: false,
  }),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/tmp/test'),
}));

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { print } from '../../src/cli/helpers/output.js';
import { runWizard } from '../../src/cli/helpers/wizard.js';
import type { WizardResult } from '../../src/cli/helpers/wizard.js';
import {
  registerOnboard,
  detectClaudeCli,
  detectProjectInfo,
  buildOnboardSteps,
  runOnboard,
} from '../../src/cli/commands/onboard.js';

// ─── Setup ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(existsSync).mockReturnValue(false);
  vi.mocked(readFileSync).mockReturnValue('{"name": "test-project"}');
  vi.mocked(spawnSync).mockReturnValue({
    status: 0,
    stdout: '1.0.0\n',
    stderr: '',
    error: undefined,
    pid: 0,
    output: [],
    signal: null,
  });
  vi.mocked(runWizard).mockResolvedValue({
    language: 'en',
    mode: 'performance',
    runInit: false,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── detectClaudeCli ────────────────────────────────────────────────

describe('detectClaudeCli', () => {
  it('returns available:true when claude CLI found', () => {
    const result = detectClaudeCli();
    expect(result.available).toBe(true);
    expect(result.version).toBe('1.0.0');
  });

  it('returns available:false when claude CLI not found', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'not found',
      error: undefined,
      pid: 0,
      output: [],
      signal: null,
    });
    const result = detectClaudeCli();
    expect(result.available).toBe(false);
  });

  it('returns available:false when spawnSync throws', () => {
    vi.mocked(spawnSync).mockImplementation(() => { throw new Error('ENOENT'); });
    const result = detectClaudeCli();
    expect(result.available).toBe(false);
  });
});

// ─── detectProjectInfo ──────────────────────────────────────────────

describe('detectProjectInfo', () => {
  it('detects project name from package.json', () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      return path.endsWith('package.json');
    });
    const info = detectProjectInfo('/tmp/test');
    expect(info.name).toBe('test-project');
    expect(info.hasPackageJson).toBe(true);
  });

  it('detects TypeScript when tsconfig.json exists', () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      return path.endsWith('package.json') || path.endsWith('tsconfig.json');
    });
    const info = detectProjectInfo('/tmp/test');
    expect(info.hasTsConfig).toBe(true);
    expect(info.language).toBe('typescript');
  });

  it('returns unknown when no package.json', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const info = detectProjectInfo('/tmp/test');
    expect(info.name).toBe('unknown');
    expect(info.hasPackageJson).toBe(false);
  });
});

// ─── buildOnboardSteps ──────────────────────────────────────────────

describe('buildOnboardSteps', () => {
  it('returns array of wizard steps', () => {
    const steps = buildOnboardSteps('my-project');
    expect(steps.length).toBeGreaterThan(0);
    for (const step of steps) {
      expect(step).toHaveProperty('id');
      expect(step).toHaveProperty('prompt');
      expect(step).toHaveProperty('type');
    }
  });

  it('includes language selection step', () => {
    const steps = buildOnboardSteps('my-project');
    const langStep = steps.find(s => s.id === 'language');
    expect(langStep).toBeDefined();
    expect(langStep!.type).toBe('select');
  });

  it('includes mode selection step', () => {
    const steps = buildOnboardSteps('my-project');
    const modeStep = steps.find(s => s.id === 'mode');
    expect(modeStep).toBeDefined();
  });

  it('includes init confirmation step', () => {
    const steps = buildOnboardSteps('my-project');
    const initStep = steps.find(s => s.id === 'runInit');
    expect(initStep).toBeDefined();
    expect(initStep!.type).toBe('confirm');
  });
});

// ─── runOnboard ─────────────────────────────────────────────────────

describe('runOnboard', () => {
  it('prints welcome message', async () => {
    await runOnboard('/tmp/test', { nonInteractive: true });
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.some(msg => msg.includes('Welcome'))).toBe(true);
  });

  it('prints Claude CLI status', async () => {
    await runOnboard('/tmp/test', { nonInteractive: true });
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.some(msg => msg.includes('Claude CLI'))).toBe(true);
  });

  it('prints system info', async () => {
    await runOnboard('/tmp/test', { nonInteractive: true });
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.some(msg => msg.includes('CPU') || msg.includes('System'))).toBe(true);
  });

  it('prints ready message', async () => {
    await runOnboard('/tmp/test', { nonInteractive: true });
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.some(msg => msg.includes('Ready'))).toBe(true);
  });

  it('calls runWizard', async () => {
    await runOnboard('/tmp/test', {});
    expect(runWizard).toHaveBeenCalled();
  });
});

// ─── registerOnboard ────────────────────────────────────────────────

describe('registerOnboard', () => {
  it('registers onboard command', () => {
    const program = new Command();
    registerOnboard(program);
    const cmd = program.commands.find(c => c.name() === 'onboard');
    expect(cmd).toBeDefined();
  });

  it('has --non-interactive option', () => {
    const program = new Command();
    registerOnboard(program);
    const cmd = program.commands.find(c => c.name() === 'onboard');
    const opts = cmd!.options.map(o => o.long);
    expect(opts).toContain('--non-interactive');
  });

  it('has a description', () => {
    const program = new Command();
    registerOnboard(program);
    const cmd = program.commands.find(c => c.name() === 'onboard');
    expect(cmd!.description()).toBeTruthy();
  });
});

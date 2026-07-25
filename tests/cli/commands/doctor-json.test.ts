import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules before import
vi.mock('../../../src/core/provider.js', () => ({
  detectAvailableProviders: vi.fn().mockResolvedValue([
    { name: 'claude', available: true, version: '1.0.0', authMethod: 'session' },
    { name: 'codex', available: false, version: null, authMethod: 'none' },
  ]),
  formatDetectedProviders: vi.fn().mockReturnValue('providers'),
}));

vi.mock('../../../src/core/provider-auth-probe.js', () => ({
  probeProviderAuth: vi.fn().mockResolvedValue({
    state: 'logged-out',
    method: 'none',
    detail: 'fixture detail must not be serialized',
  }),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/tmp/test-root'),
}));

vi.mock('../../../src/cli/helpers/config-reader.js', () => ({
  getLangFromConfig: vi.fn().mockReturnValue('en'),
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
  detectSubscription: vi.fn().mockReturnValue({ detected: 'pro' }),
}));

import { Command } from 'commander';
import { registerDoctor, runDoctorChecks } from '../../../src/cli/commands/doctor.js';

// Capture print output
let printOutput: string[] = [];
vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn((...args: unknown[]) => { printOutput.push(args.map(String).join(' ')); }),
  formatDoctorResult: vi.fn().mockReturnValue('formatted'),
}));

describe('doctor --json', () => {
  beforeEach(() => {
    printOutput = [];
    vi.clearAllMocks();
  });

  function buildProgram(): Command {
    const program = new Command();
    program.exitOverride();
    registerDoctor(program);
    return program;
  }

  it('should output valid JSON', async () => {
    const program = buildProgram();
    await program.parseAsync(['node', 'test', 'doctor', '--json']);
    expect(printOutput.length).toBeGreaterThan(0);
    const parsed = JSON.parse(printOutput[0]!);
    expect(parsed).toBeDefined();
  });

  it('should include ok boolean field', async () => {
    const program = buildProgram();
    await program.parseAsync(['node', 'test', 'doctor', '--json']);
    const parsed = JSON.parse(printOutput[0]!);
    expect(typeof parsed.ok).toBe('boolean');
  });

  it('should include checks array', async () => {
    const program = buildProgram();
    await program.parseAsync(['node', 'test', 'doctor', '--json']);
    const parsed = JSON.parse(printOutput[0]!);
    expect(Array.isArray(parsed.checks)).toBe(true);
    expect(parsed.checks.length).toBeGreaterThan(0);
  });

  it('should include providers array', async () => {
    const program = buildProgram();
    await program.parseAsync(['node', 'test', 'doctor', '--json']);
    const parsed = JSON.parse(printOutput[0]!);
    expect(Array.isArray(parsed.providers)).toBe(true);
  });

  it('projects bounded auth truth without serializing raw probe detail', async () => {
    const program = buildProgram();
    await program.parseAsync(['node', 'test', 'doctor', '--json']);
    const parsed = JSON.parse(printOutput[0]!);

    expect(parsed.providerAuth).toEqual([
      {
        provider: 'claude',
        available: true,
        state: 'logged-out',
        method: 'none',
        ready: false,
        evidence: 'local-auth-probe',
      },
      {
        provider: 'codex',
        available: false,
        state: 'unavailable',
        method: 'none',
        ready: false,
        evidence: 'availability-only',
      },
    ]);
    expect(parsed.providerSummary).toEqual({
      ready: 0,
      total: 2,
      authWarningCount: 1,
    });
    expect(parsed.checks).toContainEqual(expect.objectContaining({
      name: 'Claude authentication',
      passed: false,
      required: false,
    }));
    expect(parsed.honestSummary.missingCount).toBeGreaterThan(0);
    expect(JSON.stringify(parsed)).not.toContain('fixture detail must not be serialized');
  });

  it('should include profile when --profile is set', async () => {
    const program = buildProgram();
    await program.parseAsync(['node', 'test', 'doctor', '--json', '--profile']);
    const parsed = JSON.parse(printOutput[0]!);
    expect(parsed.profile).toBeDefined();
    expect(parsed.profile.cpuCores).toBe(8);
    expect(parsed.subscription).toBe('pro');
  });

  it('should not include profile without --profile flag', async () => {
    const program = buildProgram();
    await program.parseAsync(['node', 'test', 'doctor', '--json']);
    const parsed = JSON.parse(printOutput[0]!);
    expect(parsed.profile).toBeUndefined();
  });
});

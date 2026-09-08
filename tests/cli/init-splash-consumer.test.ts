/**
 * 7099-CB10 — init splash consumer hermetic regression.
 * Proves registerInit calls showSplash(DECKENT_VERSION) before welcome banner (init.ts:382-385).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
  openSync: vi.fn().mockReturnValue(42),
  closeSync: vi.fn(),
  fsyncSync: vi.fn(),
  renameSync: vi.fn(),
  rmSync: vi.fn(),
  realpathSync: Object.assign(vi.fn((path: string) => path), { native: vi.fn((path: string) => path) }),
  lstatSync: vi.fn((path: string) => ({
    isSymbolicLink: () => false,
    isDirectory: () => !/\.(?:md|json)$/i.test(path),
    isFile: () => /\.(?:md|json)$/i.test(path),
  })),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 1, stdout: '', stderr: 'mocked' }),
  spawn: vi.fn(),
  execSync: vi.fn().mockReturnValue(''),
}));

const showSplashMock = vi.fn().mockReturnValue('MOCK_SPLASH');
vi.mock('../../src/cli/helpers/splash.js', () => ({
  showSplash: (...args: unknown[]) => showSplashMock(...args),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/init-root'),
}));

vi.mock('../../src/cli/helpers/prompt.js', () => ({
  promptText: vi.fn(),
  promptSelect: vi.fn(),
  promptConfirm: vi.fn(),
}));

vi.mock('../../src/cli/auto-setup.js', () => ({
  generateSetupRecommendation: vi.fn().mockReturnValue({ mode: 'balanced', reasons: [] }),
}));

vi.mock('../../src/core/system-profile.js', () => ({
  getSystemProfile: vi.fn().mockReturnValue({ cpus: 4, ram: 8 }),
}));

vi.mock('../../src/core/subscription.js', () => ({
  detectSubscription: vi.fn().mockReturnValue({ detected: 'unknown', plan: 'unknown' }),
}));

vi.mock('../../src/core/analyzer.js', () => ({
  analyzeProject: vi.fn().mockReturnValue({ language: 'typescript', framework: 'none' }),
}));

vi.mock('../../src/core/environment.js', () => ({
  detectEnvironment: vi.fn().mockReturnValue('shell'),
}));

vi.mock('../../src/core/stack-detector.js', () => ({
  detectFullStack: vi.fn().mockReturnValue({
    language: 'typescript', framework: 'none', buildTool: 'tsc', testFramework: 'vitest',
    commands: { build: '', test: '', lint: '', typecheck: '' },
  }),
}));

vi.mock('../../src/core/provider.js', () => ({
  detectAvailableProviders: vi.fn().mockResolvedValue([
    { name: 'claude', available: true, version: '1.0.0', authMethod: 'session', models: ['sonnet'] },
  ]),
}));

vi.mock('../../src/cli/helpers/wizard.js', () => ({
  detectIDEEnvironment: vi.fn().mockReturnValue('terminal'),
  getMCPGuidance: vi.fn().mockReturnValue([]),
  buildProviderWizardSteps: vi.fn().mockReturnValue({
    autoConfig: { brain_provider: 'claude', worker_provider: 'claude', selectedProviders: ['claude'] },
    steps: [],
  }),
  resolveProviderWizardResult: vi.fn(),
  formatProviderAuthGuidance: vi.fn().mockReturnValue([]),
  runWizard: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../src/cli/commands/doctor.js', () => ({
  runDoctorChecks: vi.fn().mockReturnValue({ ok: true, checks: [] }),
}));

vi.mock('../../src/cli/commands/init-steps.js', () => ({
  createDirectories: vi.fn(),
  clearStaleCaches: vi.fn(),
  writeConfig: vi.fn().mockResolvedValue(undefined),
  writeStackAndDeckentFile: vi.fn(),
  writeAgentFiles: vi.fn(),
  writeMultiEnvConfig: vi.fn(),
  writeDeckSecurityFiles: vi.fn(),
  writeRuleFiles: vi.fn(),
  writeDirectivesFile: vi.fn(),
  writeBrainFiles: vi.fn(),
  updateGitignore: vi.fn(),
  writeProviderConfig: vi.fn(),
  ALL_ENV_NAMES: ['dev'],
}));

vi.mock('../../src/core/provisioner.js', () => ({
  collectMissingTools: vi.fn().mockReturnValue([]),
  resolveProvisionMode: vi.fn().mockReturnValue('no-install'),
  provisionMissing: vi.fn(),
  planInstall: vi.fn(),
}));

vi.mock('../../src/core/worker-image-check.js', () => ({
  DEFAULT_WORKER_IMAGE: 'deckent/worker:latest',
  buildSuggestedImageCmd: vi.fn().mockReturnValue(''),
}));

vi.mock('../../src/core/system-capacity.js', () => ({
  probeDockerDaemon: vi.fn().mockResolvedValue({ available: false }),
}));

vi.mock('../../src/cli/commands/image.js', () => ({
  handleImageBuild: vi.fn(),
}));

import { print } from '../../src/cli/helpers/output.js';
import { DECKENT_VERSION } from '../../src/core/constants.js';
import { registerInit } from '../../src/cli/commands/init.js';

describe('init splash consumer contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    showSplashMock.mockReturnValue('MOCK_SPLASH');
  });

  it('wires showSplash at init.ts consumer site (static)', async () => {
    const realFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    const src = realFs.readFileSync(join(REPO_ROOT, 'src/cli/commands/init.ts'), 'utf8') as string;
    expect(src).toContain("import { showSplash } from '../helpers/splash.js'");
    expect(src).toMatch(/showSplash\(DECKENT_VERSION\)/);
    expect(src).toMatch(/if \(splash\) print\(splash\)/);
  });

  it('invokes showSplash once on init --yes before other output', async () => {
    const program = new Command();
    registerInit(program);
    const initCmd = program.commands.find((c) => c.name() === 'init');
    expect(initCmd).toBeDefined();
    await initCmd!.parseAsync(['--yes', '--no-install', '--no-image'], { from: 'user' });

    expect(showSplashMock).toHaveBeenCalledTimes(1);
    expect(showSplashMock).toHaveBeenCalledWith(DECKENT_VERSION);
    expect(vi.mocked(print).mock.calls[0]?.[0]).toBe('MOCK_SPLASH');
  });

  it('does not skip splash when showSplash returns non-empty under dumb env', async () => {
    showSplashMock.mockReturnValue('ASCII_KRAKEN_SPLASH');
    const program = new Command();
    registerInit(program);
    const initCmd = program.commands.find((c) => c.name() === 'init')!;
    await initCmd.parseAsync(['--yes', '--no-install', '--no-image'], { from: 'user' });
    expect(vi.mocked(print).mock.calls.map((c) => c[0]).join('\n')).toContain('ASCII_KRAKEN_SPLASH');
  });
});

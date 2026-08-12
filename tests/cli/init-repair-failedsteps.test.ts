// tests/cli/init-repair-failedsteps.test.ts
//
// Task 388-010 (born-578) — `init --repair` didn't fill `failedSteps`, so a
// user could never see WHICH step actually failed (dishonest UX). init.ts
// declared the `failedSteps` array and had two dead reporting blocks (the
// `--repair` "Failed steps:" section and the fatal-catch "Previously failed
// steps:" section) but nothing ever pushed into it.
//
// This is a full-flow integration test mirroring the mock set from
// tests/cli/commands/init.test.ts so registerInit's action can run to
// completion via program.parseAsync — the failedSteps array is a local
// closure variable, not exported, so it can only be observed through the
// command's printed output.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks (same set as tests/cli/commands/init.test.ts) ────────────────────

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
  // 524-010 sınıfı: initializeWorkspaceArtifacts realpathSync.native + lstatSync ister.
  realpathSync: Object.assign(vi.fn((path: string) => path), {
    native: vi.fn((path: string) => path),
  }),
  lstatSync: vi.fn((path: string) => ({
    isSymbolicLink: () => false,
    isDirectory: () => !/\.(?:md|json)$/i.test(path),
    isFile: () => /\.(?:md|json)$/i.test(path),
  })),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../src/cli/helpers/prompt.js', () => ({
  promptText: vi.fn().mockResolvedValue('my-project'),
  promptSelect: vi.fn().mockResolvedValue('max_plan'),
  promptConfirm: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../src/cli/auto-setup.js', () => ({
  generateSetupRecommendation: vi.fn().mockReturnValue({
    mode: 'max_plan',
    reasons: ['Detected Max subscription', 'Multi-core system'],
  }),
}));

vi.mock('../../src/core/system-profile.js', () => ({
  getSystemProfile: vi.fn().mockReturnValue({ cpus: 8, ram: 16 }),
}));

vi.mock('../../src/core/subscription.js', () => ({
  detectSubscription: vi.fn().mockReturnValue({ detected: 'max', plan: 'max' }),
}));

vi.mock('../../src/core/analyzer.js', () => ({
  analyzeProject: vi.fn().mockReturnValue({ language: 'typescript', framework: 'none' }),
}));

vi.mock('../../src/core/utils.js', () => ({
  ensureDeckentImport: vi.fn(),
}));

vi.mock('../../src/core/config.js', () => ({
  resolveBrainModel: () => 'sonnet',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  deepMerge: vi.fn().mockImplementation((a: Record<string, unknown>, b: Record<string, unknown>) => ({ ...a, ...b })),
}));

vi.mock('../../src/cli/helpers/splash.js', () => ({
  showSplash: vi.fn().mockReturnValue('KRAKEN SPLASH'),
}));

vi.mock('../../src/core/environment.js', () => ({
  detectEnvironment: vi.fn().mockReturnValue('shell'),
}));

vi.mock('../../src/core/deck-file.js', () => ({
  createDeckTemplate: vi.fn(),
  ensureDeckGitignore: vi.fn(),
}));

vi.mock('../../src/cli/commands/doctor.js', () => ({
  runDoctorChecks: vi.fn().mockReturnValue({ ok: true, checks: [] }),
}));

vi.mock('../../src/cli/helpers/codex-config.js', () => ({
  generateCodexConfig: vi.fn().mockReturnValue({ global: '/home/.codex/config.toml', project: '/mock/root/.codex/config.toml' }),
}));

vi.mock('../../src/cli/helpers/gemini-config.js', () => ({
  generateGeminiConfig: vi.fn().mockReturnValue({ settingsPath: '/home/.gemini/settings.json' }),
}));

vi.mock('../../src/cli/helpers/cursor-config.js', () => ({
  generateCursorConfig: vi.fn().mockReturnValue({ mcpPath: '/mock/root/.cursor/mcp.json', rulesPath: '/mock/root/.cursor/rules/deckent.mdc' }),
}));

vi.mock('../../src/cli/helpers/agent-templates.js', () => ({
  generateAgentsMd: vi.fn().mockReturnValue('# AGENTS.md — Deckent Integration\n\nProject: test (typescript/unknown)\n'),
  generateGeminiMd: vi.fn().mockReturnValue('# GEMINI.md — Deckent Integration\n\nProject: test (typescript/unknown)\n'),
  generateCursorRules: vi.fn().mockReturnValue('---\ndescription: Deckent rules\nglobs: **/*\n---\n# Deckent Integration\n'),
  appendDeckentSection: vi.fn(),
}));

vi.mock('../../src/core/stack-detector.js', () => ({
  detectFullStack: vi.fn().mockReturnValue({
    language: 'typescript',
    framework: 'express',
    buildTool: 'tsc',
    testFramework: 'vitest',
    commands: { build: 'npx tsc', test: 'npx vitest run', lint: 'npx eslint' },
  }),
}));

vi.mock('../../src/core/provider.js', () => ({
  detectAvailableProviders: vi.fn().mockResolvedValue([
    { name: 'claude', available: true, version: '1.0.0', authMethod: 'session', models: ['opus', 'sonnet', 'haiku'] },
  ]),
}));

vi.mock('../../src/cli/helpers/wizard.js', () => ({
  detectIDEEnvironment: vi.fn().mockReturnValue('terminal'),
  getMCPGuidance: vi.fn().mockReturnValue(['Terminal mode — MCP server binary: deckent-mcp']),
  buildProviderWizardSteps: vi.fn().mockReturnValue({
    autoConfig: {
      brain_provider: 'claude',
      worker_provider: 'claude',
      selectedProviders: ['claude'],
    },
    steps: [],
  }),
  resolveProviderWizardResult: vi.fn().mockReturnValue({
    brain_provider: 'claude',
    worker_provider: 'claude',
    selectedProviders: ['claude'],
  }),
  formatProviderAuthGuidance: vi.fn().mockReturnValue([]),
  runWizard: vi.fn().mockResolvedValue({ brain_provider: 'claude', worker_provider: 'claude' }),
}));

import { existsSync } from 'node:fs';
import { print } from '../../src/cli/helpers/output.js';
import { registerInit } from '../../src/cli/commands/init.js';
import { runDoctorChecks } from '../../src/cli/commands/doctor.js';
import { detectAvailableProviders } from '../../src/core/provider.js';
import { showSplash } from '../../src/cli/helpers/splash.js';
import { detectEnvironment } from '../../src/core/environment.js';
import { createDeckTemplate } from '../../src/core/deck-file.js';
import { promptSelect, promptText } from '../../src/cli/helpers/prompt.js';
import { detectFullStack } from '../../src/core/stack-detector.js';

// ─── Helpers ─────────────────────────────────────────────────────────

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerInit(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride
  }
}

function printedText(): string {
  return vi.mocked(print).mock.calls.map((c) => String(c[0])).join('\n');
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('init --repair failedSteps honesty (388-010)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;

    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(promptSelect).mockResolvedValue('max_plan' as any);
    vi.mocked(promptText).mockResolvedValue('my-project');
    vi.mocked(detectEnvironment).mockReturnValue('shell');
    vi.mocked(showSplash).mockReturnValue('KRAKEN SPLASH');
    vi.mocked(createDeckTemplate).mockImplementation(() => {});
    vi.mocked(runDoctorChecks).mockReturnValue({ ok: true, checks: [] });
    vi.mocked(detectFullStack).mockReturnValue({
      language: 'typescript',
      framework: 'express',
      buildTool: 'tsc',
      testFramework: 'vitest',
      commands: { build: 'npx tsc', test: 'npx vitest run', lint: 'npx eslint' },
    });
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('happy path + --repair: failedSteps stays empty, no "Failed steps:" section printed', async () => {
    await runCommand(['init', '--auto', '--repair']);
    expect(printedText()).not.toContain('Failed steps:');
    expect(process.exitCode).toBeUndefined();
  });

  it('a locally-caught step failure fills failedSteps and is shown under --repair', async () => {
    vi.mocked(detectFullStack).mockImplementation(() => {
      throw new Error('stack detect boom');
    });

    await runCommand(['init', '--auto', '--repair']);

    const out = printedText();
    expect(out).toContain('Failed steps:');
    expect(out).toContain('stack-detection');
    expect(out).toContain('stack detect boom');
    expect(out).toContain('deckent init --upgrade');
    // Non-fatal: init continues to completion, no exit-code-1 abort.
    expect(process.exitCode).toBeUndefined();
  });

  it('the same failure WITHOUT --repair stays silent (happy-path/no-flag behavior unchanged)', async () => {
    vi.mocked(detectFullStack).mockImplementation(() => {
      throw new Error('stack detect boom');
    });

    await runCommand(['init', '--auto']);

    const out = printedText();
    expect(out).not.toContain('Failed steps:');
    expect(process.exitCode).toBeUndefined();
  });

  it('a fatal (unwrapped) step failure records the failing step name via the currentStep breadcrumb', async () => {
    vi.mocked(detectAvailableProviders).mockRejectedValueOnce(new Error('network error'));

    await runCommand(['init', '--auto']);

    const out = printedText();
    expect(out).toContain('Previously failed steps:');
    expect(out).toContain('detect-providers');
    expect(out).toContain('network error');
    expect(out).toContain('deckent init --upgrade');
    expect(process.exitCode).toBe(1);
  });
});

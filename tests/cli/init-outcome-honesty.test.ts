// tests/cli/init-outcome-honesty.test.ts
//
// Task 412-001 (RC2-A / INIT-01) — `deckent init` used to print "You're ready!"
// and exit 0 unconditionally, even with zero provider CLIs and zero doctor
// evidence of a usable setup (a dishonest READY for a brand-new user). This
// file proves the fix: a three-state, honestly-reported outcome contract —
// READY (exit 0) / SETUP_INCOMPLETE (exit 2, blocker+remediation list, NEVER
// the "You're ready" phrase) / FAILED (exit 1, unchanged from before).
//
// Part 1 is pure-function unit tests for the classification/formatting logic
// in init-wizard.ts (no mocking needed). Part 2 is full registerInit
// integration tests, mirroring the exact mock harness already proven in
// tests/cli/init-repair-failedsteps.test.ts — this is the hermetic stand-in
// for "PATH stripped of provider CLIs in a tmpdir": detectAvailableProviders
// is mocked to resolve with every provider `available:false`, which is
// functionally identical to a PATH with no claude/codex/gemini binary on it,
// without spawning any real subprocess.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Part 1: pure-function unit tests ──────────────────────────────────────

import {
  classifyInitOutcome,
  buildInitUsageBlockers,
  formatInitOutcomeBlock,
  initOutcomeExitCode,
} from '../../src/cli/commands/init-wizard.js';

describe('classifyInitOutcome', () => {
  it('READY when no fatal failure and no blockers', () => {
    expect(classifyInitOutcome(false, [])).toBe('READY');
  });

  it('SETUP_INCOMPLETE when no fatal failure but at least one blocker exists', () => {
    expect(classifyInitOutcome(false, [{ id: 'x', reason: 'r', remediation: 'm' }])).toBe('SETUP_INCOMPLETE');
  });

  it('FAILED wins over blockers whenever a fatal failure occurred', () => {
    expect(classifyInitOutcome(true, [])).toBe('FAILED');
    expect(classifyInitOutcome(true, [{ id: 'x', reason: 'r', remediation: 'm' }])).toBe('FAILED');
  });
});

describe('initOutcomeExitCode', () => {
  it('maps the three-state contract to exit codes 0 / 2 / 1', () => {
    expect(initOutcomeExitCode('READY')).toBe(0);
    expect(initOutcomeExitCode('SETUP_INCOMPLETE')).toBe(2);
    expect(initOutcomeExitCode('FAILED')).toBe(1);
  });
});

describe('buildInitUsageBlockers', () => {
  it('returns no blockers when a provider is available and doctor is clean', () => {
    const blockers = buildInitUsageBlockers(
      { availableProviderCount: 1, failedRequiredDoctorChecks: [] },
      'en',
    );
    expect(blockers).toEqual([]);
  });

  it('adds a no-provider blocker with an exact, runnable remediation command when zero providers are available', () => {
    const blockers = buildInitUsageBlockers(
      { availableProviderCount: 0, failedRequiredDoctorChecks: [] },
      'en',
    );
    expect(blockers).toHaveLength(1);
    expect(blockers[0]!.id).toBe('no-provider');
    expect(blockers[0]!.remediation).toContain('npm install -g @anthropic-ai/claude-code');
    expect(blockers[0]!.remediation).toContain('claude login');
  });

  it('adds one blocker per still-failing required doctor check, naming the check', () => {
    const blockers = buildInitUsageBlockers(
      {
        availableProviderCount: 1,
        failedRequiredDoctorChecks: [{ name: 'Node.js', message: 'not found — Install Node.js >=18' }],
      },
      'en',
    );
    expect(blockers).toHaveLength(1);
    expect(blockers[0]!.id).toBe('doctor:Node.js');
    expect(blockers[0]!.reason).toContain('Node.js');
    expect(blockers[0]!.remediation).toContain('deckent doctor');
  });

  it('adds a doctor-verification-failed blocker when the doctor step itself threw', () => {
    const blockers = buildInitUsageBlockers(
      { availableProviderCount: 1, failedRequiredDoctorChecks: [], doctorVerificationError: 'boom' },
      'en',
    );
    expect(blockers.some(b => b.id === 'doctor-verification-failed')).toBe(true);
  });

  it('renders Turkish blocker text for lang=tr', () => {
    const blockers = buildInitUsageBlockers(
      { availableProviderCount: 0, failedRequiredDoctorChecks: [] },
      'tr',
    );
    expect(blockers[0]!.reason).toContain('provider');
    expect(blockers[0]!.reason).toContain('algılanmadı');
  });
});

describe('formatInitOutcomeBlock', () => {
  it('READY output states the outcome token and has no blockers section', () => {
    const out = formatInitOutcomeBlock({ outcome: 'READY', blockers: [] }, 'en');
    expect(out).toContain('READY');
    expect(out).not.toContain('Blockers:');
    expect(out).not.toContain("You're ready");
  });

  it('SETUP_INCOMPLETE output states the token, lists blockers with a Fix: line, and never says "You\'re ready"', () => {
    const blockers = buildInitUsageBlockers({ availableProviderCount: 0, failedRequiredDoctorChecks: [] }, 'en');
    const out = formatInitOutcomeBlock({ outcome: 'SETUP_INCOMPLETE', blockers }, 'en');
    expect(out).toContain('SETUP_INCOMPLETE');
    expect(out).toContain('Blockers:');
    expect(out).toContain('Fix:');
    expect(out).not.toContain("You're ready");
  });

  it('FAILED output states the token and never says "You\'re ready"', () => {
    const out = formatInitOutcomeBlock({ outcome: 'FAILED', blockers: [] }, 'en');
    expect(out).toContain('FAILED');
    expect(out).not.toContain("You're ready");
  });
});

// ─── Part 2: full registerInit integration (mock harness mirrors
// tests/cli/init-repair-failedsteps.test.ts) ────────────────────────────────

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
}));

// Defensive-hermeticity net (born-incident: a worker's real `npm install`
// once deleted a native binding and took down DB access host-wide): even
// though the scenarios below are chosen so `provisionMissing` never reaches
// a real install (see per-test comments), mock child_process spawnSync too
// so ANY accidental path into installTool() cannot spawn a real npm command.
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 1, stdout: '', stderr: 'mocked: no real installs in tests' }),
  spawn: vi.fn(),
  execSync: vi.fn().mockReturnValue(''),
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

import { writeFileSync, existsSync } from 'node:fs';
import { print } from '../../src/cli/helpers/output.js';
import { registerInit } from '../../src/cli/commands/init.js';
import { runDoctorChecks } from '../../src/cli/commands/doctor.js';
import { detectAvailableProviders } from '../../src/core/provider.js';
import { showSplash } from '../../src/cli/helpers/splash.js';
import { detectEnvironment } from '../../src/core/environment.js';
import { createDeckTemplate } from '../../src/core/deck-file.js';
import { promptSelect, promptText } from '../../src/cli/helpers/prompt.js';
import { detectFullStack } from '../../src/core/stack-detector.js';
import { buildProviderWizardSteps } from '../../src/cli/helpers/wizard.js';

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

describe('init outcome honesty (412-001)', () => {
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
    vi.mocked(detectAvailableProviders).mockResolvedValue([
      { name: 'claude', available: true, version: '1.0.0', authMethod: 'session', models: ['opus', 'sonnet', 'haiku'] } as any,
    ]);
    vi.mocked(buildProviderWizardSteps).mockReturnValue({
      autoConfig: { brain_provider: 'claude' as any, worker_provider: 'claude' as any, selectedProviders: ['claude'] as any[] },
      steps: [],
    });
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  // ─── RED-reproduce (today's bug, mocked as evidence) ────────────────
  // A PATH with zero provider CLIs on it detects every provider as
  // `available: false` — this is the hermetic equivalent of stripping
  // claude/codex/gemini off PATH in a tmpdir. Before this task, this
  // scenario printed "You're ready!" and exited 0.

  it('zero providers available -> SETUP_INCOMPLETE, exit 2, blocker+remediation shown, "You\'re ready" NEVER printed', async () => {
    vi.mocked(detectAvailableProviders).mockResolvedValue([
      { name: 'claude', available: false, authMethod: 'none', models: [] } as any,
      { name: 'codex', available: false, authMethod: 'none', models: [] } as any,
      { name: 'gemini', available: false, authMethod: 'none', models: [] } as any,
    ]);
    // Mirrors buildProviderWizardSteps' REAL zero-provider branch (wizard.ts):
    // fallback config is still auto-selected (selectedProviders: []), so config.json
    // stays valid — only the outcome must change, not the write.
    vi.mocked(buildProviderWizardSteps).mockReturnValue({
      autoConfig: { brain_provider: 'claude' as any, worker_provider: 'claude' as any, selectedProviders: [] as any[] },
      steps: [],
    });

    await runCommand(['init', '--auto']);

    const out = printedText();
    expect(process.exitCode).toBe(2);
    expect(out).toContain('SETUP_INCOMPLETE');
    expect(out).toContain('Blockers:');
    expect(out).toMatch(/npm install -g @anthropic-ai\/claude-code/);
    expect(out).not.toContain("You're ready");

    // Requirement (3): the fallback config is still WRITTEN (never silently dropped) —
    // only its honesty-reporting changes.
    const writeCalls = vi.mocked(writeFileSync).mock.calls;
    const configCalls = writeCalls.filter(c => String(c[0]).includes('config.json'));
    const providerConfigCall = configCalls.find(c => JSON.parse(String(c[1])).brain_provider !== undefined);
    expect(providerConfigCall).toBeDefined();
    expect(JSON.parse(String(providerConfigCall![1])).brain_provider).toBe('claude');
  });

  it('required doctor check still failing after provisioning -> SETUP_INCOMPLETE, exit 2, names the check', async () => {
    // 'git' is intentionally NOT in provisioner's DOCTOR_NAME_TO_TOOL map, so this
    // never touches provisionMissing/installTool — stays fully hermetic regardless
    // of --yes/--no-install.
    vi.mocked(runDoctorChecks).mockReturnValue({
      ok: false,
      checks: [{ name: 'git', passed: false, required: true, message: 'not found — Install git' }],
    });

    await runCommand(['init', '--auto']);

    const out = printedText();
    expect(process.exitCode).toBe(2);
    expect(out).toContain('SETUP_INCOMPLETE');
    expect(out).toContain('git');
    expect(out).toContain('deckent doctor');
    expect(out).not.toContain("You're ready");
  });

  // ─── --yes non-interactive path: same contract ───────────────────────

  it('--yes with a failing required doctor check -> same SETUP_INCOMPLETE/exit-2 contract', async () => {
    vi.mocked(runDoctorChecks).mockReturnValue({
      ok: false,
      checks: [{ name: 'git', passed: false, required: true, message: 'not found — Install git' }],
    });

    await runCommand(['init', '--auto', '--yes']);

    const out = printedText();
    expect(process.exitCode).toBe(2);
    expect(out).toContain('SETUP_INCOMPLETE');
    expect(out).not.toContain("You're ready");
  });

  // ─── GREEN: happy path stays READY, exit 0 (unchanged) ────────────────

  it('happy path (provider available, doctor ok) -> READY, exit stays 0 (undefined), "You\'re ready" still printed', async () => {
    await runCommand(['init', '--auto']);

    const out = printedText();
    expect(process.exitCode).toBeUndefined();
    expect(out).toContain('READY');
    expect(out).toContain("You're ready");
  });

  // ─── FAILED: unchanged fatal-catch exit code, now also outcome-labeled ─

  it('a fatal (unwrapped) step failure -> FAILED, exit 1 (unchanged), outcome block says FAILED', async () => {
    vi.mocked(detectAvailableProviders).mockRejectedValueOnce(new Error('network error'));

    await runCommand(['init', '--auto']);

    const out = printedText();
    expect(process.exitCode).toBe(1);
    expect(out).toContain('FAILED');
    expect(out).not.toContain("You're ready");
  });
});

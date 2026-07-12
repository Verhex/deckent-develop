import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import type { OnboardingWizardResult } from '../../src/cli/helpers/onboarding-wizard.js';

// ONB-ENTRY-WIRE (Sprint 363 Task 363-005): hermetic tests for the NEW
// `--plan-only` (+ `--json`) and TTY Ink-flow paths wired into `deckent
// onboard`. Mirrors connect-wizard/onboarding-wizard's own hermeticity
// conventions — `runOnboardingWizard` is mocked with a fixture result (the
// "fixture-probe" hermetic path the goCriteria calls for), so no real CLI
// spawn / network probe ever runs. `ink`'s `render` is mocked too (this repo
// has no ink-testing-library — see repl/onboarding-ui.tsx's own module doc)
// so no real terminal mount happens; the mock captures the element's props
// so the flow-control branches (onApply/onCancel) can be exercised directly.
//
// The pre-existing wizard-stub flow (`runOnboard`/`buildOnboardSteps`) is
// deliberately NOT re-tested here — tests/cli/commands/onboard.test.ts and
// tests/cli/onboard.test.ts already cover it and are out of this task's
// write scope; this file only covers the two NEW branches this task adds.

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../src/core/system-profile.js', () => ({
  getSystemProfile: vi.fn().mockReturnValue({
    cpuCores: 4,
    totalMemMB: 8192,
    recommendedMaxWorkers: 3,
  }),
}));

vi.mock('../../src/cli/helpers/wizard.js', () => ({
  runWizard: vi.fn().mockResolvedValue({ language: 'en', mode: 'performance', runInit: false }),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: '1.0.0\n', stderr: '', error: null }),
}));

// Hermetic fs: no real config.json / package.json is ever read.
vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue('{}'),
}));

vi.mock('../../src/core/constants.js', () => ({
  RUNTIME_DIR: '.deckent/runtime',  // sprint-429 (429-011) tool-inventory yolu modül-yüklemede okur
  DECKENT_DIR: '.deckent',
  SETTINGS_DIR: '.deckent/settings',  // born-630 allowscope-zinciri modül-yüklemede okur
  DECKENT_VERSION: '0.2.0-beta.1',
}));

const FIXTURE_RESULT: OnboardingWizardResult = {
  steps: [],
  providers: [
    {
      name: 'claude',
      discovery: { name: 'claude', present: true, version: '1.2.3', authState: 'unknown' },
      auth: { state: 'logged-in', method: 'subscription' },
    },
    {
      name: 'codex',
      discovery: { name: 'codex', present: false, authState: 'unknown' },
      auth: { state: 'unknown' },
    },
  ],
  mcp: [
    {
      host: 'claude',
      status: { host: 'claude', supported: true, attached: false, toolCount: 31 },
      suggested: true,
      attachCommand: { cmd: 'claude', args: ['mcp', 'add', 'deckent'] },
      descriptionKey: 'onboarding.mcp.attach_suggested',
      descriptionParams: { host: 'claude' },
    },
    {
      host: 'codex',
      status: { host: 'codex', supported: false, attached: false, toolCount: 0, reason: 'cli-not-installed' },
      suggested: false,
      descriptionKey: 'onboarding.mcp.host_not_installed',
      descriptionParams: { host: 'codex' },
    },
  ],
  workspaceQuestions: {
    scope: {
      id: 'workspace_scope',
      promptKey: 'onboarding.question.workspace_scope',
      choices: [
        { value: 'project', labelKey: 'onboarding.choice.workspace_scope.project' },
        { value: 'global', labelKey: 'onboarding.choice.workspace_scope.global' },
      ],
      defaultValue: 'project',
    },
    mode: {
      id: 'plan_mode',
      promptKey: 'onboarding.question.plan_mode',
      choices: [{ value: 'balanced', labelKey: 'onboarding.choice.plan_mode.balanced' }],
      defaultValue: 'balanced',
    },
  },
  workspace: { scope: 'project', mode: 'balanced', root: '/mock/root' },
  providerSelection: { brain_provider: 'claude', worker_provider: 'claude', fallback_provider: undefined },
  configPlan: {
    configPath: '/mock/root/.deckent/config.json',
    applied: false,
    fields: {
      mode: 'balanced',
      language: 'en',
      projectName: 'test-project',
      brain_provider: 'claude',
      worker_provider: 'claude',
      fallback_provider: undefined,
    },
    mcpAttachActions: [{ host: 'claude', command: ['claude', 'mcp', 'add', 'deckent'] }],
  },
};

const runOnboardingWizardMock = vi.fn().mockResolvedValue(FIXTURE_RESULT);
vi.mock('../../src/cli/helpers/onboarding-wizard.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/cli/helpers/onboarding-wizard.js')>(
    '../../src/cli/helpers/onboarding-wizard.js',
  );
  return { ...actual, runOnboardingWizard: (...args: unknown[]) => runOnboardingWizardMock(...args) };
});

// Mocked `ink` — no real terminal mount. `render` captures the element so
// tests can invoke `onApply`/`onCancel` directly. `waitUntilExit` mirrors
// real Ink's contract: it resolves ONLY once `unmount()` is actually called
// — resolving it eagerly would let `runOnboardInkFlow` race past its
// post-exit `if (applied)` check before the test ever fires `onApply`.
let lastRenderedElement: { props: Record<string, unknown> } | null = null;
const unmountMock = vi.fn();
let resolveExit: (() => void) | null = null;
const renderMock = vi.fn((element: { props: Record<string, unknown> }) => {
  lastRenderedElement = element;
  return {
    unmount: (...args: unknown[]) => {
      unmountMock(...args);
      resolveExit?.();
    },
    waitUntilExit: () => new Promise<void>((resolve) => { resolveExit = resolve; }),
    rerender: vi.fn(),
  };
});
vi.mock('ink', () => ({ render: (element: { props: Record<string, unknown> }) => renderMock(element) }));

import { print } from '../../src/cli/helpers/output.js';
import {
  registerOnboard,
  formatOnboardingPlanReport,
  runOnboardPlanOnly,
  runOnboardInkFlow,
} from '../../src/cli/commands/onboard.js';

// ─── Helpers ─────────────────────────────────────────────────────────

async function runCommand(args: string[] = []): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerOnboard(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  runOnboardingWizardMock.mockResolvedValue(FIXTURE_RESULT);
  lastRenderedElement = null;
  resolveExit = null;
});

afterEach(() => {
  process.exitCode = undefined;
});

// ─── registerOnboard — new options ─────────────────────────────────────

describe('registerOnboard — ONB-ENTRY-WIRE options', () => {
  it('registers --plan-only and --json options alongside the pre-existing ones', () => {
    const program = new Command();
    registerOnboard(program);
    const cmd = program.commands.find((c) => c.name() === 'onboard');
    const opts = cmd!.options.map((o) => o.long);
    expect(opts).toContain('--plan-only');
    expect(opts).toContain('--json');
    expect(opts).toContain('--non-interactive');
    expect(opts).toContain('--force');
  });
});

// ─── --plan-only ─────────────────────────────────────────────────────

describe('onboard --plan-only', () => {
  it('calls runOnboardingWizard exactly once and prints a text report', async () => {
    await runCommand(['onboard', '--plan-only']);
    expect(runOnboardingWizardMock).toHaveBeenCalledTimes(1);
    expect(print).toHaveBeenCalledTimes(1);
    const output = vi.mocked(print).mock.calls[0]![0] as string;
    expect(output).toContain('Deckent Onboarding Plan');
  });

  it('never spawns a subprocess (no deckent init call)', async () => {
    const { spawnSync } = await import('node:child_process');
    await runCommand(['onboard', '--plan-only']);
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('prints valid JSON of the wizard result with --json', async () => {
    await runCommand(['onboard', '--plan-only', '--json']);
    const output = vi.mocked(print).mock.calls[0]![0] as string;
    const parsed = JSON.parse(output) as OnboardingWizardResult;
    expect(parsed.configPlan.configPath).toBe(FIXTURE_RESULT.configPlan.configPath);
    expect(parsed.configPlan.applied).toBe(false);
  });

  it('is available directly via runOnboardPlanOnly (non-CLI entry point)', async () => {
    await runOnboardPlanOnly('/mock/root', {});
    expect(print).toHaveBeenCalledTimes(1);
  });
});

// ─── formatOnboardingPlanReport ─────────────────────────────────────────

describe('formatOnboardingPlanReport', () => {
  it('renders every section with resolved (non-key) i18n text, both languages', () => {
    for (const lang of ['en', 'tr']) {
      const report = formatOnboardingPlanReport(FIXTURE_RESULT, lang);
      expect(report).not.toContain('undefined');
      expect(report).not.toMatch(/onboarding\.[a-z_.]+$/m); // no raw unresolved key on its own line
      expect(report).toContain('claude');
    }
  });

  it('marks the present/logged-in provider [OK] and the missing one [--] or dim', () => {
    const report = formatOnboardingPlanReport(FIXTURE_RESULT, 'en');
    const lines = report.split('\n');
    const claudeLine = lines.find((l) => l.includes('claude') && l.includes('found'));
    expect(claudeLine).toMatch(/^\s*\[OK\]/);
  });

  it('includes the config path from the plan', () => {
    const report = formatOnboardingPlanReport(FIXTURE_RESULT, 'en');
    expect(report).toContain(FIXTURE_RESULT.configPlan.configPath);
  });
});

// ─── TTY Ink flow ────────────────────────────────────────────────────

describe('runOnboardInkFlow', () => {
  it('mounts the Ink OnboardingWizardView with a resolveLabel bound to the wizard result', async () => {
    vi.useFakeTimers();
    const flowDone = runOnboardInkFlow('/mock/root');
    await vi.advanceTimersByTimeAsync(0);
    expect(runOnboardingWizardMock).toHaveBeenCalledTimes(1);
    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(lastRenderedElement).not.toBeNull();
    expect(lastRenderedElement!.props['wizard']).toBe(FIXTURE_RESULT);
    expect(typeof lastRenderedElement!.props['resolveLabel']).toBe('function');

    // waitUntilExit only resolves once unmount() fires (real Ink contract, see
    // the `ink` mock above) — cancel to let the flow finish and avoid a
    // dangling unresolved promise leaking into the next test.
    (lastRenderedElement!.props['onCancel'] as () => void)();
    await vi.advanceTimersByTimeAsync(200);
    await flowDone;
    vi.useRealTimers();
  });

  it('prints the "not applied" notice after onApply fires, and never writes/spawns', async () => {
    vi.useFakeTimers();
    const flowDone = runOnboardInkFlow('/mock/root');
    // render() is called synchronously before waitUntilExit is awaited — flush
    // microtasks so `lastRenderedElement` is populated before reading its props.
    await vi.advanceTimersByTimeAsync(0);
    const props = lastRenderedElement!.props as { onApply: (plan: unknown) => void };
    props.onApply(FIXTURE_RESULT.configPlan);
    await vi.advanceTimersByTimeAsync(200);
    await flowDone;
    vi.useRealTimers();

    expect(unmountMock).toHaveBeenCalled();
    const printed = vi.mocked(print).mock.calls.map((c) => c[0]);
    expect(printed.some((p) => typeof p === 'string' && p.includes('No files were written'))).toBe(true);

    const { spawnSync } = await import('node:child_process');
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('does not print the "not applied" notice on cancel', async () => {
    vi.useFakeTimers();
    const flowDone = runOnboardInkFlow('/mock/root');
    await vi.advanceTimersByTimeAsync(0);
    const props = lastRenderedElement!.props as { onCancel: () => void };
    props.onCancel();
    await vi.advanceTimersByTimeAsync(200);
    await flowDone;
    vi.useRealTimers();

    expect(print).not.toHaveBeenCalled();
  });
});

// ─── Non-interactive fallback stays wired to the pre-existing stub flow ─

describe('onboard (no flags, non-TTY) — pre-existing flow untouched', () => {
  it('does not call runOnboardingWizard or mount Ink when falling back to the old flow', async () => {
    await runCommand(['onboard']);
    expect(runOnboardingWizardMock).not.toHaveBeenCalled();
    expect(renderMock).not.toHaveBeenCalled();
  });
});

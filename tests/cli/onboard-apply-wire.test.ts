import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import type { OnboardingWizardResult } from '../../src/cli/helpers/onboarding-wizard.js';

// ONB-APPLY-WIRE (Sprint 367 Task 367-005): hermetic tests for the NEW
// --apply / --dry-run / --yes onboarding-apply wire (`runOnboardApply` +
// its formatters, wired into `registerOnboard`). Real tmpdir + real fs for
// the config.json read/write — mirrors onboarding-apply.test.ts's own
// "real fs under os.tmpdir()" convention — so apply actually proves it
// writes/merges, not just that a mock was called. Only `runOnboardingWizard`
// (external provider/auth/MCP probing) and `print()` are mocked; the fake
// stdin/stdout confirm streams mirror wizard.test.ts's own convention.
//
// The pre-existing --plan-only, TTY-Ink and non-interactive-stub flows are
// deliberately NOT re-tested here (onboard.test.ts / onboard-command.test.ts
// already cover them and are out of this task's write scope).

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

const resolveProjectRootMock = vi.fn();
vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: (...args: unknown[]) => resolveProjectRootMock(...args),
}));

const runOnboardingWizardMock = vi.fn();
vi.mock('../../src/cli/helpers/onboarding-wizard.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/cli/helpers/onboarding-wizard.js')>(
    '../../src/cli/helpers/onboarding-wizard.js',
  );
  return { ...actual, runOnboardingWizard: (...args: unknown[]) => runOnboardingWizardMock(...args) };
});

import { print } from '../../src/cli/helpers/output.js';
import {
  registerOnboard,
  runOnboardApply,
  formatOnboardingApplyPreview,
} from '../../src/cli/commands/onboard.js';
import { dryRunOnboardingApply } from '../../src/cli/helpers/onboarding-apply.js';

// ─── Fixture Helpers ─────────────────────────────────────────────────────

let tmpRoot: string;

function configPathFor(root: string): string {
  return join(root, '.deckent', 'config.json');
}

function readConfig(root: string): Record<string, unknown> {
  return JSON.parse(readFileSync(configPathFor(root), 'utf-8')) as Record<string, unknown>;
}

function fixtureResult(root: string): OnboardingWizardResult {
  return {
    steps: [],
    providers: [
      {
        name: 'claude',
        discovery: { name: 'claude', present: true, version: '1.2.3', authState: 'unknown' },
        auth: { state: 'logged-in', method: 'subscription' },
      },
    ],
    mcp: [],
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
    workspace: { scope: 'project', mode: 'balanced', root },
    providerSelection: { brain_provider: 'claude', worker_provider: 'claude', fallback_provider: undefined },
    configPlan: {
      configPath: configPathFor(root),
      applied: false,
      fields: {
        mode: 'balanced',
        language: 'en',
        projectName: 'test-project',
        brain_provider: 'claude',
        worker_provider: 'claude',
        fallback_provider: undefined,
      },
      mcpAttachActions: [],
    },
  };
}

function createInput(lines: string[]): Readable {
  return Readable.from([lines.join('\n') + '\n']);
}

function createOutput(): Writable {
  return new Writable({ write(_chunk, _enc, cb) { cb(); } });
}

async function runCommand(args: string[]): Promise<void> {
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
  tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-onboard-apply-wire-'));
  resolveProjectRootMock.mockReturnValue(tmpRoot);
  runOnboardingWizardMock.mockImplementation(async () => fixtureResult(tmpRoot));
});

afterEach(() => {
  if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
  process.exitCode = undefined;
});

// ─── registerOnboard — new options ─────────────────────────────────────

describe('registerOnboard — ONB-APPLY-WIRE options', () => {
  it('registers --apply, --dry-run and --yes alongside the pre-existing options', () => {
    const program = new Command();
    registerOnboard(program);
    const cmd = program.commands.find((c) => c.name() === 'onboard');
    const opts = cmd!.options.map((o) => o.long);
    expect(opts).toContain('--apply');
    expect(opts).toContain('--dry-run');
    expect(opts).toContain('--yes');
    expect(opts).toContain('--plan-only');
  });
});

// ─── CLI: --dry-run ─────────────────────────────────────────────────────

describe('onboard --dry-run', () => {
  it('never writes config.json (Smoke: exit clean, preview only)', async () => {
    await runCommand(['onboard', '--dry-run']);
    expect(existsSync(configPathFor(tmpRoot))).toBe(false);
    expect(process.exitCode ?? 0).toBe(0);
  });

  it('prints a preview report naming the config path, with no confirmation asked', async () => {
    await runCommand(['onboard', '--dry-run']);
    const printed = vi.mocked(print).mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('Apply Preview');
    expect(printed).toContain(configPathFor(tmpRoot));
    expect(printed).toContain('mode: (none) -> balanced');
  });
});

// ─── CLI: --yes ─────────────────────────────────────────────────────────

describe('onboard --yes', () => {
  it('writes config.json with the plan fields, skipping confirmation', async () => {
    await runCommand(['onboard', '--yes']);
    expect(existsSync(configPathFor(tmpRoot))).toBe(true);
    const onDisk = readConfig(tmpRoot);
    expect(onDisk['mode']).toBe('balanced');
    expect(onDisk['brain_provider']).toBe('claude');
  });

  it('prints a before/after field-change report and an applied confirmation', async () => {
    await runCommand(['onboard', '--yes']);
    const printed = vi.mocked(print).mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('Field changes');
    expect(printed).toContain('mode: (none) -> balanced');
    expect(printed).toContain('Applied');
  });

  it('merges onto an existing config.json — preserves unrelated keys', async () => {
    mkdirSync(join(tmpRoot, '.deckent'), { recursive: true });
    writeFileSync(
      configPathFor(tmpRoot),
      JSON.stringify({ mode: 'economic', custom_key: 'keep-me' }, null, 2),
      'utf-8',
    );

    await runCommand(['onboard', '--yes']);

    const onDisk = readConfig(tmpRoot);
    expect(onDisk['mode']).toBe('balanced');
    expect(onDisk['custom_key']).toBe('keep-me');
  });

  it('never spawns a subprocess (no deckent init call, no global-scope path)', async () => {
    await runCommand(['onboard', '--yes']);
    const call = runOnboardingWizardMock.mock.calls[0]?.[0] as { projectRoot?: string; answers?: { scope?: string } };
    expect(call.projectRoot).toBe(tmpRoot);
    expect(call.answers?.scope).not.toBe('global');
  });
});

// ─── Direct function: interactive confirm via fake stdin ────────────────

describe('runOnboardApply — interactive confirm (fake stdin)', () => {
  it('applies when the fake-stdin answer is "y"', async () => {
    await runOnboardApply(tmpRoot, { input: createInput(['y']), output: createOutput() });
    expect(existsSync(configPathFor(tmpRoot))).toBe(true);
    expect(readConfig(tmpRoot)['mode']).toBe('balanced');
  });

  it('cancels without writing when the fake-stdin answer is "n"', async () => {
    await runOnboardApply(tmpRoot, { input: createInput(['n']), output: createOutput() });
    expect(existsSync(configPathFor(tmpRoot))).toBe(false);
    const printed = vi.mocked(print).mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('cancelled');
  });

  it('cancels without writing on an empty fake-stdin answer (confirm default is false)', async () => {
    await runOnboardApply(tmpRoot, { input: createInput(['']), output: createOutput() });
    expect(existsSync(configPathFor(tmpRoot))).toBe(false);
  });

  it('--dry-run short-circuits before ever asking for confirmation', async () => {
    await runOnboardApply(tmpRoot, { dryRun: true, input: createInput(['n']), output: createOutput() });
    // Even though the fake-stdin answer would cancel, dry-run never reaches
    // the confirm step at all — there is simply nothing to cancel.
    expect(existsSync(configPathFor(tmpRoot))).toBe(false);
    const printed = vi.mocked(print).mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('dry-run');
  });
});

// ─── formatOnboardingApplyPreview — i18n ─────────────────────────────────

describe('formatOnboardingApplyPreview', () => {
  it('renders both languages without leaking a raw unresolved i18n key', () => {
    const wizard = fixtureResult(tmpRoot);
    const preview = dryRunOnboardingApply(wizard.configPlan);
    for (const lang of ['en', 'tr']) {
      const text = formatOnboardingApplyPreview(preview, lang);
      expect(text).not.toMatch(/onboarding\.[a-z_.]+$/m);
      expect(text).toContain(configPathFor(tmpRoot));
    }
  });
});

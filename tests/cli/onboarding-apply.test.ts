import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  previewOnboardingApply,
  dryRunOnboardingApply,
  applyOnboardingPlan,
  revertOnboardingApply,
} from '../../src/cli/helpers/onboarding-apply.js';
import { planConfigWrite } from '../../src/cli/helpers/onboarding-wizard.js';
import type {
  OnboardingWorkspaceSelection,
  OnboardingProviderSelection,
  OnboardingMcpSuggestion,
} from '../../src/cli/helpers/onboarding-wizard.js';
import { getModePreset } from '../../src/core/mode-presets.js';

// ONB-WIZARD-APPLY (Sprint 365, Task 365-007): the layer that applies
// 361-009's OnboardingConfigWritePlan to disk. Real fs + real tmpdir per
// project convention (session-registry.test.ts et al.) — hermetic because
// every fixture lives under os.tmpdir(), never the project root or HOME.

// ─── Fixture Helpers ─────────────────────────────────────────────────────

let tmpRoot: string;

afterEach(() => {
  if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
});

function freshProjectRoot(): string {
  tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-onboarding-apply-'));
  return tmpRoot;
}

function configPathFor(root: string): string {
  return join(root, '.deckent', 'config.json');
}

function writeExistingConfig(root: string, data: Record<string, unknown>): void {
  const configPath = configPathFor(root);
  mkdirSync(join(root, '.deckent'), { recursive: true });
  writeFileSync(configPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function readConfig(root: string): Record<string, unknown> {
  return JSON.parse(readFileSync(configPathFor(root), 'utf-8')) as Record<string, unknown>;
}

/** Builds a real plan via planConfigWrite (361-009), not a hand-rolled fixture. */
function buildPlan(root: string, overrides: {
  workspace?: Partial<OnboardingWorkspaceSelection>;
  providerSelection?: Partial<OnboardingProviderSelection>;
  mcp?: OnboardingMcpSuggestion[];
} = {}) {
  const workspace: OnboardingWorkspaceSelection = {
    scope: 'project',
    mode: 'balanced',
    root,
    modePreset: getModePreset('balanced'),
    ...overrides.workspace,
  };
  const providerSelection: OnboardingProviderSelection = {
    brain_provider: 'claude',
    worker_provider: 'claude',
    ...overrides.providerSelection,
  };
  return planConfigWrite(workspace, providerSelection, overrides.mcp ?? [], {
    language: 'en',
    projectName: 'test-project',
  });
}

// ─── previewOnboardingApply (pure) ────────────────────────────────────────

describe('previewOnboardingApply', () => {
  it('is pure — every non-undefined plan field becomes a fieldChange with previousValue undefined when no config exists', () => {
    const root = freshProjectRoot();
    const plan = buildPlan(root);
    const report = previewOnboardingApply(plan, undefined);

    expect(report.applied).toBe(false);
    expect(report.configExisted).toBe(false);
    expect(report.configPath).toBe(plan.configPath);
    const byKey = Object.fromEntries(report.fieldChanges.map((c) => [c.key, c]));
    expect(byKey['mode']).toEqual({ key: 'mode', previousValue: undefined, newValue: 'balanced', changed: true });
    expect(byKey['brain_provider']?.newValue).toBe('claude');
    expect(byKey['fallback_provider']).toBeUndefined(); // not set on this plan → never a fieldChange
  });

  it('captures the real previous value from an existing config object', () => {
    const root = freshProjectRoot();
    const plan = buildPlan(root);
    const report = previewOnboardingApply(plan, { mode: 'economic', unrelated_key: 'keep-me' });

    const modeChange = report.fieldChanges.find((c) => c.key === 'mode')!;
    expect(modeChange.previousValue).toBe('economic');
    expect(modeChange.newValue).toBe('balanced');
    expect(modeChange.changed).toBe(true);
    expect(report.configExisted).toBe(true);
  });

  it('changed=false when the plan value already matches the existing value', () => {
    const root = freshProjectRoot();
    const plan = buildPlan(root);
    const report = previewOnboardingApply(plan, { mode: 'balanced' });
    expect(report.fieldChanges.find((c) => c.key === 'mode')!.changed).toBe(false);
  });
});

// ─── dry-run / apply parity ────────────────────────────────────────────────

describe('dry-run / apply parity', () => {
  it('dryRunOnboardingApply produces the identical fieldChanges applyOnboardingPlan computes, and never writes', () => {
    const root = freshProjectRoot();
    writeExistingConfig(root, { mode: 'economic', projectName: 'old-name' });
    const plan = buildPlan(root);

    const dryRun = dryRunOnboardingApply(plan);
    const before = readConfig(root);

    const applied = applyOnboardingPlan(plan);

    expect(dryRun.fieldChanges).toEqual(applied.fieldChanges);
    expect(dryRun.configExisted).toBe(applied.configExisted);
    expect(dryRun.applied).toBe(false);
    expect(applied.applied).toBe(true);
    // dry-run must not have mutated the file before apply ran
    expect(before).toEqual({ mode: 'economic', projectName: 'old-name' });
  });

  it('a dry-run against a fresh project creates no config file at all', () => {
    const root = freshProjectRoot();
    const plan = buildPlan(root);
    dryRunOnboardingApply(plan);
    expect(existsSync(configPathFor(root))).toBe(false);
  });
});

// ─── applyOnboardingPlan (real write) ──────────────────────────────────────

describe('applyOnboardingPlan', () => {
  it('writes a fresh config.json with every plan field, verified=true', () => {
    const root = freshProjectRoot();
    const plan = buildPlan(root);
    const result = applyOnboardingPlan(plan);

    expect(result.applied).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.verificationErrors).toEqual([]);

    const onDisk = readConfig(root);
    expect(onDisk['mode']).toBe('balanced');
    expect(onDisk['language']).toBe('en');
    expect(onDisk['projectName']).toBe('test-project');
    expect(onDisk['brain_provider']).toBe('claude');
  });

  it('merges onto an existing config — preserves unrelated keys, only touches plan fields', () => {
    const root = freshProjectRoot();
    writeExistingConfig(root, { mode: 'economic', custom_user_key: 'do-not-touch', max_workers: 7 });
    const plan = buildPlan(root);
    applyOnboardingPlan(plan);

    const onDisk = readConfig(root);
    expect(onDisk['mode']).toBe('balanced'); // overwritten by plan
    expect(onDisk['custom_user_key']).toBe('do-not-touch'); // preserved
    expect(onDisk['max_workers']).toBe(7); // preserved
  });

  it('leaves no leftover .tmp file after a successful write', () => {
    const root = freshProjectRoot();
    const plan = buildPlan(root);
    applyOnboardingPlan(plan);

    const entries = readdirSync(join(root, '.deckent'));
    expect(entries.some((f) => f.endsWith('.tmp'))).toBe(false);
    expect(entries).toContain('config.json');
  });

  it('a field absent from the plan (blocked provider selection) never appears in fieldChanges or on disk', () => {
    const root = freshProjectRoot();
    const plan = buildPlan(root, {
      providerSelection: {
        brain_provider: undefined,
        worker_provider: undefined,
        blockedReasonKey: 'onboarding.provider.none_authenticated',
      },
    });
    const result = applyOnboardingPlan(plan);

    expect(result.blockedReasonKey).toBe('onboarding.provider.none_authenticated');
    expect(result.fieldChanges.some((c) => c.key === 'brain_provider')).toBe(false);
    const onDisk = readConfig(root);
    expect(onDisk['brain_provider']).toBeUndefined();
  });

  it('carries mcpAttachActions through without executing them', () => {
    const root = freshProjectRoot();
    const mcp: OnboardingMcpSuggestion[] = [{
      host: 'codex',
      status: { host: 'codex', supported: true, attached: false, toolCount: 0 },
      suggested: true,
      attachCommand: { cmd: 'codex', args: ['mcp', 'add', 'deckent'] },
      descriptionKey: 'onboarding.mcp.attach_suggested',
    }];
    const plan = buildPlan(root, { mcp });
    const result = applyOnboardingPlan(plan);

    expect(result.mcpAttachActions).toEqual([{ host: 'codex', command: ['codex', 'mcp', 'add', 'deckent'] }]);
  });
});

// ─── revertOnboardingApply ──────────────────────────────────────────────────

describe('revertOnboardingApply', () => {
  it('restores the exact prior config, deleting keys that did not exist before the apply', () => {
    const root = freshProjectRoot();
    writeExistingConfig(root, { mode: 'economic', projectName: 'old-name' });
    const plan = buildPlan(root);
    const applied = applyOnboardingPlan(plan);

    // brain_provider did not exist before apply — confirm it was written first
    expect(readConfig(root)['brain_provider']).toBe('claude');

    const reverted = revertOnboardingApply(applied);

    expect(reverted.verified).toBe(true);
    expect(reverted.verificationErrors).toEqual([]);
    const onDisk = readConfig(root);
    expect(onDisk['mode']).toBe('economic');
    expect(onDisk['projectName']).toBe('old-name');
    expect('brain_provider' in onDisk).toBe(false);
  });

  it('reverting a fresh-project apply removes every plan-written key entirely', () => {
    const root = freshProjectRoot();
    const plan = buildPlan(root);
    const applied = applyOnboardingPlan(plan);
    revertOnboardingApply(applied);

    const onDisk = readConfig(root);
    expect(onDisk['mode']).toBeUndefined();
    expect(onDisk['brain_provider']).toBeUndefined();
    expect(onDisk['projectName']).toBeUndefined();
  });
});

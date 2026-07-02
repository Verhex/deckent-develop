import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import {
  detectOnboardingProviders,
  probeOnboardingAuthStatus,
  suggestMcpAttachments,
  buildWorkspaceModeQuestions,
  resolveWorkspaceSelection,
  selectOnboardingProviders,
  planConfigWrite,
  runOnboardingWizard,
  ONBOARDING_PROVIDERS,
  ALL_PLAN_MODES,
  type OnboardingProviderName,
  type OnboardingProviderAuthStatus,
  type OnboardingMcpSuggestion,
  type OnboardingWorkspaceSelection,
} from '../../src/cli/helpers/onboarding-wizard.js';
import type { ProviderDiscoveryResult } from '../../src/core/provider-discovery.js';
import type { AuthProbeResult } from '../../src/core/provider-auth-probe.js';
import type { McpAttachStatus } from '../../src/cli/helpers/mcp-attach.js';
import { getAttachCommand } from '../../src/cli/helpers/mcp-attach.js';
import { getModePreset } from '../../src/core/mode-presets.js';
import {
  normalizeGlobalScopePlatform,
  resolveGlobalScopePaths,
} from '../../src/core/global-scope-resolver.js';

// ONB-WIZARD-CORE (Sprint 361, Task 361-009): pure core for the install→init
// onboarding wizard. Every probe is injected here — no real CLI exec / file
// reads / network / writes ever happen in this suite, mirroring
// connect-wizard.test.ts's hermeticity conventions.

// ─── Fixture Helpers ─────────────────────────────────────────────────────

function discovery(name: OnboardingProviderName, overrides: Partial<ProviderDiscoveryResult> = {}): ProviderDiscoveryResult {
  return { name, present: true, version: '1.0.0', authState: 'unknown', ...overrides };
}

function auth(overrides: Partial<AuthProbeResult> = {}): AuthProbeResult {
  return { state: 'logged-in', present: true, authenticated: true, method: 'subscription', ...overrides };
}

function providerStatus(name: OnboardingProviderName, overrides: {
  discovery?: Partial<ProviderDiscoveryResult>;
  auth?: Partial<AuthProbeResult>;
} = {}): OnboardingProviderAuthStatus {
  return {
    name,
    discovery: discovery(name, overrides.discovery),
    auth: auth(overrides.auth),
  };
}

function mcpStatus(host: OnboardingProviderName, overrides: Partial<McpAttachStatus> = {}): McpAttachStatus {
  return { host, supported: true, attached: false, toolCount: 31, ...overrides };
}

// ─── Step 1: detectOnboardingProviders ───────────────────────────────────

describe('detectOnboardingProviders', () => {
  it('reuses discoverProviders — injected version probe drives present/version', async () => {
    const result = await detectOnboardingProviders({
      version: (name) => (name === 'codex' ? undefined : '2.3.4'),
    });
    expect(result.map((r) => r.name)).toEqual(['claude', 'codex', 'gemini']);
    const codex = result.find((r) => r.name === 'codex')!;
    expect(codex.present).toBe(false);
    expect(codex.version).toBeUndefined();
    const claude = result.find((r) => r.name === 'claude')!;
    expect(claude.present).toBe(true);
    expect(claude.version).toBe('2.3.4');
  });

  it('preserves ONBOARDING_PROVIDERS / DISCOVERABLE_PROVIDERS order', async () => {
    const result = await detectOnboardingProviders({ version: () => '1.0.0' });
    expect(result.map((r) => r.name)).toEqual([...ONBOARDING_PROVIDERS]);
  });
});

// ─── Step 2: probeOnboardingAuthStatus ───────────────────────────────────

describe('probeOnboardingAuthStatus', () => {
  it('merges the real auth probe result onto each discovered provider, preserving order', async () => {
    const discovered = ONBOARDING_PROVIDERS.map((name) => discovery(name));
    const calledFor: string[] = [];
    const result = await probeOnboardingAuthStatus(discovered, async (name) => {
      calledFor.push(name);
      return name === 'codex' ? auth({ state: 'logged-out', authenticated: false, method: 'none' }) : auth();
    });
    expect(calledFor).toEqual(['claude', 'codex', 'gemini']);
    expect(result.map((r) => r.name)).toEqual(['claude', 'codex', 'gemini']);
    const codex = result.find((r) => r.name === 'codex')!;
    expect(codex.auth.state).toBe('logged-out');
    expect(codex.discovery.present).toBe(true);
  });

  it('reports unknown auth state without inventing a confident answer', async () => {
    const discovered = [discovery('claude')];
    const result = await probeOnboardingAuthStatus(discovered, async () => auth({
      state: 'unknown', present: 'unknown', authenticated: 'unknown', method: 'none',
    }));
    expect(result[0]!.auth.state).toBe('unknown');
  });
});

// ─── Step 3: suggestMcpAttachments ───────────────────────────────────────

describe('suggestMcpAttachments', () => {
  it('CLI not installed → host_not_installed, attach probe never called', () => {
    const providers = [providerStatus('codex', { discovery: { present: false, version: undefined } })];
    let called = false;
    const result = suggestMcpAttachments(providers, (host) => {
      called = true;
      return mcpStatus(host);
    });
    expect(called).toBe(false);
    expect(result).toEqual([{
      host: 'codex',
      status: { host: 'codex', supported: false, attached: false, toolCount: 0, reason: 'cli-not-installed' },
      suggested: false,
      descriptionKey: 'onboarding.mcp.host_not_installed',
      descriptionParams: { host: 'codex' },
    }]);
  });

  it('installed but host CLI does not support mcp subcommand → unsupported', () => {
    const providers = [providerStatus('gemini')];
    const result = suggestMcpAttachments(providers, (host) => mcpStatus(host, { supported: false, reason: 'no mcp subcommand' }));
    expect(result[0]).toMatchObject({ suggested: false, descriptionKey: 'onboarding.mcp.unsupported' });
    expect(result[0]!.attachCommand).toBeUndefined();
  });

  it('supported and already attached → already_attached, no suggestion', () => {
    const providers = [providerStatus('claude')];
    const result = suggestMcpAttachments(providers, (host) => mcpStatus(host, { attached: true }));
    expect(result[0]).toMatchObject({ suggested: false, descriptionKey: 'onboarding.mcp.already_attached' });
  });

  it('supported, not attached → attach_suggested with real getAttachCommand reuse', () => {
    const providers = [providerStatus('claude')];
    const result = suggestMcpAttachments(providers, (host) => mcpStatus(host, { attached: false }));
    const expectedCmd = getAttachCommand('claude')!.add;
    expect(result[0]).toEqual({
      host: 'claude',
      status: mcpStatus('claude', { attached: false }),
      suggested: true,
      attachCommand: expectedCmd,
      descriptionKey: 'onboarding.mcp.attach_suggested',
      descriptionParams: { host: 'claude' },
    });
  });

  it('is string-free — no descriptionKey/label ever contains a space (proxy for "not literal prose")', () => {
    const providers = ONBOARDING_PROVIDERS.map((name) => providerStatus(name));
    const result = suggestMcpAttachments(providers, (host) => mcpStatus(host));
    for (const s of result) {
      expect(s.descriptionKey).not.toMatch(/\s/);
    }
  });
});

// ─── Step 4: buildWorkspaceModeQuestions / resolveWorkspaceSelection ────

describe('buildWorkspaceModeQuestions', () => {
  it('scope question offers exactly project/global, defaulting to project', () => {
    const q = buildWorkspaceModeQuestions();
    expect(q.scope.choices.map((c) => c.value)).toEqual(['project', 'global']);
    expect(q.scope.defaultValue).toBe('project');
    expect(q.scope.promptKey).toBe('onboarding.question.workspace_scope');
  });

  it('mode question offers every ALL_PLAN_MODES value, defaulting to balanced', () => {
    const q = buildWorkspaceModeQuestions();
    expect(q.mode.choices.map((c) => c.value)).toEqual([...ALL_PLAN_MODES]);
    expect(q.mode.defaultValue).toBe('balanced');
  });

  it('is string-free — every choice/prompt key is a dotted identifier, never literal prose', () => {
    const q = buildWorkspaceModeQuestions();
    const keys = [q.scope.promptKey, q.mode.promptKey, ...q.scope.choices.map((c) => c.labelKey), ...q.mode.choices.map((c) => c.labelKey)];
    for (const key of keys) {
      expect(key).not.toMatch(/\s/);
      expect(key).toMatch(/^onboarding\./);
    }
  });
});

describe('resolveWorkspaceSelection', () => {
  const projectRoot = '/repo/my-project';

  it('defaults to project scope + balanced mode when no answers are given', () => {
    const selection = resolveWorkspaceSelection({ projectRoot, platform: 'linux', env: {} });
    expect(selection.scope).toBe('project');
    expect(selection.mode).toBe('balanced');
    expect(selection.root).toBe(projectRoot);
    expect(selection.modePreset).toEqual(getModePreset('balanced'));
    expect(selection.globalPaths).toBeUndefined();
  });

  it('honestly reports undefined modePreset for a subscription-tier mode with no MODE_PRESETS entry', () => {
    const selection = resolveWorkspaceSelection({ projectRoot, platform: 'linux', env: {} }, { mode: 'max_plan' });
    expect(selection.mode).toBe('max_plan');
    expect(selection.modePreset).toBeUndefined();
  });

  it('global scope resolves via the real global-scope-resolver (real reuse, not invented)', () => {
    const env = { XDG_CONFIG_HOME: '/home/u/.config', HOME: '/home/u' };
    const selection = resolveWorkspaceSelection(
      { projectRoot, platform: 'linux', env },
      { scope: 'global' },
    );
    const expectedPaths = resolveGlobalScopePaths(normalizeGlobalScopePlatform('linux', env), env);
    expect(selection.scope).toBe('global');
    expect(selection.globalPaths).toEqual(expectedPaths);
    expect(selection.root).toBe(expectedPaths.configDir);
    expect(selection.globalScopeError).toBeUndefined();
  });

  it('global scope on an unresolvable home falls back to projectRoot with an honest error, never a throw', () => {
    const selection = resolveWorkspaceSelection(
      { projectRoot, platform: 'linux', env: {} },
      { scope: 'global' },
    );
    expect(selection.scope).toBe('global');
    expect(selection.root).toBe(projectRoot);
    expect(selection.globalScopeError).toBeDefined();
    expect(selection.globalPaths).toBeUndefined();
  });

  it('an unsupported platform falls back to projectRoot with an honest error, never a throw', () => {
    const selection = resolveWorkspaceSelection(
      { projectRoot, platform: 'plan9', env: { HOME: '/home/u' } },
      { scope: 'global' },
    );
    expect(selection.root).toBe(projectRoot);
    expect(selection.globalScopeError).toContain('plan9');
  });
});

// ─── Step 5: selectOnboardingProviders / planConfigWrite ────────────────

describe('selectOnboardingProviders', () => {
  it('auto-picks the single authenticated provider for both brain and worker', () => {
    const providers = [
      providerStatus('claude', { auth: { state: 'logged-in' } }),
      providerStatus('codex', { auth: { state: 'logged-out' } }),
    ];
    expect(selectOnboardingProviders(providers)).toEqual({
      brain_provider: 'claude', worker_provider: 'claude', fallback_provider: undefined,
    });
  });

  it('auto-picks in DISCOVERABLE_PROVIDERS order, next authenticated becomes fallback', () => {
    const providers = [
      providerStatus('claude', { auth: { state: 'logged-out' } }),
      providerStatus('codex', { auth: { state: 'logged-in' } }),
      providerStatus('gemini', { auth: { state: 'logged-in' } }),
    ];
    expect(selectOnboardingProviders(providers)).toEqual({
      brain_provider: 'codex', worker_provider: 'codex', fallback_provider: 'gemini',
    });
  });

  it('zero authenticated providers → honest blockedReasonKey, no invented provider', () => {
    const providers = ONBOARDING_PROVIDERS.map((name) => providerStatus(name, { auth: { state: 'logged-out' } }));
    expect(selectOnboardingProviders(providers)).toEqual({
      blockedReasonKey: 'onboarding.provider.none_authenticated',
    });
  });

  it('a caller-supplied answer always wins over auto-pick', () => {
    const providers = [providerStatus('claude', { auth: { state: 'logged-in' } })];
    const result = selectOnboardingProviders(providers, { brain_provider: 'gemini', fallback_provider: 'codex' });
    expect(result).toEqual({ brain_provider: 'gemini', worker_provider: 'gemini', fallback_provider: 'codex' });
  });
});

describe('planConfigWrite', () => {
  const workspace: OnboardingWorkspaceSelection = {
    scope: 'project', mode: 'balanced', root: '/repo/proj', modePreset: getModePreset('balanced'),
  };

  it('never writes anything — applied is always the literal false', () => {
    const plan = planConfigWrite(workspace, { brain_provider: 'claude', worker_provider: 'claude' }, [], { language: 'en', projectName: 'proj' });
    expect(plan.applied).toBe(false);
  });

  it('computes configPath under DECKENT_DIR beneath workspace.root', () => {
    const plan = planConfigWrite(workspace, {}, [], { language: 'en', projectName: 'proj' });
    expect(plan.configPath).toBe(join('/repo/proj', '.deckent', 'config.json'));
  });

  it('carries mode/language/projectName/providers/model_strategy into fields', () => {
    const plan = planConfigWrite(
      workspace,
      { brain_provider: 'claude', worker_provider: 'claude', fallback_provider: 'gemini' },
      [],
      { language: 'tr', projectName: 'deckent' },
    );
    expect(plan.fields).toEqual({
      mode: 'balanced',
      language: 'tr',
      projectName: 'deckent',
      brain_provider: 'claude',
      worker_provider: 'claude',
      fallback_provider: 'gemini',
      model_strategy: getModePreset('balanced')!.model_strategy,
    });
  });

  it('only suggested mcp attachments become mcpAttachActions', () => {
    const mcp: OnboardingMcpSuggestion[] = [
      { host: 'claude', status: mcpStatus('claude'), suggested: true, attachCommand: getAttachCommand('claude')!.add, descriptionKey: 'onboarding.mcp.attach_suggested', descriptionParams: { host: 'claude' } },
      { host: 'codex', status: mcpStatus('codex', { attached: true }), suggested: false, descriptionKey: 'onboarding.mcp.already_attached', descriptionParams: { host: 'codex' } },
    ];
    const plan = planConfigWrite(workspace, {}, mcp, { language: 'en', projectName: 'proj' });
    const expectedCmd = getAttachCommand('claude')!.add;
    expect(plan.mcpAttachActions).toEqual([{ host: 'claude', command: [expectedCmd.cmd, ...expectedCmd.args] }]);
  });

  it('propagates blockedReasonKey from provider selection', () => {
    const plan = planConfigWrite(workspace, { blockedReasonKey: 'onboarding.provider.none_authenticated' }, [], { language: 'en', projectName: 'proj' });
    expect(plan.blockedReasonKey).toBe('onboarding.provider.none_authenticated');
    expect(plan.fields.brain_provider).toBeUndefined();
  });
});

// ─── Orchestrator: runOnboardingWizard (end-to-end, 5-step machine) ─────

describe('runOnboardingWizard', () => {
  function healthyProbes() {
    return {
      discovery: { version: () => '1.0.0' },
      auth: async () => auth(),
      mcpAttach: (host: OnboardingProviderName) => mcpStatus(host, { attached: false }),
      platform: 'linux',
      env: {},
    };
  }

  it('produces the 5-step trace in order with no real I/O (every seam injected)', async () => {
    const result = await runOnboardingWizard({
      projectRoot: '/repo/proj',
      probes: healthyProbes(),
    });
    expect(result.steps.map((s) => s.kind)).toEqual([
      'provider_detect', 'auth_status', 'mcp_suggestion', 'workspace_mode', 'config_plan',
    ]);
  });

  it('end-to-end: healthy matrix picks claude as brain/worker, codex as fallback, plans 3 mcp attaches', async () => {
    const result = await runOnboardingWizard({
      projectRoot: '/repo/proj',
      projectName: 'proj',
      probes: healthyProbes(),
    });
    expect(result.providerSelection).toEqual({ brain_provider: 'claude', worker_provider: 'claude', fallback_provider: 'codex' });
    expect(result.configPlan.applied).toBe(false);
    expect(result.configPlan.mcpAttachActions).toHaveLength(3);
    expect(result.configPlan.fields.projectName).toBe('proj');
    expect(result.workspace.scope).toBe('project');
    expect(result.workspace.mode).toBe('balanced');
  });

  it('defaults projectName to basename(projectRoot) when omitted', async () => {
    const result = await runOnboardingWizard({ projectRoot: '/repo/my-app', probes: healthyProbes() });
    expect(result.configPlan.fields.projectName).toBe('my-app');
    expect(result.configPlan.fields.language).toBe('en');
  });

  it('honors caller answers for scope/mode/provider selection end-to-end', async () => {
    const env = { XDG_CONFIG_HOME: '/home/u/.config', HOME: '/home/u' };
    const result = await runOnboardingWizard({
      projectRoot: '/repo/proj',
      answers: { scope: 'global', mode: 'performance', brain_provider: 'gemini' },
      probes: { ...healthyProbes(), env },
    });
    const expectedPaths = resolveGlobalScopePaths(normalizeGlobalScopePlatform('linux', env), env);
    expect(result.workspace.scope).toBe('global');
    expect(result.workspace.root).toBe(expectedPaths.configDir);
    expect(result.workspace.mode).toBe('performance');
    expect(result.providerSelection.brain_provider).toBe('gemini');
    expect(result.configPlan.fields.mode).toBe('performance');
  });

  it('no authenticated provider anywhere → honest blocked config-plan, mcp suggestions still computed', async () => {
    const result = await runOnboardingWizard({
      projectRoot: '/repo/proj',
      probes: {
        discovery: { version: () => '1.0.0' },
        auth: async () => auth({ state: 'logged-out', authenticated: false, method: 'none' }),
        mcpAttach: (host) => mcpStatus(host, { attached: false }),
        platform: 'linux',
        env: {},
      },
    });
    expect(result.providerSelection.blockedReasonKey).toBe('onboarding.provider.none_authenticated');
    expect(result.configPlan.blockedReasonKey).toBe('onboarding.provider.none_authenticated');
    expect(result.configPlan.fields.brain_provider).toBeUndefined();
    expect(result.configPlan.mcpAttachActions).toHaveLength(3);
  });

  it('is deterministic — identical input yields deep-equal output on repeat calls', async () => {
    const input = { projectRoot: '/repo/proj', probes: healthyProbes() };
    const first = await runOnboardingWizard(input);
    const second = await runOnboardingWizard(input);
    expect(first).toEqual(second);
  });
});

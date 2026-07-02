import { describe, it, expect } from 'vitest';
import {
  interpretChatAnswer,
  startOnboardingChat,
  replyToOnboardingChat,
  generateOnboardingFeatureSuggestions,
  ONBOARDING_CHAT_MCP_QUESTION_KEY,
  type OnboardingChatState,
  type OnboardingIntentFallback,
} from '../../src/cli/helpers/onboarding-chat-flow.js';
import {
  runOnboardingWizard,
  type OnboardingProbes,
  type OnboardingProviderName,
} from '../../src/cli/helpers/onboarding-wizard.js';

// ONB-CHAT-CORE (Sprint 361, Task 361-016): NL layer over onboarding-wizard.ts's
// 5-step machine. Every probe is injected — no real CLI exec / network / writes,
// mirroring onboarding-wizard.test.ts's hermeticity conventions. No real LLM is
// ever wired: the fallback seam is exercised with a plain fixture function.

function healthyProbes(): OnboardingProbes {
  return {
    discovery: { version: () => '1.0.0' },
    auth: async () => ({ state: 'logged-in', present: true, authenticated: true, method: 'subscription' }),
    mcpAttach: (host: OnboardingProviderName) => ({ host, supported: true, attached: false, toolCount: 31 }),
    platform: 'linux',
    env: {},
  };
}

/** Every host already attached -> suggestMcpAttachments never marks anything `suggested`. */
function noMcpSuggestionProbes(): OnboardingProbes {
  return {
    ...healthyProbes(),
    mcpAttach: (host: OnboardingProviderName) => ({ host, supported: true, attached: true, toolCount: 31 }),
  };
}

function blockedProviderProbes(): OnboardingProbes {
  return {
    ...healthyProbes(),
    auth: async () => ({ state: 'logged-out', present: true, authenticated: false, method: 'none' }),
  };
}

// ─── interpretChatAnswer ─────────────────────────────────────────────────

describe('interpretChatAnswer', () => {
  it('recognizes yes words in tr and en', () => {
    for (const word of ['evet', 'e', 'tamam', 'yes', 'y', 'ok']) {
      expect(interpretChatAnswer(word)).toEqual({ kind: 'yes' });
    }
  });

  it('recognizes no words in tr and en', () => {
    for (const word of ['hayır', 'hayir', 'no', 'n', 'iptal']) {
      expect(interpretChatAnswer(word)).toEqual({ kind: 'no' });
    }
  });

  it('recognizes skip words in tr and en, and an empty reply', () => {
    for (const word of ['atla', 'skip', 'geç', 'pas', '', '   ']) {
      expect(interpretChatAnswer(word)).toEqual({ kind: 'skip' });
    }
  });

  it('matches a choice by value, case-insensitively', () => {
    const choices = [{ value: 'project', labelKey: 'a' }, { value: 'global', labelKey: 'b' }];
    expect(interpretChatAnswer('GLOBAL', { choices })).toEqual({ kind: 'choice', value: 'global' });
  });

  it('matches a choice by 1-based index', () => {
    const choices = [{ value: 'project', labelKey: 'a' }, { value: 'global', labelKey: 'b' }];
    expect(interpretChatAnswer('2', { choices })).toEqual({ kind: 'choice', value: 'global' });
  });

  it('is deterministic — no LLM: unrecognized text with no matching choice is unknown', () => {
    const choices = [{ value: 'project', labelKey: 'a' }];
    expect(interpretChatAnswer('purple monkey dishwasher', { choices })).toEqual({
      kind: 'unknown', raw: 'purple monkey dishwasher',
    });
  });

  it('an out-of-range index is unknown, not clamped', () => {
    const choices = [{ value: 'project', labelKey: 'a' }];
    expect(interpretChatAnswer('99', { choices })).toEqual({ kind: 'unknown', raw: '99' });
  });
});

// ─── 5-step fixture dialogue, end to end ────────────────────────────────

describe('startOnboardingChat / replyToOnboardingChat — 5-step fixture dialogue', () => {
  it('walks provider_detect -> auth_status -> mcp_suggestion(yes) -> workspace_mode(scope,mode) -> config_plan', async () => {
    const input = { projectRoot: '/repo/proj', projectName: 'proj', probes: healthyProbes() };

    const s0 = await startOnboardingChat(input);
    expect(s0.status).toBe('in_progress');
    expect(s0.pending).toEqual({ stepId: 'mcp_suggestion', promptKey: ONBOARDING_CHAT_MCP_QUESTION_KEY });
    expect(s0.steps.map((s) => s.kind)).toEqual(['provider_detect', 'auth_status', 'mcp_suggestion']);

    const s1 = await replyToOnboardingChat(s0, 'evet', input);
    expect(s1.mcpAttachDeclined).toBe(false);
    expect(s1.pending?.stepId).toBe('workspace_mode');
    expect(s1.pending?.questionId).toBe('scope');
    expect(s1.pending?.choices?.map((c) => c.value)).toEqual(['project', 'global']);

    const s2 = await replyToOnboardingChat(s1, 'global', input);
    expect(s2.pending?.questionId).toBe('mode');
    expect(s2.pending?.choices?.map((c) => c.value)).toContain('performance');

    const s3 = await replyToOnboardingChat(s2, 'performance', input);
    expect(s3.status).toBe('done');
    expect(s3.pending).toBeUndefined();
    expect(s3.steps.map((s) => s.kind)).toEqual([
      'provider_detect', 'auth_status', 'mcp_suggestion', 'workspace_mode', 'config_plan',
    ]);

    const result = s3.result!;
    expect(result.workspace.scope).toBe('global');
    expect(result.workspace.mode).toBe('performance');
    expect(result.configPlan.mcpAttachActions).toHaveLength(3);
    expect(result.providerSelection).toEqual({
      brain_provider: 'claude', worker_provider: 'claude', fallback_provider: 'codex',
    });
  });

  it('wizard-reuse: the chat-driven result matches a plain runOnboardingWizard call with equivalent answers', async () => {
    const probes = healthyProbes();
    const input = { projectRoot: '/repo/proj', projectName: 'proj', probes };

    let state = await startOnboardingChat(input);
    state = await replyToOnboardingChat(state, 'evet', input);
    state = await replyToOnboardingChat(state, 'global', input);
    state = await replyToOnboardingChat(state, 'performance', input);

    const direct = await runOnboardingWizard({
      projectRoot: '/repo/proj', projectName: 'proj', probes,
      answers: { scope: 'global', mode: 'performance' },
    });

    expect(state.result).toEqual(direct);
  });

  it('hayır declines MCP attach — mcpAttachActions empty even though hosts were suggested', async () => {
    const input = { projectRoot: '/repo/proj', probes: healthyProbes() };
    let state = await startOnboardingChat(input);
    state = await replyToOnboardingChat(state, 'hayır', input);
    expect(state.mcpAttachDeclined).toBe(true);
    state = await replyToOnboardingChat(state, 'atla', input); // scope -> default
    state = await replyToOnboardingChat(state, 'atla', input); // mode -> default

    expect(state.status).toBe('done');
    expect(state.result!.mcp.some((m) => m.suggested)).toBe(true);
    expect(state.result!.configPlan.mcpAttachActions).toHaveLength(0);
  });

  it('atla (skip) on mcp_suggestion also declines attach', async () => {
    const input = { projectRoot: '/repo/proj', probes: healthyProbes() };
    let state = await startOnboardingChat(input);
    state = await replyToOnboardingChat(state, 'atla', input);
    expect(state.mcpAttachDeclined).toBe(true);
  });

  it('atla on scope/mode questions falls back to the wizard defaults (project/balanced)', async () => {
    const input = { projectRoot: '/repo/proj', probes: healthyProbes() };
    let state = await startOnboardingChat(input);
    state = await replyToOnboardingChat(state, 'evet', input);
    state = await replyToOnboardingChat(state, 'atla', input);
    state = await replyToOnboardingChat(state, 'atla', input);
    expect(state.result!.workspace.scope).toBe('project');
    expect(state.result!.workspace.mode).toBe('balanced');
  });

  it('no MCP host suggested -> mcp_suggestion auto-advances straight to workspace_mode', async () => {
    const input = { projectRoot: '/repo/proj', probes: noMcpSuggestionProbes() };
    const state = await startOnboardingChat(input);
    expect(state.pending?.stepId).toBe('workspace_mode');
    expect(state.pending?.questionId).toBe('scope');
    expect(state.steps.map((s) => s.kind)).toEqual(['provider_detect', 'auth_status', 'mcp_suggestion']);
  });

  it('no authenticated provider anywhere -> honest blocked config-plan, flow still completes', async () => {
    const input = { projectRoot: '/repo/proj', probes: blockedProviderProbes() };
    let state = await startOnboardingChat(input);
    state = await replyToOnboardingChat(state, 'evet', input);
    state = await replyToOnboardingChat(state, 'atla', input);
    state = await replyToOnboardingChat(state, 'atla', input);
    expect(state.status).toBe('done');
    expect(state.result!.providerSelection.blockedReasonKey).toBe('onboarding.provider.none_authenticated');
    expect(state.result!.configPlan.fields.brain_provider).toBeUndefined();
  });

  it('is deterministic — identical reply sequence yields deep-equal final results', async () => {
    const input = { projectRoot: '/repo/proj', probes: healthyProbes() };

    async function run(): Promise<OnboardingChatState> {
      let state = await startOnboardingChat(input);
      state = await replyToOnboardingChat(state, 'evet', input);
      state = await replyToOnboardingChat(state, 'global', input);
      state = await replyToOnboardingChat(state, 'performance', input);
      return state;
    }

    const first = await run();
    const second = await run();
    expect(first).toEqual(second);
  });
});

// ─── Unrecognized replies + injectable fallback seam ────────────────────

describe('unrecognized replies and the OnboardingIntentFallback seam', () => {
  it('an unrecognized reply keeps the same question pending and records lastUnrecognizedReply', async () => {
    const input = { projectRoot: '/repo/proj', probes: healthyProbes() };
    const before = await startOnboardingChat(input);
    const after = await replyToOnboardingChat(before, 'purple monkey dishwasher', input);
    expect(after.pending).toEqual(before.pending);
    expect(after.status).toBe('in_progress');
    expect(after.lastUnrecognizedReply).toBe('purple monkey dishwasher');
  });

  it('a subsequent recognized reply clears lastUnrecognizedReply and proceeds', async () => {
    const input = { projectRoot: '/repo/proj', probes: healthyProbes() };
    let state = await startOnboardingChat(input);
    state = await replyToOnboardingChat(state, 'gibberish', input);
    expect(state.lastUnrecognizedReply).toBe('gibberish');
    state = await replyToOnboardingChat(state, 'evet', input);
    expect(state.lastUnrecognizedReply).toBeUndefined();
    expect(state.pending?.stepId).toBe('workspace_mode');
  });

  it('the fallback seam is only invoked for unknown intents, and its resolution is applied — no real LLM wired by default', async () => {
    const input = { projectRoot: '/repo/proj', probes: healthyProbes() };
    let calls = 0;
    const fallback: OnboardingIntentFallback = (raw) => {
      calls += 1;
      return raw === 'sure thing' ? { kind: 'yes' } : undefined;
    };

    const before = await startOnboardingChat(input);
    const after = await replyToOnboardingChat(before, 'sure thing', input, fallback);
    expect(calls).toBe(1);
    expect(after.mcpAttachDeclined).toBe(false);
    expect(after.pending?.stepId).toBe('workspace_mode');
  });

  it('the fallback seam is never invoked when the deterministic core already resolved the reply', async () => {
    const input = { projectRoot: '/repo/proj', probes: healthyProbes() };
    let calls = 0;
    const fallback: OnboardingIntentFallback = () => {
      calls += 1;
      return { kind: 'yes' };
    };
    const before = await startOnboardingChat(input);
    await replyToOnboardingChat(before, 'evet', input, fallback);
    expect(calls).toBe(0);
  });

  it('replyToOnboardingChat throws when there is no pending question', async () => {
    const input = { projectRoot: '/repo/proj', probes: healthyProbes() };
    let state = await startOnboardingChat(input);
    state = await replyToOnboardingChat(state, 'evet', input);
    state = await replyToOnboardingChat(state, 'atla', input);
    state = await replyToOnboardingChat(state, 'atla', input);
    expect(state.status).toBe('done');
    await expect(replyToOnboardingChat(state, 'evet', input)).rejects.toThrow(/no pending question/);
  });
});

// ─── Pause / resume round-trip ───────────────────────────────────────────

describe('pause/resume — JSON round-trip', () => {
  it('a state serialized mid-flow resumes to the same final result as an uninterrupted run', async () => {
    const input = { projectRoot: '/repo/proj', probes: healthyProbes() };

    let live = await startOnboardingChat(input);
    live = await replyToOnboardingChat(live, 'evet', input);

    // Simulate a process restart: persist to disk (JSON) and reload.
    const serialized = JSON.stringify(live);
    const resumed: OnboardingChatState = JSON.parse(serialized);
    expect(resumed).toEqual(live);

    let resumedState = resumed;
    resumedState = await replyToOnboardingChat(resumedState, 'global', input);
    resumedState = await replyToOnboardingChat(resumedState, 'performance', input);

    let uninterrupted = await startOnboardingChat(input);
    uninterrupted = await replyToOnboardingChat(uninterrupted, 'evet', input);
    uninterrupted = await replyToOnboardingChat(uninterrupted, 'global', input);
    uninterrupted = await replyToOnboardingChat(uninterrupted, 'performance', input);

    expect(resumedState.result).toEqual(uninterrupted.result);
  });

  it('every state along the way is plain JSON data (no functions survive a stringify round-trip loss)', async () => {
    const input = { projectRoot: '/repo/proj', probes: healthyProbes() };
    const state = await startOnboardingChat(input);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});

// ─── generateOnboardingFeatureSuggestions ────────────────────────────────

describe('generateOnboardingFeatureSuggestions', () => {
  it('suggests connecting a provider when the plan is blocked', async () => {
    const input = { projectRoot: '/repo/proj', probes: blockedProviderProbes() };
    let state = await startOnboardingChat(input);
    state = await replyToOnboardingChat(state, 'evet', input);
    state = await replyToOnboardingChat(state, 'atla', input);
    state = await replyToOnboardingChat(state, 'atla', input);
    const suggestions = generateOnboardingFeatureSuggestions(state.result!);
    expect(suggestions).toContainEqual({ key: 'onboarding.suggestion.connect_provider' });
  });

  it('suggests attaching MCP later when declined, project-scope and balanced-mode nudges, and a fallback-provider nudge', async () => {
    const input = { projectRoot: '/repo/proj', probes: healthyProbes() };
    let state = await startOnboardingChat(input);
    state = await replyToOnboardingChat(state, 'hayır', input);
    state = await replyToOnboardingChat(state, 'atla', input);
    state = await replyToOnboardingChat(state, 'atla', input);
    const suggestions = generateOnboardingFeatureSuggestions(state.result!);

    expect(suggestions).toContainEqual({ key: 'onboarding.suggestion.mcp_attach_later' });
    expect(suggestions).toContainEqual({ key: 'onboarding.suggestion.try_global_scope' });
    expect(suggestions).toContainEqual({ key: 'onboarding.suggestion.explore_modes' });
    // codex is authenticated too in the healthy fixture, so a fallback IS picked -> no nudge.
    expect(suggestions).not.toContainEqual(
      expect.objectContaining({ key: 'onboarding.suggestion.add_fallback_provider' }),
    );
  });

  it('omits the project/balanced nudges once the user picks global scope + a non-default mode', async () => {
    const input = { projectRoot: '/repo/proj', probes: healthyProbes() };
    let state = await startOnboardingChat(input);
    state = await replyToOnboardingChat(state, 'evet', input);
    state = await replyToOnboardingChat(state, 'global', input);
    state = await replyToOnboardingChat(state, 'performance', input);
    const suggestions = generateOnboardingFeatureSuggestions(state.result!);

    expect(suggestions).not.toContainEqual(expect.objectContaining({ key: 'onboarding.suggestion.try_global_scope' }));
    expect(suggestions).not.toContainEqual(expect.objectContaining({ key: 'onboarding.suggestion.explore_modes' }));
  });

  it('suggests adding a fallback provider when only one provider is authenticated', async () => {
    const input = {
      projectRoot: '/repo/proj',
      probes: {
        discovery: { version: () => '1.0.0' },
        auth: async (name: OnboardingProviderName) => ({
          state: name === 'claude' ? ('logged-in' as const) : ('logged-out' as const),
          present: true,
          authenticated: name === 'claude',
          method: name === 'claude' ? ('subscription' as const) : ('none' as const),
        }),
        mcpAttach: (host: OnboardingProviderName) => ({ host, supported: true, attached: false, toolCount: 31 }),
        platform: 'linux',
        env: {},
      } satisfies OnboardingProbes,
    };
    let state = await startOnboardingChat(input);
    state = await replyToOnboardingChat(state, 'evet', input);
    state = await replyToOnboardingChat(state, 'atla', input);
    state = await replyToOnboardingChat(state, 'atla', input);
    const suggestions = generateOnboardingFeatureSuggestions(state.result!);
    expect(suggestions).toContainEqual({
      key: 'onboarding.suggestion.add_fallback_provider', params: { provider: 'claude' },
    });
  });

  it('every suggestion key is string-free (dotted identifier, never literal prose)', async () => {
    const input = { projectRoot: '/repo/proj', probes: blockedProviderProbes() };
    let state = await startOnboardingChat(input);
    state = await replyToOnboardingChat(state, 'evet', input);
    state = await replyToOnboardingChat(state, 'atla', input);
    state = await replyToOnboardingChat(state, 'atla', input);
    const suggestions = generateOnboardingFeatureSuggestions(state.result!);
    for (const s of suggestions) {
      expect(s.key).not.toMatch(/\s/);
      expect(s.key).toMatch(/^onboarding\./);
    }
  });
});

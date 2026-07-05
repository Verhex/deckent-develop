import { describe, it, expect } from 'vitest';
import {
  interpretChatAnswer,
  startOnboardingChat,
  replyToOnboardingChat,
  ONBOARDING_CHAT_MCP_QUESTION_KEY,
  type OnboardingChatMetaAction,
} from '../../src/cli/helpers/onboarding-chat-flow.js';
import type { OnboardingProbes, OnboardingProviderName } from '../../src/cli/helpers/onboarding-wizard.js';

// ONB-CHAT-DILIM-2 (Sprint 368, Task 368-004): expands 361-016's rule-based
// `interpretChatAnswer` core with 4 meta-intents recognized WHILE a wizard
// question is pending — "connect provider", "show limits/quota", "how do I
// start a sprint" (routing), and "there's a problem/doctor" (bridge to
// `deckent doctor`). Each meta-intent carries a helpful-feature suggestion
// (Deckent-suggestion principle, same `{ key, params? }` shape as
// `generateOnboardingFeatureSuggestions`) and preserves interrupt-resume:
// `pending` is left untouched so the original question is still there to
// answer on the next reply. No real LLM is wired — matching stays plain
// TR+EN substring pattern-matching, same philosophy as the yes/no/skip lists.

function healthyProbes(): OnboardingProbes {
  return {
    discovery: { version: () => '1.0.0' },
    auth: async () => ({ state: 'logged-in', present: true, authenticated: true, method: 'subscription' }),
    mcpAttach: (host: OnboardingProviderName) => ({ host, supported: true, attached: false, toolCount: 31 }),
    platform: 'linux',
    env: {},
  };
}

// ─── interpretChatAnswer — meta-intent pattern matching ─────────────────

describe('interpretChatAnswer — meta intents (ONB-CHAT-DILIM-2)', () => {
  const cases: Array<{ action: OnboardingChatMetaAction; phrases: string[] }> = [
    {
      action: 'connect_provider',
      phrases: ['provider bağla', 'sağlayıcı bağla', 'provider ekle', 'connect provider', 'add provider', 'link provider'],
    },
    {
      action: 'show_limits',
      phrases: ['limit göster', 'kota göster', 'kotam', 'show limits', 'show my limits', 'usage limits'],
    },
    {
      action: 'start_sprint',
      phrases: ['sprint nasıl başlatırım', 'sprint başlat', 'how do i start a sprint', 'start a sprint'],
    },
    {
      action: 'doctor',
      phrases: ['sorun var', 'bir sorun var', 'doctor', "there's a problem", 'something is wrong', 'run doctor'],
    },
  ];

  for (const { action, phrases } of cases) {
    it(`recognizes '${action}' across its tr+en phrasings`, () => {
      for (const phrase of phrases) {
        expect(interpretChatAnswer(phrase)).toEqual({ kind: 'meta', action });
      }
    });
  }

  it('is case-insensitive for ascii phrasings', () => {
    expect(interpretChatAnswer('DOCTOR')).toEqual({ kind: 'meta', action: 'doctor' });
    expect(interpretChatAnswer('CONNECT PROVIDER')).toEqual({ kind: 'meta', action: 'connect_provider' });
    expect(interpretChatAnswer('SHOW LIMITS')).toEqual({ kind: 'meta', action: 'show_limits' });
    expect(interpretChatAnswer('START A SPRINT')).toEqual({ kind: 'meta', action: 'start_sprint' });
  });

  it('still falls through to unknown for text matching no meta pattern', () => {
    expect(interpretChatAnswer('purple monkey dishwasher')).toEqual({
      kind: 'unknown', raw: 'purple monkey dishwasher',
    });
  });

  it('an exact pending-choice match wins over the meta matcher', () => {
    const choices = [{ value: 'project', labelKey: 'a' }, { value: 'global', labelKey: 'b' }];
    expect(interpretChatAnswer('global', { choices })).toEqual({ kind: 'choice', value: 'global' });
  });

  it('yes/no/skip word matching is unaffected by the new meta patterns', () => {
    expect(interpretChatAnswer('evet')).toEqual({ kind: 'yes' });
    expect(interpretChatAnswer('hayır')).toEqual({ kind: 'no' });
    expect(interpretChatAnswer('atla')).toEqual({ kind: 'skip' });
  });
});

// ─── replyToOnboardingChat — meta intents preserve interrupt-resume ─────

describe('replyToOnboardingChat — meta intents preserve interrupt-resume', () => {
  it('a meta reply during mcp_suggestion leaves `pending` untouched and records a suggestion', async () => {
    const input = { projectRoot: '/repo/proj', probes: healthyProbes() };
    const before = await startOnboardingChat(input);
    expect(before.pending).toEqual({ stepId: 'mcp_suggestion', promptKey: ONBOARDING_CHAT_MCP_QUESTION_KEY });

    const after = await replyToOnboardingChat(before, 'doctor', input);
    expect(after.pending).toEqual(before.pending);
    expect(after.status).toBe('in_progress');
    expect(after.lastMetaResponse).toEqual({
      action: 'doctor',
      suggestion: { key: 'onboarding.chat.suggestion.run_doctor' },
    });
    expect(after.lastUnrecognizedReply).toBeUndefined();

    // The flow resumes exactly where it paused: a normal reply still answers the ORIGINAL question.
    const resumed = await replyToOnboardingChat(after, 'evet', input);
    expect(resumed.mcpAttachDeclined).toBe(false);
    expect(resumed.pending?.stepId).toBe('workspace_mode');
  });

  it('each of the 4 meta actions maps to its own suggestion key', async () => {
    const input = { projectRoot: '/repo/proj', probes: healthyProbes() };
    const expectations: Array<[string, string]> = [
      ['provider bağla', 'onboarding.suggestion.connect_provider'],
      ['show my limits', 'onboarding.chat.suggestion.show_limits'],
      ['sprint nasıl başlatırım', 'onboarding.chat.suggestion.start_sprint'],
      ['sorun var', 'onboarding.chat.suggestion.run_doctor'],
    ];
    for (const [reply, key] of expectations) {
      const before = await startOnboardingChat(input);
      const after = await replyToOnboardingChat(before, reply, input);
      expect(after.lastMetaResponse?.suggestion).toEqual({ key });
    }
  });

  it('lastMetaResponse clears once a normal (non-meta) reply is given', async () => {
    const input = { projectRoot: '/repo/proj', probes: healthyProbes() };
    let state = await startOnboardingChat(input);
    state = await replyToOnboardingChat(state, 'limit göster', input);
    expect(state.lastMetaResponse).toBeDefined();
    state = await replyToOnboardingChat(state, 'evet', input);
    expect(state.lastMetaResponse).toBeUndefined();
  });

  it('lastMetaResponse also clears on a subsequent unrecognized reply', async () => {
    const input = { projectRoot: '/repo/proj', probes: healthyProbes() };
    let state = await startOnboardingChat(input);
    state = await replyToOnboardingChat(state, 'doctor', input);
    expect(state.lastMetaResponse).toBeDefined();
    state = await replyToOnboardingChat(state, 'purple monkey dishwasher', input);
    expect(state.lastMetaResponse).toBeUndefined();
    expect(state.lastUnrecognizedReply).toBe('purple monkey dishwasher');
  });

  it('the fallback seam is never invoked for a deterministically-matched meta intent', async () => {
    const input = { projectRoot: '/repo/proj', probes: healthyProbes() };
    let calls = 0;
    const before = await startOnboardingChat(input);
    const after = await replyToOnboardingChat(before, 'doctor', input, () => {
      calls += 1;
      return undefined;
    });
    expect(calls).toBe(0);
    expect(after.lastMetaResponse?.action).toBe('doctor');
  });

  it('a meta reply during a workspace_mode choice question also preserves the pending choice question', async () => {
    const input = { projectRoot: '/repo/proj', probes: healthyProbes() };
    let state = await startOnboardingChat(input);
    state = await replyToOnboardingChat(state, 'atla', input); // decline mcp attach -> workspace_mode/scope pending
    expect(state.pending?.stepId).toBe('workspace_mode');
    expect(state.pending?.questionId).toBe('scope');

    const interrupted = await replyToOnboardingChat(state, 'sprint nasıl başlatırım', input);
    expect(interrupted.pending).toEqual(state.pending);
    expect(interrupted.lastMetaResponse).toEqual({
      action: 'start_sprint',
      suggestion: { key: 'onboarding.chat.suggestion.start_sprint' },
    });

    const resumed = await replyToOnboardingChat(interrupted, 'global', input);
    expect(resumed.pending?.questionId).toBe('mode');
  });

  it('every state remains plain JSON data after a meta-intent reply (pause/resume safe)', async () => {
    const input = { projectRoot: '/repo/proj', probes: healthyProbes() };
    const before = await startOnboardingChat(input);
    const after = await replyToOnboardingChat(before, 'connect provider', input);
    expect(JSON.parse(JSON.stringify(after))).toEqual(after);
  });
});

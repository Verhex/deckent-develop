import { describe, it, expect } from 'vitest';
import {
  startOnboardingChat,
  replyToOnboardingChat,
  type OnboardingChatDispatchDescriptor,
} from '../../src/cli/helpers/onboarding-chat-flow.js';
import { getCommand } from '../../src/cli/command-registry.js';
import type { OnboardingProbes, OnboardingProviderName } from '../../src/cli/helpers/onboarding-wizard.js';

// ONB-CHAT-DILIM-3 (Sprint 370, Task 370-005): the 4 ONB-CHAT-DILIM-2 (368-004)
// meta-intents now ALSO resolve to a not-yet-run `OnboardingChatDispatchDescriptor`
// (`{ command, args, requiresConfirm }`) on a new `lastMetaDispatch` state field —
// sibling to (not nested inside) `lastMetaResponse`, so 368-004's own exact-shape
// `toEqual` assertions on `lastMetaResponse` in tests/cli/chat-setup-intents.test.ts
// stay untouched. This module NEVER runs the resolved command — only describes it;
// the executor is an explicit later slice. Command names are asserted to exist in
// `command-registry.ts` (the cross-surface command SSOT) via a read-only import.

function healthyProbes(): OnboardingProbes {
  return {
    discovery: { version: () => '1.0.0' },
    auth: async () => ({ state: 'logged-in', present: true, authenticated: true, method: 'subscription' }),
    mcpAttach: (host: OnboardingProviderName) => ({ host, supported: true, attached: false, toolCount: 31 }),
    platform: 'linux',
    env: {},
  };
}

describe('meta-intent dispatch descriptors (ONB-CHAT-DILIM-3)', () => {
  const input = { projectRoot: '/repo/proj', probes: healthyProbes() };

  const expectations: Array<{ reply: string; descriptor: OnboardingChatDispatchDescriptor }> = [
    { reply: 'doctor', descriptor: { command: 'doctor', args: [], requiresConfirm: true } }, // doctor --fix/--fix-image tasidigi icin effect:'mixed' → Degistir (1bd45d065)
    { reply: 'connect provider', descriptor: { command: 'connect', args: [], requiresConfirm: false } },
    { reply: 'show my limits', descriptor: { command: 'limits', args: [], requiresConfirm: false } },
    { reply: 'sprint nasıl başlatırım', descriptor: { command: 'start', args: [], requiresConfirm: true } },
  ];

  for (const { reply, descriptor } of expectations) {
    it(`resolves '${reply}' to dispatch descriptor ${JSON.stringify(descriptor)}`, async () => {
      const before = await startOnboardingChat(input);
      const after = await replyToOnboardingChat(before, reply, input);
      expect(after.lastMetaDispatch).toEqual(descriptor);
    });
  }

  it('every resolved command name exists in the command-registry SSOT', async () => {
    for (const { reply } of expectations) {
      const before = await startOnboardingChat(input);
      const after = await replyToOnboardingChat(before, reply, input);
      const command = after.lastMetaDispatch!.command;
      expect(getCommand(command)).toBeDefined();
      expect(getCommand(command)?.name).toBe(command);
    }
  });

  it('requiresConfirm is derived from the registry risk tier, not hardcoded true for every bridge', async () => {
    const before = await startOnboardingChat(input);
    const after = await replyToOnboardingChat(before, 'show my limits', input);
    const entry = getCommand(after.lastMetaDispatch!.command);
    expect(entry?.risk).toBe('Oku'); // read-only probe: limits (doctor artik mixed/Degistir)
    expect(after.lastMetaDispatch!.requiresConfirm).toBe(false);
  });

  it('does not touch lastMetaResponse\'s shape (368-004 exact-match tests stay intact)', async () => {
    const before = await startOnboardingChat(input);
    const after = await replyToOnboardingChat(before, 'doctor', input);
    expect(after.lastMetaResponse).toEqual({
      action: 'doctor',
      suggestion: { key: 'onboarding.chat.suggestion.run_doctor' },
    });
  });

  it('lastMetaDispatch is set alongside lastMetaResponse and preserves interrupt-resume (`pending` untouched)', async () => {
    const before = await startOnboardingChat(input);
    const after = await replyToOnboardingChat(before, 'doctor', input);
    expect(after.pending).toEqual(before.pending);
    expect(after.lastMetaResponse).toBeDefined();
    expect(after.lastMetaDispatch).toBeDefined();
  });

  it('lastMetaDispatch clears alongside lastMetaResponse on a subsequent normal reply', async () => {
    let state = await startOnboardingChat(input);
    state = await replyToOnboardingChat(state, 'limit göster', input);
    expect(state.lastMetaDispatch).toBeDefined();
    state = await replyToOnboardingChat(state, 'evet', input);
    expect(state.lastMetaResponse).toBeUndefined();
    expect(state.lastMetaDispatch).toBeUndefined();
  });

  it('lastMetaDispatch clears alongside lastMetaResponse on a subsequent unrecognized reply', async () => {
    let state = await startOnboardingChat(input);
    state = await replyToOnboardingChat(state, 'doctor', input);
    expect(state.lastMetaDispatch).toBeDefined();
    state = await replyToOnboardingChat(state, 'purple monkey dishwasher', input);
    expect(state.lastMetaResponse).toBeUndefined();
    expect(state.lastMetaDispatch).toBeUndefined();
  });

  it('never invokes the resolved command — descriptor data only, no side effects', async () => {
    const before = await startOnboardingChat(input);
    const after = await replyToOnboardingChat(before, 'sprint nasıl başlatırım', input);
    expect(after.lastMetaDispatch).toEqual({ command: 'start', args: [], requiresConfirm: true });
    // A dispatch descriptor is plain data (string/array/boolean) — nothing here
    // is a function, promise, or child-process handle; the executor seam is a
    // separate, later slice.
    expect(typeof after.lastMetaDispatch).toBe('object');
  });

  it('state remains plain JSON data after a meta-intent reply, including the new field (pause/resume safe)', async () => {
    const before = await startOnboardingChat(input);
    const after = await replyToOnboardingChat(before, 'connect provider', input);
    expect(JSON.parse(JSON.stringify(after))).toEqual(after);
  });
});

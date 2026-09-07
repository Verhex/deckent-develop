import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { createNativePermissionInvocation } from '../../../src/agent/native-permission-binding.js';
import { NativePermissionIntentCard } from '../../../src/cli/repl/approval-card.js';
import { createNativePermissionIntentController } from '../../../src/cli/repl/native-permission-approval.js';
import { buildNativePermissionIntentLabels } from '../../../src/cli/repl/run.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';
import { resolveApprovalCardOwners } from '../../../src/cli/repl/app.js';

describe('NativePermissionIntentCard', () => {
  it('gives simultaneous durable and native cards exactly one keyboard owner', () => {
    expect(resolveApprovalCardOwners(true, true)).toEqual({ durable: false, native: true });
    expect(resolveApprovalCardOwners(true, false)).toEqual({ durable: true, native: false });
    expect(resolveApprovalCardOwners(false, true)).toEqual({ durable: false, native: false });
  });
  it.each(['en', 'tr'] as const)('selects session with one keyboard owner in %s', async (lang) => {
    const controller = createNativePermissionIntentController();
    const labels = buildNativePermissionIntentLabels((key) => getMessage(key, lang));
    const intent = {
      invocation: createNativePermissionInvocation({ sessionId: 's', sessionInstanceId: 'i', turnGeneration: 1, invocationId: 'v', callId: 'c', tool: 'deckent_bash', rawArgs: { cmd: 'npm test' }, tier: 'confirm', elevated: false, nested: false }),
      tool: 'deckent_bash', resource: 'npm test', actorId: 'operator', lifetimes: ['once', 'session', 'always'] as const,
    };
    const pending = controller.request(intent);
    const { stdin, lastFrame, unmount } = render(<NativePermissionIntentCard intent={controller.current()} controller={controller} labels={labels} isActive />);
    try {
      expect(lastFrame()).toContain(labels.once);
      expect(lastFrame()).toContain(labels.sessionConsequence);
      stdin.write('2');
      await expect(pending).resolves.toEqual({ kind: 'selected', lifetime: 'session' });
    } finally { unmount(); }
  });

  it('accepts the first key after a mounted inactive card becomes active', async () => {
    const controller = createNativePermissionIntentController();
    const labels = buildNativePermissionIntentLabels((key) => getMessage(key, 'en'));
    const intent = {
      invocation: createNativePermissionInvocation({ sessionId: 's', sessionInstanceId: 'i', turnGeneration: 1, invocationId: 'v-transition', callId: 'c-transition', tool: 'deckent_bash', rawArgs: { cmd: 'npm test' }, tier: 'confirm', elevated: false, nested: false }),
      tool: 'deckent_bash', resource: 'npm test', actorId: 'operator', lifetimes: ['once', 'session', 'always'] as const,
    };
    const view = render(<NativePermissionIntentCard intent={null} controller={controller} labels={labels} isActive={false} />);
    try {
      const pending = controller.request(intent);
      view.rerender(<NativePermissionIntentCard intent={controller.current()} controller={controller} labels={labels} isActive />);
      expect(view.lastFrame()).toContain(labels.session);
      view.stdin.write('2');
      await expect(pending).resolves.toEqual({ kind: 'selected', lifetime: 'session' });
    } finally { view.unmount(); }
  });

  it('Escape retires only the transient intent', async () => {
    const controller = createNativePermissionIntentController();
    const labels = buildNativePermissionIntentLabels((key) => getMessage(key, 'en'));
    const intent = { invocation: createNativePermissionInvocation({ sessionId: 's', sessionInstanceId: 'i', turnGeneration: 1, invocationId: 'v', callId: 'c', tool: 'deckent_bash', rawArgs: {}, tier: 'always', elevated: true, nested: false }), tool: 'deckent_bash', resource: '', actorId: 'operator', lifetimes: ['once'] as const };
    const pending = controller.request(intent);
    const { stdin, unmount } = render(<NativePermissionIntentCard intent={controller.current()} controller={controller} labels={labels} isActive />);
    stdin.write(String.fromCharCode(27));
    await expect(pending).resolves.toMatchObject({ kind: 'cancelled' });
    expect(controller.current()).toBeNull();
    unmount();
  });
});

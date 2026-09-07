import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApprovalCard, NativePermissionIntentCard } from '../../../src/cli/repl/approval-card.js';
import { InputBar } from '../../../src/cli/repl/input-bar.js';
import { createNativePermissionIntentController } from '../../../src/cli/repl/native-permission-approval.js';
import { createNativePermissionInvocation } from '../../../src/agent/native-permission-binding.js';
import { buildApprovalLabels, buildNativePermissionIntentLabels } from '../../../src/cli/repl/run.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';
import { ReplApp, type ConfirmTrigger, type ReplEngine } from '../../../src/cli/repl/app.js';
import { buildSlashRegistry } from '../../../src/cli/commands/chat-slash-registry.js';
import { buildPickerLabels } from '../../../src/cli/repl/picker-labels.js';
import { buildReplLabels, buildShortcutsPanel } from '../../../src/cli/repl/run.js';
import { validateApprovalRequest, type ApprovalRequest } from '../../../src/core/approval-contract.js';
import type { ApprovalStreamEvent } from '../../../src/core/approval-eventstream.js';

const inputProps = (historyProjectRoot: string) => ({
  menuMoreAbove: '{n}', menuMoreBelow: '{n}', reverseSearchLabel: 'search',
  historyProjectRoot, onInterrupt: () => undefined,
});

function nativeIntent() {
  return {
    invocation: createNativePermissionInvocation({ sessionId: 's', sessionInstanceId: 'i', turnGeneration: 1, invocationId: 'v', callId: 'c', tool: 'deckent_bash', rawArgs: { cmd: 'npm test' }, tier: 'confirm', elevated: false, nested: false }),
    tool: 'deckent_bash', resource: 'npm test', actorId: 'operator', lifetimes: ['once', 'session', 'always'] as const,
  };
}

function request(): ApprovalRequest {
  const parsed = validateApprovalRequest({ id: 'apr-transition', requester: { role: 'worker', instanceId: 'w' }, summary: 'bounded action', details: {}, scopeId: 'scope', scope: 'shell-exec', risk: 'high', policy: 'require-approval', defaultAction: 'deny', tenantId: 'local', userId: 'operator', createdAt: '2026-01-01T00:00:00.000Z', expiresAt: '2027-01-01T00:00:00.000Z', maskedArgs: {} });
  if (!parsed.ok) throw new Error(parsed.errors.join(';'));
  return parsed.value;
}

function pending(req: ApprovalRequest): AsyncGenerator<ApprovalStreamEvent> {
  return (async function* () { yield { kind: 'pending', request: req }; await new Promise<void>(() => undefined); })();
}

describe('approval keyboard ownership transitions', () => {
  it('moves the first key from InputBar to native intent without double consumption, then back', async () => {
    const controller = createNativePermissionIntentController();
    const intent = nativeIntent();
    const submit = vi.fn();
    const labels = buildNativePermissionIntentLabels((key) => getMessage(key, 'en'));
    const historyRoot = mkdtempSync(join(tmpdir(), 'deckent-approval-keyboard-transition-'));
    const view = render(<>
      <NativePermissionIntentCard intent={null} controller={controller} labels={labels} isActive={false} />
      <InputBar {...inputProps(historyRoot)} active onSubmit={submit} />
    </>);
    try {
      const selection = controller.request(intent);
      view.rerender(<>
        <NativePermissionIntentCard intent={intent} controller={controller} labels={labels} isActive />
        <InputBar {...inputProps(historyRoot)} active={false} onSubmit={submit} />
      </>);
      expect(view.lastFrame()).toContain(labels.session);
      view.stdin.write('2');
      await expect(selection).resolves.toEqual({ kind: 'selected', lifetime: 'session' });
      expect(submit).not.toHaveBeenCalled();

      view.rerender(<>
        <NativePermissionIntentCard intent={null} controller={controller} labels={labels} isActive={false} />
        <InputBar {...inputProps(historyRoot)} active onSubmit={submit} />
      </>);
      view.stdin.write('x');
      view.stdin.write('\r');
      await vi.waitFor(() => expect(submit).toHaveBeenCalledWith('x'));
    } finally { view.unmount(); rmSync(historyRoot, { recursive: true, force: true }); }
  });

  it('durable card ignores the transition key until it owns the mutex', async () => {
    const req = request();
    const decide = vi.fn(async () => ({ kind: 'accepted' as const, decision: { requestId: req.id, decision: 'allow' as const, decidedBy: 'operator', channel: 'local-terminal', decidedAt: '2026-01-01T00:01:00.000Z', reason: '' } }));
    const view = render(<ApprovalCard events={pending(req)} onDecide={decide} labels={buildApprovalLabels((key) => getMessage(key, 'en'))} isActive={false} suspendTerminal={async (callback) => { await callback(); }} />);
    try {
      await vi.waitFor(() => expect(view.lastFrame()).toContain(req.summary));
      view.stdin.write('y');
      expect(decide).not.toHaveBeenCalled();
      view.rerender(<ApprovalCard events={pending(req)} onDecide={decide} labels={buildApprovalLabels((key) => getMessage(key, 'en'))} isActive suspendTerminal={async (callback) => { await callback(); }} />);
      view.stdin.write('y');
      await vi.waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
    } finally { view.unmount(); }
  });

  it('mounted ReplApp gives the first committed confirm key to the modal, then returns ownership', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-confirm-keyboard-transition-'));
    let trigger: ConfirmTrigger | undefined;
    const submitted: string[] = [];
    const engine = Object.assign(async (input: string) => { submitted.push(input); }, { close: vi.fn() }) as unknown as ReplEngine;
    const t = (key: string) => getMessage(key, 'en');
    const view = render(<ReplApp
      provider={{} as never} dispatcher={{ dispatch: vi.fn(async () => '') }} labels={buildReplLabels(t)}
      providerName="diagnostic" cwd={root} registerConfirm={(value) => { trigger = value; }} registerToolSink={() => {}}
      slashRegistry={buildSlashRegistry('en')} initialSelection={{ provider: 'diagnostic', model: 'model-a' }}
      onSwitch={() => ({ provider: 'diagnostic', model: 'model-a' })} onApprovalMode={() => {}}
      inboxLabels={{} as never} pickerLabels={buildPickerLabels(t)} pickerSpecs={{} as never}
      liveFooterLabels={{} as never} approvalLabels={{} as never} runFlowCardLabels={{} as never}
      runFlowMountLabels={{} as never} doSlashLabels={{} as never} caretStyle="marker" dualStreamOverflow="..."
      shortcutsPanel={buildShortcutsPanel(t)} nativeEngine={engine} resumeLedgerOptions={{ rootDir: root }}
    />);
    const originalWrite = view.stdout.write;
    let keySentOnFirstConfirmFrame = false;
    view.stdout.write = (frame: string): void => {
      originalWrite(frame);
      if (!keySentOnFirstConfirmFrame && frame.includes('transition confirmation')) {
        keySentOnFirstConfirmFrame = true;
        view.stdin.write('a');
      }
    };
    try {
      await vi.waitFor(() => expect(trigger).toBeTypeOf('function'));
      const answer = trigger!('transition confirmation');
      await expect(answer).resolves.toBe('a');
      expect(keySentOnFirstConfirmFrame).toBe(true);
      expect(submitted).toEqual([]);
      view.stdin.write('fresh'); view.stdin.write('\r');
      await vi.waitFor(() => expect(submitted).toEqual(['fresh']));
    } finally {
      view.stdout.write = originalWrite;
      view.unmount();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

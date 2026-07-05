import { describe, it, expect, vi } from 'vitest';
import {
  executeIntentDescriptor,
  type IntentExecutorConfirm,
  type IntentExecutorRunner,
} from '../../src/cli/helpers/chat-intent-executor.js';
import type { OnboardingChatDispatchDescriptor } from '../../src/cli/helpers/onboarding-chat-flow.js';
import { getCommand } from '../../src/cli/command-registry.js';

// ONB-CHAT-DILIM-4 (Sprint 371, Task 371-004): executeIntentDescriptor() runs
// the not-yet-run descriptors that onboarding-chat-flow.ts (370-005) resolves.
// This engine never touches a TTY or spawns a real process — both `runner`
// and `confirm` are injected mocks throughout, matching the module's own
// contract (pure motor; terminal wiring is a later slice).

function descriptor(overrides: Partial<OnboardingChatDispatchDescriptor> = {}): OnboardingChatDispatchDescriptor {
  return { command: 'doctor', args: [], requiresConfirm: false, ...overrides };
}

describe('executeIntentDescriptor (ONB-CHAT-DILIM-4)', () => {
  it('confirm-approve: requiresConfirm=true + confirm resolves true -> runner runs -> status "ran"', async () => {
    const runner: IntentExecutorRunner = vi.fn(async () => 'runner-result');
    const confirm: IntentExecutorConfirm = vi.fn(async () => true);
    const desc = descriptor({ command: 'start', requiresConfirm: true });

    const result = await executeIntentDescriptor(desc, { runner, confirm });

    expect(confirm).toHaveBeenCalledWith(desc);
    expect(runner).toHaveBeenCalledWith('start', []);
    expect(result).toEqual({ status: 'ran', command: 'start', args: [], value: 'runner-result' });
  });

  it('confirm-reject: requiresConfirm=true + confirm resolves false -> runner never called -> status "cancelled"', async () => {
    const runner: IntentExecutorRunner = vi.fn(async () => 'should-not-run');
    const confirm: IntentExecutorConfirm = vi.fn(async () => false);
    const desc = descriptor({ command: 'start', requiresConfirm: true });

    const result = await executeIntentDescriptor(desc, { runner, confirm });

    expect(confirm).toHaveBeenCalledWith(desc);
    expect(runner).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'cancelled', command: 'start', args: [] });
  });

  it('success: requiresConfirm=false -> confirm never invoked, runner runs directly -> status "ran"', async () => {
    const runner: IntentExecutorRunner = vi.fn(async () => undefined);
    const confirm: IntentExecutorConfirm = vi.fn(async () => true);
    const desc = descriptor({ command: 'doctor', requiresConfirm: false });

    const result = await executeIntentDescriptor(desc, { runner, confirm });

    expect(confirm).not.toHaveBeenCalled();
    expect(runner).toHaveBeenCalledWith('doctor', []);
    expect(result).toEqual({ status: 'ran', command: 'doctor', args: [], value: undefined });
  });

  it('runner-error: runner throws -> status "refused" with error captured', async () => {
    const failure = new Error('command failed');
    const runner: IntentExecutorRunner = vi.fn(async () => {
      throw failure;
    });
    const desc = descriptor({ command: 'doctor', requiresConfirm: false });

    const result = await executeIntentDescriptor(desc, { runner });

    expect(result).toEqual({ status: 'refused', command: 'doctor', args: [], error: failure });
  });

  it('honest-cancel: requiresConfirm=true with confirm omitted -> "cancelled", runner never called', async () => {
    const runner: IntentExecutorRunner = vi.fn(async () => 'should-not-run');
    const desc = descriptor({ command: 'start', requiresConfirm: true });

    const result = await executeIntentDescriptor(desc, { runner });

    expect(runner).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'cancelled', command: 'start', args: [] });
  });

  it('supports a synchronous (non-Promise) runner and confirm', async () => {
    const runner: IntentExecutorRunner = vi.fn(() => 'sync-value');
    const confirm: IntentExecutorConfirm = vi.fn(() => true);
    const desc = descriptor({ command: 'start', requiresConfirm: true });

    const result = await executeIntentDescriptor(desc, { runner, confirm });

    expect(result).toEqual({ status: 'ran', command: 'start', args: [], value: 'sync-value' });
  });

  it('passes args through unchanged to runner', async () => {
    const runner: IntentExecutorRunner = vi.fn(async () => 'ok');
    const desc = descriptor({ command: 'limits', args: ['--verbose'], requiresConfirm: false });

    await executeIntentDescriptor(desc, { runner });

    expect(runner).toHaveBeenCalledWith('limits', ['--verbose']);
  });

  it('runner receives a command name that exists in the command-registry SSOT (read-only assert)', async () => {
    let receivedCommand: string | undefined;
    const runner: IntentExecutorRunner = vi.fn(async (command: string) => {
      receivedCommand = command;
      return 'ok';
    });
    const desc = descriptor({ command: 'doctor', requiresConfirm: false });

    await executeIntentDescriptor(desc, { runner });

    expect(receivedCommand).toBeDefined();
    expect(getCommand(receivedCommand!)).toBeDefined();
    expect(getCommand(receivedCommand!)?.name).toBe(receivedCommand);
  });

  it('result stays plain JSON-serializable data (no function/promise leaks)', async () => {
    const runner: IntentExecutorRunner = vi.fn(async () => ({ ok: true }));
    const desc = descriptor({ command: 'doctor', requiresConfirm: false });

    const result = await executeIntentDescriptor(desc, { runner });

    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('never invokes the real command-registry or a TTY — runner/confirm are the only side-effect seams', async () => {
    const calls: string[] = [];
    const runner: IntentExecutorRunner = vi.fn(async () => {
      calls.push('runner');
      return 'ok';
    });
    const confirm: IntentExecutorConfirm = vi.fn(async () => {
      calls.push('confirm');
      return true;
    });
    const desc = descriptor({ command: 'start', requiresConfirm: true });

    await executeIntentDescriptor(desc, { runner, confirm });

    expect(calls).toEqual(['confirm', 'runner']);
  });
});

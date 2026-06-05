// APPROVE-004 (MASTER-PLAN §4G) — Executor writes parked approvals to a store.
//
// Root cause: the Executor parks approve / suggest-timeout decisions in an
// in-memory pendingApprovals Map but never persists them, so `deckent nervous`
// and the REPL `/nervous` (which read .deckent/nervous-pending.json) always show
// an empty queue. An injected PendingApprovalStore lets bootstrap persist the
// parked notification on park and drop it on resolve — string-free + testable.

import { describe, it, expect, vi } from 'vitest';
import { Executor } from '../../src/nervous/executor.js';
import type {
  NervousNotification,
  ApprovalPolicy,
} from '../../src/core/nervous-types.js';

const history = { append: async (): Promise<void> => {} };
const handler = async (): Promise<{ outcome: 'success' }> => ({ outcome: 'success' });

function notif(id: string, policy: ApprovalPolicy): NervousNotification {
  return {
    id,
    type: 'test',
    title: 'T',
    message: 'M',
    severity: 'warning',
    createdAt: '2026-06-05T00:00:00.000Z',
    detectorId: 'd1',
    actions: [
      { id: 'a1', label: 'Do', policy, risk: 'medium', isSafetyFloor: false, payload: {} },
    ],
    timeoutMs: policy === 'approve' ? null : 300000,
  };
}

describe('Executor pending store (APPROVE-004)', () => {
  it('adds a parked approve-policy notification, removes it on resolve', async () => {
    const store = { add: vi.fn(), remove: vi.fn() };
    const exec = new Executor(history, handler, store);

    const p = exec.handle(notif('n1', 'approve'));
    await Promise.resolve();
    expect(store.add).toHaveBeenCalledWith(expect.objectContaining({ id: 'n1' }));
    expect(store.remove).not.toHaveBeenCalled();

    exec.resolveApproval('n1', 'accepted');
    await p;
    expect(store.remove).toHaveBeenCalledWith('n1');
  });

  it('adds a parked suggest-timeout notification to the store', async () => {
    const store = { add: vi.fn(), remove: vi.fn() };
    const exec = new Executor(history, handler, store);

    const p = exec.handle(notif('n2', 'suggest-30m'));
    await Promise.resolve();
    expect(store.add).toHaveBeenCalledWith(expect.objectContaining({ id: 'n2' }));

    exec.resolveApproval('n2', 'rejected'); // resolve to clear the timer
    await p;
    expect(store.remove).toHaveBeenCalledWith('n2');
  });

  it('is optional — no store wired still resolves cleanly', async () => {
    const exec = new Executor(history, handler);
    const p = exec.handle(notif('n3', 'approve'));
    await Promise.resolve();
    exec.resolveApproval('n3', 'accepted');
    await expect(p).resolves.toBeDefined();
  });
});

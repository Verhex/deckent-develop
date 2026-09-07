import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';

import { ApprovalCard } from '../../../src/cli/repl/approval-card.js';
import { buildApprovalLabels } from '../../../src/cli/repl/run.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';
import { validateApprovalRequest, type ApprovalDecision, type ApprovalRequest } from '../../../src/core/approval-contract.js';
import type { ApprovalTerminalEvent } from '../../../src/cli/repl/approval-terminal-channel.js';
import type { ApprovalTerminalDecisionResult } from '../../../src/cli/repl/approval-terminal-command.js';

const LABELS = buildApprovalLabels((key) => getMessage(key, 'en'));
const tick = (ms = 30): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const suspend = async (callback: () => void | Promise<void>): Promise<void> => { await callback(); };

function request(id: string, scopeId = 'scope-async'): ApprovalRequest {
  const parsed = validateApprovalRequest({
    id,
    requester: { role: 'worker', instanceId: 'worker-async' },
    summary: `approval ${id}`,
    details: {},
    scopeId,
    scope: 'shell-exec',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'tenant-a',
    userId: 'operator-a',
    createdAt: '2026-09-07T12:00:00.000Z',
    expiresAt: '2099-09-07T13:00:00.000Z',
  });
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  return parsed.value;
}

function accepted(req: ApprovalRequest, action: 'allow' | 'deny'): ApprovalTerminalDecisionResult {
  const decision: ApprovalDecision = {
    requestId: req.id,
    decision: action,
    decidedBy: req.userId,
    channel: 'local-terminal',
    decidedAt: '2026-09-07T12:01:00.000Z',
    reason: '',
  };
  return { kind: 'accepted', decision };
}

async function* events(...requests: ApprovalRequest[]): AsyncGenerator<ApprovalTerminalEvent> {
  for (const req of requests) yield { kind: 'pending', request: req };
  await new Promise<void>(() => {});
}

describe('ApprovalCard authenticated async decision lifecycle', () => {
  it('locks repeated keys and emits no closure before durable acceptance', async () => {
    const req = request('async-1');
    let finish!: (result: ApprovalTerminalDecisionResult) => void;
    const pending = new Promise<ApprovalTerminalDecisionResult>((resolve) => { finish = resolve; });
    const onDecide = vi.fn(() => pending);
    const onClosure = vi.fn();
    const { stdin, lastFrame } = render(
      <ApprovalCard events={events(req)} onDecide={onDecide} onClosure={onClosure} labels={LABELS} suspendTerminal={suspend} />,
    );
    await tick();
    stdin.write('y'); stdin.write('y'); stdin.write('n');
    await tick();
    expect(onDecide).toHaveBeenCalledTimes(1);
    expect(onClosure).not.toHaveBeenCalled();
    expect(lastFrame()).toContain('AUTHENTICATING');

    finish(accepted(req, 'allow'));
    await tick(80);
    expect(onClosure).toHaveBeenCalledExactlyOnceWith(req, 'allow');
    expect(lastFrame() ?? '').not.toContain(req.summary);
  });

  it('keeps rejected promises and synchronous throws visible as truthful HOLD', async () => {
    const failures = [
      ['async-rejection', vi.fn(async () => { throw new Error('async failure'); })],
      ['sync-throw', vi.fn(() => { throw new TypeError('sync failure'); })],
    ] as const;
    for (const [id, onDecide] of failures) {
      const req = request(id);
      const onClosure = vi.fn();
      const { stdin, lastFrame, unmount } = render(
        <ApprovalCard events={events(req)} onDecide={onDecide} onClosure={onClosure} labels={LABELS} suspendTerminal={suspend} />,
      );
      await tick(); stdin.write('n'); await tick(80);
      expect(lastFrame()).toContain('HOLD');
      expect(lastFrame()).toContain(req.summary);
      expect(onClosure).not.toHaveBeenCalled();
      unmount();
    }
  });

  it('refuses an accepted callback whose durable id/action does not match the intent', async () => {
    const req = request('async-mismatch');
    const mismatch = accepted({ ...req, id: 'other-id' }, 'deny');
    const onClosure = vi.fn();
    const { stdin, lastFrame } = render(
      <ApprovalCard events={events(req)} onDecide={() => mismatch} onClosure={onClosure} labels={LABELS} suspendTerminal={suspend} />,
    );
    await tick(); stdin.write('y'); await tick(80);
    expect(lastFrame()).toContain('UNTRUSTED');
    expect(lastFrame()).toContain('accepted-decision-identity-mismatch');
    expect(onClosure).not.toHaveBeenCalled();
  });

  it('retires only the exact expired request as a non-actionable terminal outcome', async () => {
    const expired = request('async-expired');
    const stillPending = request('async-still-pending');
    const onClosure = vi.fn();
    const onTerminalOutcome = vi.fn();
    const { stdin, lastFrame } = render(
      <ApprovalCard
        events={events(expired, stillPending)}
        onDecide={() => ({ kind: 'expired', reasonCode: 'request-expired' })}
        onClosure={onClosure}
        onTerminalOutcome={onTerminalOutcome}
        labels={LABELS}
        suspendTerminal={suspend}
      />,
    );
    await tick(); stdin.write('n'); await tick(80);
    expect(lastFrame()).not.toContain(expired.summary);
    expect(lastFrame()).toContain(stillPending.summary);
    expect(onTerminalOutcome).toHaveBeenCalledExactlyOnceWith(
      expired,
      LABELS.status.terminalExpired.replace('{summary}', expired.summary),
    );
    expect(onClosure).not.toHaveBeenCalled();
  });

  it('keeps cancellation visible and retryable without a success closure', async () => {
    const req = request('async-cancelled');
    const onClosure = vi.fn();
    const onTerminalOutcome = vi.fn();
    const { stdin, lastFrame } = render(
      <ApprovalCard
        events={events(req)}
        onDecide={() => ({ kind: 'cancelled', reasonCode: 'terminal-auth-cancelled' })}
        onClosure={onClosure}
        onTerminalOutcome={onTerminalOutcome}
        labels={LABELS}
        suspendTerminal={suspend}
      />,
    );
    await tick(); stdin.write('n'); await tick(80);
    expect(lastFrame()).toContain('CANCELLED');
    expect(lastFrame()).toContain(req.summary);
    expect(onTerminalOutcome).not.toHaveBeenCalled();
    expect(onClosure).not.toHaveBeenCalled();
  });

  it('runs approve-similar as separate sequential ceremonies and stops truthfully on partial HOLD', async () => {
    const first = request('bulk-1');
    const second = request('bulk-2');
    const onDecide = vi.fn(async (req: ApprovalRequest) => req.id === first.id
      ? accepted(req, 'allow')
      : { kind: 'hold', reasonCode: 'second-auth-unavailable' } as const);
    const onClosure = vi.fn();
    const { stdin, lastFrame } = render(
      <ApprovalCard events={events(first, second)} onDecide={onDecide} onClosure={onClosure} labels={LABELS} suspendTerminal={suspend} />,
    );
    await tick(); stdin.write('a'); await tick(120);
    expect(onDecide).toHaveBeenCalledTimes(2);
    expect(onClosure).toHaveBeenCalledExactlyOnceWith(first, 'allow');
    expect(lastFrame()).toContain(second.summary);
    expect(lastFrame()).toContain('second-auth-unavailable');
  });

  void React;
});

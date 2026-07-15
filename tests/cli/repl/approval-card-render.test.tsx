// SURF-3 / born-697 — ApprovalCard RENDER + keypress via ink-testing-library.
//
// This is the highest-value test the missing Ink library blocked all session:
// born-697's `onClosure` (the visible "✅ Onaylandı / ❌ Reddedildi" line) fires
// from the card's OWN useInput keypress. Before ink-testing-library it could only
// be verified through the extracted pure helper (formatApprovalClosure); now the
// real y/n keypress → onDecide + onClosure chain is proven end-to-end.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { ApprovalCard } from '../../../src/cli/repl/approval-card.js';
import { DEFAULT_APPROVAL_CARD_LABELS } from '../../../src/cli/repl/app.js';
import { validateApprovalRequest, type ApprovalRequest } from '../../../src/core/approval-contract.js';
import type { ApprovalStreamEvent } from '../../../src/core/approval-eventstream.js';

const tick = (ms = 25): Promise<void> => new Promise((r) => setTimeout(r, ms));

function buildRequest(id: string): ApprovalRequest {
  const result = validateApprovalRequest({
    id,
    requester: { role: 'worker', instanceId: 'w-697' },
    summary: `run rm -rf ./build (${id})`,
    details: { note: 'test' },
    scopeId: 'sprint-697',
    scope: 'shell-exec',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'local',
    userId: 'alperen',
    createdAt: '2026-07-16T00:00:00.000Z',
    expiresAt: '2026-07-16T00:15:00.000Z',
    maskedArgs: { cmd: '***REDACTED***' },
  });
  if (!result.ok) throw new Error(`invalid fixture: ${result.errors.join('; ')}`);
  return result.value;
}

/** An events stream that delivers one pending request then stays open. */
async function* oneRequest(request: ApprovalRequest): AsyncGenerator<ApprovalStreamEvent> {
  yield { kind: 'pending', request };
  await new Promise<void>(() => { /* keep the card mounted */ });
}

describe('ApprovalCard — render + decide keypress (born-697, ink-testing-library)', () => {
  it('renders the pending request summary + risk badge', async () => {
    const req = buildRequest('apr-1');
    const { lastFrame } = render(
      <ApprovalCard events={oneRequest(req)} onDecide={() => {}} decidedBy="terminal" channel="terminal" labels={DEFAULT_APPROVAL_CARD_LABELS} />,
    );
    await tick();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('run rm -rf ./build');
    expect(frame).toContain(DEFAULT_APPROVAL_CARD_LABELS.riskLabels.high);
  });

  it('pressing y → onDecide(allow) AND onClosure(request, "allow") both fire', async () => {
    const req = buildRequest('apr-2');
    const onDecide = vi.fn();
    const onClosure = vi.fn();
    const { stdin } = render(
      <ApprovalCard events={oneRequest(req)} onDecide={onDecide} onClosure={onClosure} decidedBy="terminal" channel="terminal" labels={DEFAULT_APPROVAL_CARD_LABELS} />,
    );
    await tick();
    stdin.write('y');
    await tick();
    expect(onDecide).toHaveBeenCalledTimes(1);
    expect(onDecide.mock.calls[0]![1]).toMatchObject({ decision: 'allow', channel: 'terminal' });
    // born-697: the closure callback fires with the request + 'allow'.
    expect(onClosure).toHaveBeenCalledWith(expect.objectContaining({ id: 'apr-2' }), 'allow');
  });

  it('pressing n → onClosure(request, "deny")', async () => {
    const req = buildRequest('apr-3');
    const onClosure = vi.fn();
    const { stdin } = render(
      <ApprovalCard events={oneRequest(req)} onDecide={() => {}} onClosure={onClosure} decidedBy="terminal" channel="terminal" labels={DEFAULT_APPROVAL_CARD_LABELS} />,
    );
    await tick();
    stdin.write('n');
    await tick();
    expect(onClosure).toHaveBeenCalledWith(expect.objectContaining({ id: 'apr-3' }), 'deny');
  });

  it('isActive=false → a keypress is ignored (mutex deference)', async () => {
    const req = buildRequest('apr-4');
    const onDecide = vi.fn();
    const { stdin } = render(
      <ApprovalCard events={oneRequest(req)} onDecide={onDecide} decidedBy="terminal" channel="terminal" labels={DEFAULT_APPROVAL_CARD_LABELS} isActive={false} />,
    );
    await tick();
    stdin.write('y');
    await tick();
    expect(onDecide).not.toHaveBeenCalled();
  });

  void React;
});

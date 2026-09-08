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
import { buildApprovalLabels } from '../../../src/cli/repl/run.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';
import { validateApprovalRequest, type ApprovalRequest } from '../../../src/core/approval-contract.js';
import type { ApprovalStreamEvent } from '../../../src/core/approval-eventstream.js';
import type { ApprovalTerminalDecisionResult } from '../../../src/cli/repl/approval-terminal-command.js';
import { TerminalGlyphProvider } from '../../../src/cli/repl/terminal-glyph-context.js';
import { renderTerminalOwnedTemplate, resolveTerminalGlyphs } from '../../../src/cli/helpers/terminal-glyphs.js';

/** en card labels — app.tsx owns no default object since TERMINAL-TOOLS-002. */
const EN_LABELS = buildApprovalLabels((k) => getMessage(k, 'en'));
const ASCII_GLYPHS = resolveTerminalGlyphs(true);
const ASCII_LABELS = buildApprovalLabels((k) => renderTerminalOwnedTemplate(getMessage(k, 'en'), ASCII_GLYPHS));

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

/** A pending stream whose lifetime is owned and released by each mounted test. */
function pendingFixture(request: ApprovalRequest): { events: AsyncGenerator<ApprovalStreamEvent>; release(): void } {
  let release!: () => void;
  const closed = new Promise<void>((resolve) => { release = resolve; });
  async function* events(): AsyncGenerator<ApprovalStreamEvent> {
    yield { kind: 'pending', request };
    await closed;
  }
  return { events: events(), release };
}

const waitForText = async (lastFrame: () => string | undefined, text: string): Promise<void> => {
  await vi.waitFor(() => expect(lastFrame() ?? '').toContain(text), { timeout: 1_000 });
};

const suspend = async (callback: () => void | Promise<void>): Promise<void> => { await callback(); };
function accepted(req: ApprovalRequest, action: 'allow' | 'deny'): ApprovalTerminalDecisionResult {
  return {
    kind: 'accepted',
    decision: {
      requestId: req.id,
      decision: action,
      decidedBy: req.userId,
      channel: 'local-terminal',
      decidedAt: '2026-07-16T00:01:00.000Z',
      reason: '',
    },
  };
}

describe('ApprovalCard — render + decide keypress (born-697, ink-testing-library)', () => {
  it('Esc collapses expanded details without deciding the pending request', async () => {
    const req = buildRequest('apr-esc');
    const onDecide = vi.fn();
    const fixture = pendingFixture(req);
    const { stdin, lastFrame, unmount } = render(<ApprovalCard events={fixture.events} onDecide={onDecide} labels={EN_LABELS} suspendTerminal={suspend} />);
    try {
      await waitForText(lastFrame, req.summary);
      stdin.write('d');
      await waitForText(lastFrame, EN_LABELS.detailsHeading);
      stdin.write(String.fromCharCode(27));
      await vi.waitFor(() => {
        expect(lastFrame() ?? '').toContain(req.summary);
        expect(lastFrame() ?? '').not.toContain(EN_LABELS.detailsHeading);
      }, { timeout: 1_000 });
      expect(onDecide).not.toHaveBeenCalled();
    } finally {
      fixture.release();
      unmount();
    }
  });
  it('renders the pending request summary + risk badge', async () => {
    const req = buildRequest('apr-1');
    const fixture = pendingFixture(req);
    const { lastFrame, unmount } = render(
      <ApprovalCard events={fixture.events} onDecide={() => {}} labels={EN_LABELS} suspendTerminal={suspend} />,
    );
    try {
      await waitForText(lastFrame, req.summary);
      expect(lastFrame() ?? '').toContain(EN_LABELS.riskLabels.high);
    } finally {
      fixture.release();
      unmount();
    }
  });

  it('uses an ASCII frame/owned separators and preserves request Unicode', async () => {
    const req: ApprovalRequest = {
      ...buildRequest('apr-ascii'),
      summary: 'Türkçe✓ karar · 東京😀',
      maskedArgs: { note: 'sağlayıcı·✓東京😀' },
    };
    const fixture = pendingFixture(req);
    const ui = render(
      <TerminalGlyphProvider glyphs={ASCII_GLYPHS}>
        <ApprovalCard events={fixture.events} onDecide={() => {}} labels={ASCII_LABELS} suspendTerminal={suspend} />
      </TerminalGlyphProvider>,
    );
    try {
      await waitForText(ui.lastFrame, req.summary);
      expect(ui.lastFrame() ?? '').toMatch(/^\+-+\+$/m);
      expect(ui.lastFrame() ?? '').not.toMatch(/[╭╮╰╯│]/u);
      ui.stdin.write('d');
      await waitForText(ui.lastFrame, 'sağlayıcı·✓東京😀');
    } finally {
      fixture.release();
      ui.unmount();
    }
  });

  it('pressing y → onDecide(allow) AND onClosure(request, "allow") both fire', async () => {
    const req = buildRequest('apr-2');
    const onDecide = vi.fn(async () => accepted(req, 'allow'));
    const onClosure = vi.fn();
    const fixture = pendingFixture(req);
    const { stdin, lastFrame, unmount } = render(
      <ApprovalCard events={fixture.events} onDecide={onDecide} onClosure={onClosure} labels={EN_LABELS} suspendTerminal={suspend} />,
    );
    try {
      await waitForText(lastFrame, req.summary);
      stdin.write('y');
      await vi.waitFor(() => expect(onClosure).toHaveBeenCalledWith(expect.objectContaining({ id: 'apr-2' }), 'allow'), { timeout: 1_000 });
      expect(onDecide).toHaveBeenCalledTimes(1);
      expect(onDecide.mock.calls[0]![0]).toMatchObject({ id: 'apr-2' });
      expect(onDecide.mock.calls[0]![1]).toBe('allow');
    } finally {
      fixture.release();
      unmount();
    }
  });

  it('pressing n → onClosure(request, "deny")', async () => {
    const req = buildRequest('apr-3');
    const onClosure = vi.fn();
    const fixture = pendingFixture(req);
    const { stdin, lastFrame, unmount } = render(
      <ApprovalCard events={fixture.events} onDecide={async () => accepted(req, 'deny')} onClosure={onClosure} labels={EN_LABELS} suspendTerminal={suspend} />,
    );
    try {
      await waitForText(lastFrame, req.summary);
      stdin.write('n');
      await vi.waitFor(() => expect(onClosure).toHaveBeenCalledWith(expect.objectContaining({ id: 'apr-3' }), 'deny'), { timeout: 1_000 });
    } finally {
      fixture.release();
      unmount();
    }
  });

  it('isActive=false → a keypress is ignored (mutex deference)', async () => {
    const req = buildRequest('apr-4');
    const onDecide = vi.fn();
    const fixture = pendingFixture(req);
    const { stdin, lastFrame, unmount } = render(
      <ApprovalCard events={fixture.events} onDecide={onDecide} labels={EN_LABELS} isActive={false} suspendTerminal={suspend} />,
    );
    try {
      await waitForText(lastFrame, req.summary);
      stdin.write('y');
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(onDecide).not.toHaveBeenCalled();
    } finally {
      fixture.release();
      unmount();
    }
  });

  void React;
});

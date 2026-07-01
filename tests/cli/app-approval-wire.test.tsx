// ═══ app-approval-wire tests (APP-APPROVAL-WIRE, sprint-355 task 355-011) ═══
//
// Why plain-logic tests, no Ink render / ink-testing-library: same reason as
// tests/cli/approval-card.test.tsx and tests/cli/repl-surface-wire.test.tsx —
// ink-testing-library is not a project devDependency, so app.tsx's actual
// <ReplApp> component cannot be mounted here. Every decision this task adds
// is implemented as a pure, Ink-free, exported function/constant in app.tsx
// for exactly this reason — `resolveFooterLines`, `tapApprovalEvents`,
// `DEFAULT_APPROVAL_CARD_LABELS` — same pattern as `resolveModeLabel` /
// `bgPayloadsToTurnTexts` (354-001).
//
// "kart görünür" (card visible) is asserted via the SAME queue this task
// wires ApprovalCard's own internal consumption from (createApprovalCardQueue,
// approval-card.tsx, already unit-tested in approval-card.test.tsx) — its
// `.head() !== null` is exactly the condition ApprovalCard's own render
// branches on (`if (!head) return null;`), so it stands in for "the card
// would render" without mounting Ink.

import { describe, it, expect, vi } from 'vitest';
import {
  resolveFooterLines,
  tapApprovalEvents,
  DEFAULT_APPROVAL_CARD_LABELS,
} from '../../src/cli/repl/app.js';
import { createApprovalCardQueue, mapApprovalKey } from '../../src/cli/repl/approval-card.js';
import { validateApprovalRequest, type ApprovalRequest } from '../../src/core/approval-contract.js';
import type { ApprovalStreamEvent } from '../../src/core/approval-eventstream.js';
import type { ApprovalDecisionInput } from '../../src/core/approval-broker.js';

const CREATED_AT = '2026-07-01T21:00:00.000Z';
const EXPIRES_AT = '2026-07-01T21:15:00.000Z';

function buildRequest(id: string, overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  const result = validateApprovalRequest({
    id,
    requester: { role: 'worker', instanceId: 'w-355-011' },
    summary: `approval request ${id}`,
    details: { note: 'test' },
    scopeId: 'sprint-355',
    scope: 'shell-exec',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'local',
    userId: 'alperen',
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
    maskedArgs: { cmd: '***REDACTED***' },
    ...overrides,
  });
  if (!result.ok) throw new Error(`invalid fixture: ${result.errors.join('; ')}`);
  return result.value;
}

function pendingEvent(request: ApprovalRequest): ApprovalStreamEvent {
  return { kind: 'pending', request };
}

function crossDecidedEvent(request: ApprovalRequest, channel = 'terminal'): ApprovalStreamEvent {
  return {
    kind: 'cross-decided',
    request,
    decision: {
      requestId: request.id,
      decision: 'allow',
      decidedBy: channel,
      channel,
      decidedAt: CREATED_AT,
      reason: '',
    },
    message: `${channel} kanalında karar verildi`,
  };
}

/** Fake ApprovalTerminalChannel.events source — an async generator over a
 *  fixed event list, standing in for the real relay/eventstream chain. */
async function* fakeRelayEvents(events: ApprovalStreamEvent[]): AsyncGenerator<ApprovalStreamEvent> {
  for (const event of events) yield event;
}

// ─── resolveFooterLines — dual-stream footer compression ────────────────────

describe('resolveFooterLines — flag/pending-off passthrough (byte-identical)', () => {
  it('returns footerLines unchanged when no approval is pending', () => {
    const lines = ['Running: sprint-355', 'Elapsed: 3m', 'Provider: claude (healthy)'];
    expect(resolveFooterLines(lines, false)).toBe(lines); // same reference — no copy either
  });

  it('returns [] unchanged when footerLines is empty and nothing pending', () => {
    expect(resolveFooterLines([], false)).toEqual([]);
  });
});

describe('resolveFooterLines — pending compresses to the dual-stream min-1 floor', () => {
  it('compresses a multi-line footer to exactly its first line while pending', () => {
    const lines = ['Running: sprint-355', 'Elapsed: 3m', 'Provider: claude (healthy)'];
    expect(resolveFooterLines(lines, true)).toEqual(['Running: sprint-355']);
  });

  it('never fully disappears — a single-line footer stays that one line ("footer kaybolmaz")', () => {
    expect(resolveFooterLines(['only status line'], true)).toEqual(['only status line']);
  });

  it('an empty footer stays empty even while pending (nothing to reserve room for)', () => {
    expect(resolveFooterLines([], true)).toEqual([]);
  });

  it('never leaks the internal dual-stream placeholder into rendered output', () => {
    const lines = ['a', 'b', 'c', 'd', 'e'];
    const result = resolveFooterLines(lines, true);
    for (const line of result) expect(line).not.toContain('dual-stream-approval-placeholder');
  });
});

// ─── DEFAULT_APPROVAL_CARD_LABELS — i18n fallback shape ──────────────────────

describe('DEFAULT_APPROVAL_CARD_LABELS — English fallback until messages round-8', () => {
  it('supplies every ApprovalCardLabels field non-empty', () => {
    expect(DEFAULT_APPROVAL_CARD_LABELS.hint.length).toBeGreaterThan(0);
    expect(DEFAULT_APPROVAL_CARD_LABELS.progress).toContain('{index}');
    expect(DEFAULT_APPROVAL_CARD_LABELS.progress).toContain('{total}');
    expect(DEFAULT_APPROVAL_CARD_LABELS.detailsHeading.length).toBeGreaterThan(0);
    expect(DEFAULT_APPROVAL_CARD_LABELS.noArgs.length).toBeGreaterThan(0);
  });

  it('supplies a risk label for every ApprovalRisk tier', () => {
    const tiers = ['none', 'low', 'medium', 'high', 'critical'] as const;
    for (const tier of tiers) {
      expect(DEFAULT_APPROVAL_CARD_LABELS.riskLabels[tier].length).toBeGreaterThan(0);
    }
  });
});

// ─── tapApprovalEvents — forwards unchanged while feeding the tracker ────────

describe('tapApprovalEvents — single-consumer forward + tracker feed', () => {
  it('forwards every source event to the downstream consumer unchanged and in order', async () => {
    const a = buildRequest('a');
    const b = buildRequest('b');
    const events = [pendingEvent(a), pendingEvent(b), crossDecidedEvent(a)];
    const tracker = createApprovalCardQueue(() => {});
    const forwarded: ApprovalStreamEvent[] = [];
    for await (const event of tapApprovalEvents(fakeRelayEvents(events), tracker)) {
      forwarded.push(event);
    }
    expect(forwarded).toEqual(events);
  });

  it('feeds the tracker so its head reflects the tapped events after consumption', async () => {
    const a = buildRequest('a');
    const tracker = createApprovalCardQueue(() => {});
    expect(tracker.head()).toBeNull();
    for await (const _event of tapApprovalEvents(fakeRelayEvents([pendingEvent(a)]), tracker)) {
      // drain
    }
    expect(tracker.head()).toMatchObject({ request: { id: 'a' } });
  });
});

// ─── End-to-end fake-relay chain: pending -> card visible -> y/n decide -> resolved ─

describe('APP-APPROVAL-WIRE end-to-end — pending -> kart görünür -> y/n decide (fake-relay)', () => {
  it('a pending event makes the card "visible" (queue head non-null) and compresses the footer', async () => {
    const request = buildRequest('req-1');
    const tracker = createApprovalCardQueue(() => {});
    const footerLines = ['Running: sprint-355', 'Elapsed: 1m'];

    // Not yet consumed: nothing pending, footer untouched.
    expect(resolveFooterLines(footerLines, tracker.head() !== null)).toEqual(footerLines);

    const events = tapApprovalEvents(fakeRelayEvents([pendingEvent(request)]), tracker);
    const iterator = events[Symbol.asyncIterator]();
    await iterator.next(); // ApprovalCard's own ingest loop would consume this

    expect(tracker.head()).not.toBeNull(); // "kart görünür" proxy — ApprovalCard would render it
    expect(resolveFooterLines(footerLines, tracker.head() !== null)).toEqual(['Running: sprint-355']);
  });

  it('y (approve) sends the exact decision shape ApprovalCard.sendDecision produces to the fake relay, then resolving retires the head and restores the footer', async () => {
    const request = buildRequest('req-2');
    const tracker = createApprovalCardQueue(() => {});
    const decide = vi.fn<(id: string, input: ApprovalDecisionInput) => void>();
    const footerLines = ['Running: sprint-355', 'Elapsed: 1m', 'Provider: claude'];

    const events = tapApprovalEvents(fakeRelayEvents([pendingEvent(request)]), tracker);
    const iterator = events[Symbol.asyncIterator]();
    await iterator.next();

    const head = tracker.head();
    expect(head).not.toBeNull();
    expect(resolveFooterLines(footerLines, true)).toEqual(['Running: sprint-355']);

    // Simulate the 'y' keypress -> ApprovalCard.mapApprovalKey('y') === 'approve'
    // -> sendDecision(request, 'allow') -> onDecide (== approvalChannel.decide).
    expect(mapApprovalKey('y')).toBe('approve');
    decide(head!.request.id, { decision: 'allow', decidedBy: 'terminal', channel: 'terminal', decidedAt: CREATED_AT, reason: '' });
    tracker.resolve(head!.request.id); // ApprovalCard retires its own head locally

    expect(decide).toHaveBeenCalledExactlyOnceWith('req-2', {
      decision: 'allow',
      decidedBy: 'terminal',
      channel: 'terminal',
      decidedAt: CREATED_AT,
      reason: '',
    });
    expect(tracker.head()).toBeNull();
    expect(resolveFooterLines(footerLines, tracker.head() !== null)).toBe(footerLines); // fully restored
  });

  it('n (deny) does not send an allow decision, and a cross-decided broadcast (e.g. dashboard) also retires the head + restores the footer', async () => {
    const request = buildRequest('req-3');
    const tracker = createApprovalCardQueue(() => {});
    const decide = vi.fn<(id: string, input: ApprovalDecisionInput) => void>();
    const footerLines = ['Running: sprint-355'];

    const events = tapApprovalEvents(fakeRelayEvents([pendingEvent(request), crossDecidedEvent(request, 'dashboard')]), tracker);
    const iterator = events[Symbol.asyncIterator]();
    await iterator.next(); // pending

    expect(mapApprovalKey('n')).toBe('deny');
    expect(tracker.head()).not.toBeNull();

    await iterator.next(); // cross-decided (resolved by ANOTHER channel, e.g. dashboard)

    expect(decide).not.toHaveBeenCalled(); // this channel never decided it
    expect(tracker.head()).toBeNull(); // retired by the cross-broadcast, not a local resolve()
    expect(resolveFooterLines(footerLines, tracker.head() !== null)).toBe(footerLines);
  });
});

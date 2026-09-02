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
} from '../../src/cli/repl/app.js';
import { createApprovalCardQueue, mapApprovalKey } from '../../src/cli/repl/approval-card.js';
import { validateApprovalRequest, type ApprovalRequest } from '../../src/core/approval-contract.js';
import type { ApprovalStreamEvent } from '../../src/core/approval-eventstream.js';
import type { ApprovalDecisionInput } from '../../src/core/approval-broker.js';
// ═══ Task 358-002 — APR-XPROC-WIRE — pure-logic tests ═══════════════════════
//
// Wires Task 1's ApprovalStoreWatch (src/core/approval-store-watch.ts,
// APR-XPROC-CORE) into run.tsx's `repl_surface.approvals=true` branch via
// `wireApprovalCrossProcess` — exported specifically so this can be tested
// without mounting Ink (same "pull pure logic out of the entrypoint" pattern
// as app.tsx's tapApprovalEvents/resolveFooterLines, see
// tests/cli/repl/app-surface-wire.test.tsx). Hermetic: real
// ApprovalBroker/ApprovalRelay/ApprovalEventStream/createApprovalTerminalChannel
// instances over a tmpdir store — mirrors tests/core/approval-store-watch.test.ts's
// own "a SEPARATE broker instance simulates another process" pattern.
import { beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { wireApprovalCrossProcess } from "../../src/cli/repl/run.js";
import { createApprovalStoreWatch, type ApprovalStoreWatchFsWatcher } from "../../src/core/approval-store-watch.js";
import { ApprovalBroker, type ApprovalRequestInput } from "../../src/core/approval-broker.js";
import { ApprovalRelay } from "../../src/core/approval-relay.js";
import { ApprovalEventStream } from "../../src/core/approval-eventstream.js";
import { createApprovalTerminalChannel } from "../../src/cli/repl/approval-terminal-channel.js";
import type { ApprovalStreamEvent as ApprovalStreamEvent__wire_018 } from "../../src/core/approval-eventstream.js";

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

// WIRE-018: physically merged from tests/cli/repl/approval-xproc-wire.test.ts.
{
// createdAt/expiresAt are computed relative to the REAL wall-clock (this suite
// does not inject a fixed clock into createApprovalStoreWatch — the watch's
// own default is `() => new Date()`) — a hardcoded past `expiresAt` would let
// `categorize()` bucket every submitted request as already-expired, so
// `onPending` would never fire.
function buildRequest(id: string, overrides: Partial<ApprovalRequestInput> = {}): ApprovalRequestInput {
    const now = Date.now();
    return {
        id,
        requester: { role: 'worker', instanceId: 'w-xproc' },
        summary: `approval request ${id}`,
        details: { note: 'test' },
        scopeId: 'sprint-358',
        scope: 'shell-exec',
        risk: 'high',
        policy: 'require-approval',
        defaultAction: 'deny',
        tenantId: 'local',
        userId: 'alperen',
        createdAt: new Date(now - 60000).toISOString(),
        expiresAt: new Date(now + 60 * 60000).toISOString(),
        ...overrides,
    };
}

/** Manual watch stub (mirrors approval-store-watch.test.ts's own pattern) — a
 *  test controls exactly when a re-scan happens via `.fire()`, instead of
 *  waiting on the real 1s poll or platform fs.watch. */
function makeManualWatch(): {
    watch: ApprovalStoreWatchFsWatcher;
    fire: () => void;
} {
    let onChange: (() => void) | undefined;
    const watch: ApprovalStoreWatchFsWatcher = (_dir, cb) => {
        onChange = cb;
        return { close: () => { } };
    };
    return { watch, fire: () => onChange?.() };
}

async function nextEvent(events: AsyncIterable<ApprovalStreamEvent__wire_018>): Promise<ApprovalStreamEvent__wire_018> {
    const result = await events[Symbol.asyncIterator]().next();
    if (result.done)
        throw new Error('event stream ended before yielding an event');
    return result.value;
}

let projectRoot: string;

let storeDir: string;

beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'approval-xproc-wire-'));
    storeDir = join(projectRoot, 'approvals');
});

afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
});

describe('wireApprovalCrossProcess — flag gate', () => {
    it('enabled=false -> watchFactory is never called, returns undefined', () => {
        const broker = new ApprovalBroker(projectRoot, { storeDir });
        const factory = vi.fn(createApprovalStoreWatch);
        const handle = wireApprovalCrossProcess(false, broker, storeDir, factory);
        expect(handle).toBeUndefined();
        expect(factory).not.toHaveBeenCalled();
    });
});

describe('wireApprovalCrossProcess — cross-process pending → terminal-channel events', () => {
    it('a request submitted by a DIFFERENT broker instance appears as a pending event, without a duplicate write', async () => {
        const foreignBroker = new ApprovalBroker(projectRoot, { storeDir }); // simulates another process
        const req = foreignBroker.submit(buildRequest('apr-xproc-1'));
        const localBroker = new ApprovalBroker(projectRoot, { storeDir }); // THIS repl process's broker
        const relay = new ApprovalRelay(localBroker);
        const stream = new ApprovalEventStream(relay);
        const channel = createApprovalTerminalChannel(relay, stream);
        const handle = wireApprovalCrossProcess(true, localBroker, storeDir);
        expect(handle).toBeDefined();
        const event = await nextEvent(channel.events);
        expect(event.kind).toBe('pending');
        if (event.kind === 'pending')
            expect(event.request).toEqual(req);
        // Startup hydration registers the validated durable request locally, while
        // the watch emits the pending event without attempting a second write.
        expect(localBroker.list('all')).toEqual([req]);
        expect(readdirSync(storeDir).filter((f) => f === `${req.id}.request.json`)).toHaveLength(1);
        handle!.dispose();
        channel.dispose();
    });
});

describe('wireApprovalCrossProcess — terminal decide → decision persisted to the shared store', () => {
    it('deciding through the terminal channel writes a decision file at the SAME storeDir', async () => {
        const foreignBroker = new ApprovalBroker(projectRoot, { storeDir });
        const req = foreignBroker.submit(buildRequest('apr-xproc-2'));
        const localBroker = new ApprovalBroker(projectRoot, { storeDir });
        const relay = new ApprovalRelay(localBroker);
        const stream = new ApprovalEventStream(relay);
        const channel = createApprovalTerminalChannel(relay, stream);
        const handle = wireApprovalCrossProcess(true, localBroker, storeDir);
        await nextEvent(channel.events); // pending observed by this process
        const decisionPath = join(storeDir, `${req.id}.decision.json`);
        expect(existsSync(decisionPath)).toBe(false);
        channel.decide(req.id, {
            decision: 'allow',
            decidedBy: 'test-operator',
            // ApprovalDecisionInput requires `channel`, but ApprovalTerminalChannel's
            // own decide() strips it and always supplies its real attach name — see
            // approval-terminal-channel.ts.
            channel: 'ignored-by-terminal-channel',
            decidedAt: '2026-07-02T12:30:00.000Z',
            reason: '',
        });
        expect(existsSync(decisionPath)).toBe(true);
        const onDisk = JSON.parse(readFileSync(decisionPath, 'utf-8')) as {
            decision: string;
            requestId: string;
        };
        expect(onDisk.decision).toBe('allow');
        expect(onDisk.requestId).toBe(req.id);
        handle!.dispose();
        channel.dispose();
    });
});

describe('wireApprovalCrossProcess — cross-process decided → card-queue cleanup event', () => {
    it('a decision written by a THIRD party after pending was observed surfaces as cross-decided', async () => {
        const foreignBroker = new ApprovalBroker(projectRoot, { storeDir });
        const req = foreignBroker.submit(buildRequest('apr-xproc-3'));
        const localBroker = new ApprovalBroker(projectRoot, { storeDir });
        const relay = new ApprovalRelay(localBroker);
        const stream = new ApprovalEventStream(relay);
        const channel = createApprovalTerminalChannel(relay, stream);
        const manual = makeManualWatch();
        const handle = wireApprovalCrossProcess(true, localBroker, storeDir, (dir, handlers) => createApprovalStoreWatch(dir, handlers, { watch: manual.watch, pollIntervalMs: 999000 }));
        const iterator = channel.events[Symbol.asyncIterator]();
        const first = await iterator.next();
        expect(first.value).toMatchObject({ kind: 'pending' });
        // A DIFFERENT process (not this REPL's own terminal/event-stream channel)
        // decides it directly, e.g. `deckent approve <id>` from another shell.
        foreignBroker.decide(req.id, {
            decision: 'deny',
            decidedBy: 'other-shell',
            channel: 'cli',
            decidedAt: '2026-07-02T12:31:00.000Z',
            reason: '',
        });
        manual.fire();
        const second = await iterator.next();
        expect(second.value).toMatchObject({
            kind: 'cross-decided',
            decision: { decision: 'deny', channel: 'cli' },
            request: { id: req.id },
        });
        handle!.dispose();
        channel.dispose();
        void iterator.return?.();
    });
    it('a decision already on disk BEFORE this process attached (no cached request) never crashes or emits', async () => {
        const foreignBroker = new ApprovalBroker(projectRoot, { storeDir });
        const req = foreignBroker.submit(buildRequest('apr-xproc-4'));
        foreignBroker.decide(req.id, {
            decision: 'allow',
            decidedBy: 'other-shell',
            channel: 'cli',
            decidedAt: '2026-07-02T12:32:00.000Z',
            reason: '',
        });
        const localBroker = new ApprovalBroker(projectRoot, { storeDir });
        const relay = new ApprovalRelay(localBroker);
        const stream = new ApprovalEventStream(relay);
        const channel = createApprovalTerminalChannel(relay, stream);
        expect(() => {
            const handle = wireApprovalCrossProcess(true, localBroker, storeDir);
            handle!.dispose();
        }).not.toThrow();
        channel.dispose();
    });
});
}

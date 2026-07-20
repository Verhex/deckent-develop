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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { wireApprovalCrossProcess } from '../../../src/cli/repl/run.js';
import {
  createApprovalStoreWatch,
  type ApprovalStoreWatchFsWatcher,
} from '../../../src/core/approval-store-watch.js';
import { ApprovalBroker, type ApprovalRequestInput } from '../../../src/core/approval-broker.js';
import { ApprovalRelay } from '../../../src/core/approval-relay.js';
import { ApprovalEventStream } from '../../../src/core/approval-eventstream.js';
import { createApprovalTerminalChannel } from '../../../src/cli/repl/approval-terminal-channel.js';
import type { ApprovalStreamEvent } from '../../../src/core/approval-eventstream.js';

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
    createdAt: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now + 60 * 60_000).toISOString(),
    ...overrides,
  };
}

/** Manual watch stub (mirrors approval-store-watch.test.ts's own pattern) — a
 *  test controls exactly when a re-scan happens via `.fire()`, instead of
 *  waiting on the real 1s poll or platform fs.watch. */
function makeManualWatch(): { watch: ApprovalStoreWatchFsWatcher; fire: () => void } {
  let onChange: (() => void) | undefined;
  const watch: ApprovalStoreWatchFsWatcher = (_dir, cb) => {
    onChange = cb;
    return { close: () => {} };
  };
  return { watch, fire: () => onChange?.() };
}

async function nextEvent(events: AsyncIterable<ApprovalStreamEvent>): Promise<ApprovalStreamEvent> {
  const result = await events[Symbol.asyncIterator]().next();
  if (result.done) throw new Error('event stream ended before yielding an event');
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
    if (event.kind === 'pending') expect(event.request).toEqual(req);

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
    const onDisk = JSON.parse(readFileSync(decisionPath, 'utf-8')) as { decision: string; requestId: string };
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
    const handle = wireApprovalCrossProcess(true, localBroker, storeDir, (dir, handlers) =>
      createApprovalStoreWatch(dir, handlers, { watch: manual.watch, pollIntervalMs: 999_000 }),
    );

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

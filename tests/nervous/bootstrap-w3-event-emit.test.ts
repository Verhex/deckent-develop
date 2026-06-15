// tests/nervous/bootstrap-w3-event-emit.test.ts
//
// W3 (cross-surface live-tail) — a parked nervous approval is teed onto the
// active sprint's event stream as a NERVOUS_NOTIFICATION event carrying the
// EXACT `deckent nervous accept <id>` command, so `deckent_watch` (MCP) and
// `deckent status --follow` surface it live. The durable nervous-pending.json
// stays the snapshot source for plain `deckent status` (W4) — the event is the
// additive live signal. Fail-safe: no active sprint → no event, no throw.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  emitNervousApprovalPending,
  wrapPendingStoreWithEmit,
} from '../../src/nervous/bootstrap.js';
import { readEvents, CHANNELS } from '../../src/core/event-stream.js';
import type { NervousNotification } from '../../src/core/nervous-types.js';
import type { PendingApprovalStore } from '../../src/nervous/executor.js';

const dirs: string[] = [];
function sandbox(withSprint = true): string {
  const d = mkdtempSync(join(tmpdir(), 'nerv-w3-emit-'));
  dirs.push(d);
  mkdirSync(join(d, '.deckent'), { recursive: true });
  if (withSprint) {
    writeFileSync(
      join(d, '.deckent', 'sprint-state.json'),
      JSON.stringify({ sprintId: 'sprint-999' }),
    );
  }
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function notif(id: string, title = 'Directives changed mid-sprint'): NervousNotification {
  return {
    id,
    type: 't',
    title,
    message: 'M',
    severity: 'warning',
    createdAt: '2026-06-15T00:00:00.000Z',
    detectorId: 'd',
    actions: [],
    timeoutMs: null,
  };
}

describe('emitNervousApprovalPending (W3 live-tail backbone)', () => {
  it('writes a NERVOUS_NOTIFICATION event carrying the exact accept command', () => {
    const d = sandbox();
    emitNervousApprovalPending(d, notif('k9'));

    const events = readEvents(d, 'sprint-999', { channel: CHANNELS.NERVOUS_NOTIFICATION });
    expect(events.length).toBe(1);
    const p = events[0]!.payload as Record<string, unknown>;
    expect(p.kind).toBe('nervous');
    expect(p.id).toBe('k9');
    expect(p.title).toBe('Directives changed mid-sprint');
    expect(p.acceptCommand).toBe('deckent nervous accept k9');
    expect(p.rejectCommand).toBe('deckent nervous reject k9');
    expect(events[0]!.target).toBe('user');
  });

  it('is fail-safe when no active sprint (no event, no throw)', () => {
    const d = sandbox(false);
    expect(() => emitNervousApprovalPending(d, notif('x'))).not.toThrow();
    expect(readEvents(d, 'sprint-999')).toEqual([]);
  });
});

describe('wrapPendingStoreWithEmit (W3 park→event tee)', () => {
  it('add() forwards to the base store AND emits a live event; remove() only forwards', () => {
    const d = sandbox();
    const calls: string[] = [];
    const base: PendingApprovalStore = {
      add: (n) => calls.push(`add:${n.id}`),
      remove: (id) => calls.push(`remove:${id}`),
    };

    const store = wrapPendingStoreWithEmit(base, d);
    store.add(notif('p1'));
    store.remove('p1');

    // Durable snapshot store still receives BOTH calls (W4 contract intact).
    expect(calls).toEqual(['add:p1', 'remove:p1']);
    // Only the park (add) tees a live event — remove does not.
    const events = readEvents(d, 'sprint-999', { channel: CHANNELS.NERVOUS_NOTIFICATION });
    expect(events.map((e) => (e.payload as Record<string, unknown>).id)).toEqual(['p1']);
  });
});

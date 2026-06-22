/**
 * `deckent flow run` self-dispatch wire (B11).
 *
 * createSelfDispatchCallback was a fully-built, unit-tested but ZERO-caller callback:
 * the flow daemon (`deckent flow run`) only printed the due-flow count and took no
 * action. handleFlowDispatchTick wires the callback in — each tick evaluates the due
 * flows against the scheduled self-dispatch policy and QUEUES approved dispatches
 * (requiresApproval=true → never auto-starts) to a persisted pending-approval file.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleFlowDispatchTick, pendingDispatchPath } from '../../src/cli/commands/flow.js';
import type { DueDispatch } from '../../src/core/flow-scheduler.js';

const dirs: string[] = [];
function root(): string { const d = mkdtempSync(join(tmpdir(), 'flow-sd-')); dirs.push(d); return d; }
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function dueFlow(id: string): DueDispatch {
  return { kind: 'scheduled', flow: { id } as never, nextRun: new Date('2026-06-22T00:00:00Z') } as DueDispatch;
}

describe('flow run self-dispatch wire (B11)', () => {
  it('queues due flows for self-dispatch and persists the pending-approval queue', () => {
    const r = root();
    const out: string[] = [];
    const added = handleFlowDispatchTick(r, [dueFlow('f1'), dueFlow('f2')], {
      print: (m) => out.push(m),
      clock: () => new Date('2026-06-22T00:00:00Z'),
    });

    // Pre-wire the daemon only printed a count; now the tick produces a real
    // PendingApprovalItem on the persisted queue.
    expect(added).toBe(1);
    const path = pendingDispatchPath(r);
    expect(existsSync(path)).toBe(true);
    const queue = JSON.parse(readFileSync(path, 'utf-8')) as Array<{ policyId: string; decision: { requiresApproval: boolean } }>;
    expect(queue).toHaveLength(1);
    expect(queue[0]!.policyId).toBe('flow-run');
    expect(queue[0]!.decision.requiresApproval).toBe(true); // human-in-the-loop: never auto-starts
    expect(out.join(' ')).toContain('queued for self-dispatch');
  });

  it('no flows due → nothing queued, no file written, honest report', () => {
    const r = root();
    const out: string[] = [];
    const added = handleFlowDispatchTick(r, [], { print: (m) => out.push(m) });
    expect(added).toBe(0);
    expect(existsSync(pendingDispatchPath(r))).toBe(false);
    expect(out.join(' ')).toContain('No flows due');
  });

  it('accumulates across ticks (the persisted queue grows)', () => {
    const r = root();
    const noop = (): void => { /* silent */ };
    handleFlowDispatchTick(r, [dueFlow('f1')], { print: noop });
    handleFlowDispatchTick(r, [dueFlow('f2')], { print: noop });
    const queue = JSON.parse(readFileSync(pendingDispatchPath(r), 'utf-8')) as unknown[];
    expect(queue).toHaveLength(2);
  });
});

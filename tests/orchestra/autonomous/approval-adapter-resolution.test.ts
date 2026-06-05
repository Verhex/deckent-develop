// APPROVE-001 (MASTER-PLAN §4G) — file-mediated cross-process approval resolution.
//
// Root cause being fixed: accept()/reject() mutate an in-memory `resolved` Map
// and request() reads only that map, so a `deckent autonomous approve <id>`
// invocation (a SEPARATE OS process) could never reach the running loop's gate.
// The fix persists the human decision to a decisions.json sibling of pending.json
// and re-reads it on each request(), so a decision written by one gate instance
// (the CLI process) is applied by another (the loop process).
//
// Hermetic: pending.json + decisions.json live under os.tmpdir(); two separate
// makeApprovalGate instances sharing the same paths simulate the two processes.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeApprovalGate } from '../../../src/orchestra/autonomous/approval-adapter.js';
import type { AutonomousTrigger } from '../../../src/orchestra/autonomous-runtime.js';

const trigger = (id: string): AutonomousTrigger => ({
  id,
  source: 'scheduled-flow',
  action: 'start',
  requestedBy: 'system',
});

describe('makeApprovalGate — file-mediated cross-process resolution (APPROVE-001)', () => {
  let dir: string;
  let pendingPath: string;
  let decisionsPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deckent-approve-'));
    pendingPath = join(dir, 'pending.json');
    decisionsPath = join(dir, 'decisions.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('applies an accept written by a separate gate instance (the CLI process)', async () => {
    const loopGate = makeApprovalGate({ pendingPath });
    // Loop parks the trigger (needs_approval → pending).
    expect((await loopGate.request(trigger('t1'))).outcome).toBe('pending');

    // A separate gate instance — same files — accepts (simulates `autonomous approve`).
    const cliGate = makeApprovalGate({ pendingPath });
    cliGate.accept('t1');

    // The loop's next request() must now see the approval from disk.
    const second = await loopGate.request(trigger('t1'));
    expect(second.outcome).toBe('approved');
    // …and the resolved trigger is removed from the pending queue.
    expect(loopGate.pending().some((p) => p.triggerId === 't1')).toBe(false);
  });

  it('applies a reject written by a separate gate instance', async () => {
    const loopGate = makeApprovalGate({ pendingPath });
    await loopGate.request(trigger('t2'));

    const cliGate = makeApprovalGate({ pendingPath });
    cliGate.reject('t2', 'not now');

    const second = await loopGate.request(trigger('t2'));
    expect(second.outcome).toBe('rejected');
    expect(second.reason).toContain('not now');
  });

  it('persists the decision to a decisions.json sibling and consumes it once', async () => {
    const loopGate = makeApprovalGate({ pendingPath, decisionsPath });
    await loopGate.request(trigger('t3'));

    const cliGate = makeApprovalGate({ pendingPath, decisionsPath });
    cliGate.accept('t3');
    expect(existsSync(decisionsPath)).toBe(true);
    expect(readFileSync(decisionsPath, 'utf-8')).toContain('t3');

    // First re-request applies + clears the decision.
    expect((await loopGate.request(trigger('t3'))).outcome).toBe('approved');
    const after = existsSync(decisionsPath)
      ? readFileSync(decisionsPath, 'utf-8')
      : '';
    expect(after).not.toContain('t3');
  });

  it('🔴 NO-AUTO-APPROVE: stays pending across repeated requests with no decision', async () => {
    const gate = makeApprovalGate({ pendingPath });
    for (let i = 0; i < 3; i++) {
      expect((await gate.request(trigger('t4'))).outcome).toBe('pending');
    }
    expect(gate.pending().some((p) => p.triggerId === 't4')).toBe(true);
  });
});

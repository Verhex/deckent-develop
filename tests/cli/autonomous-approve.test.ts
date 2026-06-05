// APPROVE-002 (MASTER-PLAN §4G) — `deckent autonomous approve/reject/pending`.
//
// These subcommands expose the file-mediated resolution channel (APPROVE-001):
// the operator can now SEE parked approvals and RESOLVE them, from a process
// separate from the running `autonomous start` loop. Tests assert the real
// cross-process effect (a decision made here is applied by a fresh loop-side
// gate) plus the not-found guard — not just printed strings.
//
// Hermetic: all state under os.tmpdir(); ADR-040 no-auto-approve preserved
// (a decision is recorded only by an explicit approve/reject call).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  handleApprove,
  handleReject,
  handlePending,
} from '../../src/cli/commands/autonomous.js';
import { makeApprovalGate } from '../../src/orchestra/autonomous/approval-adapter.js';
import type { AutonomousTrigger } from '../../src/orchestra/autonomous-runtime.js';

function pendingPath(root: string): string {
  return join(root, '.deckent', 'autonomous', 'pending.json');
}

function trig(id: string): AutonomousTrigger {
  return { id, source: 'scheduled-flow', action: 'start', requestedBy: 'system' };
}

/** Simulate the running loop parking a trigger as needs_approval → pending. */
async function park(root: string, id: string): Promise<void> {
  const gate = makeApprovalGate({ pendingPath: pendingPath(root) });
  await gate.request(trig(id));
}

/** Simulate the loop's next cycle re-requesting the trigger → returns its outcome. */
async function loopOutcome(root: string, id: string): Promise<string> {
  const gate = makeApprovalGate({ pendingPath: pendingPath(root) });
  return (await gate.request(trig(id))).outcome;
}

function captureStdout(fn: () => void | Promise<void>): Promise<string> {
  const captured: string[] = [];
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    captured.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  });
  const restore = (): void => spy.mockRestore();
  const result = fn();
  if (result instanceof Promise) {
    return result.finally(restore).then(() => captured.join(''));
  }
  restore();
  return Promise.resolve(captured.join(''));
}

describe('deckent autonomous approve/reject/pending (APPROVE-002)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'autonomous-approve-'));
    process.exitCode = undefined;
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  it('approve <id> → a parked trigger resolves approved for the running loop', async () => {
    await park(root, 't1');
    await captureStdout(() => handleApprove({ triggerId: 't1', root, lang: 'en' }));
    expect(await loopOutcome(root, 't1')).toBe('approved');
  });

  it('reject <id> → a parked trigger resolves rejected for the running loop', async () => {
    await park(root, 't2');
    await captureStdout(() => handleReject({ triggerId: 't2', root, lang: 'en' }));
    expect(await loopOutcome(root, 't2')).toBe('rejected');
  });

  it('approve on an unknown id → exitCode 1 and records no decision', async () => {
    await captureStdout(() => handleApprove({ triggerId: 'ghost', root, lang: 'en' }));
    expect(process.exitCode).toBe(1);
    const decisionsFile = join(root, '.deckent', 'autonomous', 'decisions.json');
    const recorded =
      existsSync(decisionsFile) && readFileSync(decisionsFile, 'utf-8').includes('ghost');
    expect(recorded).toBe(false);
  });

  it('pending → lists every parked trigger by id', async () => {
    await park(root, 't1');
    await park(root, 't2');
    const out = await captureStdout(() => handlePending({ root, lang: 'en' }));
    expect(out).toContain('t1');
    expect(out).toContain('t2');
  });
});

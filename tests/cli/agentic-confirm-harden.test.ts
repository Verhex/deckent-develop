import { describe, it, expect, vi } from 'vitest';
import { createInterface } from 'node:readline/promises';
import { Readable, Writable } from 'node:stream';
import type { Interface as ReadlinePromisesInterface } from 'node:readline/promises';

import {
  classifyActionRisk,
  confirmAction,
  requireConfirmIfRisky,
  type AgenticAction,
} from '../../src/cli/commands/agentic-confirm.js';

// 387-014 — AGENTIC-CONFIRM-HARDEN
//
// Two bugs hardened here:
// 1) confirmAction() used to unconditionally open a SECOND readline.Interface
//    on the caller's stdin/stdout even when the caller (e.g. the REPL) already
//    owns one for the whole session — a keystroke/line-event collision.
//    Fix: ConfirmOptions.rl lets the caller pass its own Interface; when set,
//    confirmAction() reuses it and never closes it.
// 2) classifyActionRisk() checked SAFE_KEYWORDS before RISKY_KEYWORDS, so an
//    action name containing both a safe and a risky substring (e.g.
//    "list_and_run") was misclassified 'safe' and silently skipped the
//    confirm gate. Fix: RISKY is checked first — risky always wins.

// ─── Helpers ────────────────────────────────────────────────────────

function sinkStream(): Writable {
  return new Writable({ write(_chunk, _enc, cb) { cb(); } });
}

/** A duck-typed caller-owned Interface: proves confirmAction talks to THIS
 * object (not to a second Interface it might open on its own). */
function fakeReadlineInterface(answer: string): {
  rl: ReadlinePromisesInterface;
  question: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} {
  const question = vi.fn(async () => answer);
  const close = vi.fn();
  const rl = { question, close } as unknown as ReadlinePromisesInterface;
  return { rl, question, close };
}

const risky: AgenticAction = { name: 'deckent_kill', description: 'stop all workers' };

// ─── confirmAction — readline reuse ──────────────────────────────────

describe('confirmAction — caller-owned readline reuse (no second interface)', () => {
  it('asks the question on the caller-owned rl, not a second interface', async () => {
    const { rl, question } = fakeReadlineInterface('y');
    const result = await confirmAction(risky, { rl });
    expect(result).toBe(true);
    expect(question).toHaveBeenCalledTimes(1);
    expect(question.mock.calls[0]?.[0]).toContain('deckent_kill');
  });

  it('never closes a reused rl — caller keeps ownership of its lifecycle', async () => {
    const { rl, close } = fakeReadlineInterface('n');
    const result = await confirmAction(risky, { rl });
    expect(result).toBe(false);
    expect(close).not.toHaveBeenCalled();
  });

  it('honors the reused rl answer even if opts.input/output are also set (rl wins)', async () => {
    const { rl, question } = fakeReadlineInterface('y');
    const result = await confirmAction(risky, {
      rl,
      input: new Readable({ read() {} }),
      output: sinkStream(),
    });
    expect(result).toBe(true);
    expect(question).toHaveBeenCalledTimes(1);
  });

  it('requireConfirmIfRisky forwards opts.rl through to confirmAction for a risky action', async () => {
    const { rl, question, close } = fakeReadlineInterface('y');
    const result = await requireConfirmIfRisky(risky, { rl });
    expect(result).toBe(true);
    expect(question).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });

  it('end-to-end with a REAL node:readline/promises Interface: no stdin collision, rl left open', async () => {
    // Only the first line is fed — the stream is deliberately left open (no
    // EOF) so any 'close' we observe can only come from confirmAction itself
    // calling rl.close(), never from readline's own end-of-stream auto-close.
    const input = new Readable({ read() {} });
    input.push('y\n');
    const output = sinkStream();
    const rl = createInterface({ input, output });
    let closedEventFired = false;
    rl.on('close', () => { closedEventFired = true; });

    const result = await confirmAction(risky, { rl });
    expect(result).toBe(true);
    // Proves: (a) no second Interface was opened on this same stdin to
    // answer the question (the real rl answered it), and (b) confirmAction
    // did not close the caller-owned rl or destroy its input stream.
    expect(closedEventFired).toBe(false);
    expect(input.destroyed).toBe(false);

    rl.close();
    input.push(null);
  });

  it('without opts.rl, falls back to opening (and closing) its own interface as before', async () => {
    const input = new Readable({ read() {} });
    input.push('y\n');
    input.push(null);
    const result = await confirmAction(risky, { input, output: sinkStream() });
    expect(result).toBe(true);
  });
});

// ─── classifyActionRisk — RISKY wins over SAFE substring collision ──

describe('classifyActionRisk — RISKY-before-SAFE ordering (fail-safe)', () => {
  it('classifies a name containing both "list" (safe) and "run" (risky) as risky', () => {
    const mixed: AgenticAction = { name: 'list_and_run', description: 'lists then runs' };
    expect(classifyActionRisk(mixed)).toBe('risky');
  });

  it('classifies a name containing both "status" (safe) and "reset" (risky) as risky', () => {
    const mixed: AgenticAction = { name: 'status_reset', description: 'reset via status alias' };
    expect(classifyActionRisk(mixed)).toBe('risky');
  });

  it('classifies a name containing both "read" (safe) and "delete" (risky) as risky', () => {
    const mixed: AgenticAction = { name: 'read_and_delete', description: 'reads then deletes' };
    expect(classifyActionRisk(mixed)).toBe('risky');
  });

  it('still classifies a purely safe action as safe (no regression)', () => {
    const safe: AgenticAction = { name: 'deckent_status', description: 'show sprint status' };
    expect(classifyActionRisk(safe)).toBe('safe');
  });

  it('requireConfirmIfRisky actually gates a SAFE-substring risky action instead of auto-approving', async () => {
    const mixed: AgenticAction = { name: 'list_and_run', description: 'lists then runs' };
    const declined = await requireConfirmIfRisky(mixed, {
      input: (() => {
        const r = new Readable({ read() {} });
        r.push('n\n');
        r.push(null);
        return r;
      })(),
      output: sinkStream(),
    });
    expect(declined).toBe(false);

    const approved = await requireConfirmIfRisky(mixed, {
      input: (() => {
        const r = new Readable({ read() {} });
        r.push('y\n');
        r.push(null);
        return r;
      })(),
      output: sinkStream(),
    });
    expect(approved).toBe(true);
  });
});

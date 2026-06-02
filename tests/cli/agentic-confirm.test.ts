import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable, Writable } from 'node:stream';

import {
  classifyActionRisk,
  confirmAction,
  requireConfirmIfRisky,
  type AgenticAction,
} from '../../src/cli/commands/agentic-confirm.js';

// ─── Helpers ────────────────────────────────────────────────────────

/** Build a Readable that emits a single line then ends. */
function inputStream(line: string): Readable {
  const r = new Readable({ read() {} });
  r.push(`${line}\n`);
  r.push(null);
  return r;
}

/** Sink Writable — discards all output. */
function sinkStream(): Writable {
  return new Writable({ write(_chunk, _enc, cb) { cb(); } });
}

const risky: AgenticAction = { name: 'deckent_kill', description: 'stop all workers' };
const risky2: AgenticAction = { name: 'deckent_start', description: 'launch sprint' };
const risky3: AgenticAction = { name: 'deckent_cleanup', description: 'archive tasks' };
const safe: AgenticAction = { name: 'deckent_status', description: 'show sprint status' };
const safe2: AgenticAction = { name: 'recall', description: 'search memory' };
const safeHistory: AgenticAction = { name: 'deckent_history', description: 'list past sprints' };

// ─── classifyActionRisk ──────────────────────────────────────────────

describe('classifyActionRisk', () => {
  it('classifies kill as risky', () => {
    expect(classifyActionRisk(risky)).toBe('risky');
  });

  it('classifies start as risky', () => {
    expect(classifyActionRisk(risky2)).toBe('risky');
  });

  it('classifies cleanup as risky', () => {
    expect(classifyActionRisk(risky3)).toBe('risky');
  });

  it('classifies status as safe', () => {
    expect(classifyActionRisk(safe)).toBe('safe');
  });

  it('classifies recall as safe', () => {
    expect(classifyActionRisk(safe2)).toBe('safe');
  });

  it('classifies history as safe', () => {
    expect(classifyActionRisk(safeHistory)).toBe('safe');
  });

  it('defaults unknown action to risky (fail-safe)', () => {
    const unknown: AgenticAction = { name: 'deckent_unknown_new_action', description: 'some new thing' };
    expect(classifyActionRisk(unknown)).toBe('risky');
  });
});

// ─── confirmAction ────────────────────────────────────────────────────

describe('confirmAction', () => {
  it('returns true when user types "y"', async () => {
    const result = await confirmAction(risky, {
      input: inputStream('y'),
      output: sinkStream(),
    });
    expect(result).toBe(true);
  });

  it('returns false when user types "n"', async () => {
    const result = await confirmAction(risky, {
      input: inputStream('n'),
      output: sinkStream(),
    });
    expect(result).toBe(false);
  });

  it('returns false when user presses Enter (default N)', async () => {
    const result = await confirmAction(risky, {
      input: inputStream(''),
      output: sinkStream(),
    });
    expect(result).toBe(false);
  });

  it('returns false when user types "Y" (uppercase y should be truthy)', async () => {
    const result = await confirmAction(risky, {
      input: inputStream('Y'),
      output: sinkStream(),
    });
    expect(result).toBe(true);
  });
});

// ─── requireConfirmIfRisky ───────────────────────────────────────────

describe('requireConfirmIfRisky', () => {
  it('auto-approves safe action without prompting', async () => {
    // No input stream needed — safe actions bypass the prompt entirely
    const result = await requireConfirmIfRisky(safe);
    expect(result).toBe(true);
  });

  it('auto-approves recall (safe) without prompting', async () => {
    const result = await requireConfirmIfRisky(safe2);
    expect(result).toBe(true);
  });

  it('requires confirm for risky action and returns true on approval', async () => {
    const result = await requireConfirmIfRisky(risky, {
      input: inputStream('y'),
      output: sinkStream(),
    });
    expect(result).toBe(true);
  });

  it('requires confirm for risky action and returns false on rejection', async () => {
    const result = await requireConfirmIfRisky(risky2, {
      input: inputStream('n'),
      output: sinkStream(),
    });
    expect(result).toBe(false);
  });

  it('cancels risky kill action when user declines', async () => {
    const result = await requireConfirmIfRisky(
      { name: 'deckent_kill', description: 'kill all workers', args: { target: 'all' } },
      { input: inputStream('n'), output: sinkStream() },
    );
    expect(result).toBe(false);
  });

  it('runs risky start action when user confirms', async () => {
    const result = await requireConfirmIfRisky(
      { name: 'deckent_start', description: 'launch sprint', args: { sprintId: 'sprint-219' } },
      { input: inputStream('y'), output: sinkStream() },
    );
    expect(result).toBe(true);
  });
});

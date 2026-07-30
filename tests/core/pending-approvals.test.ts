// tests/core/pending-approvals.test.ts
// W4 — the durable pending-approval reader: a pure, surface-agnostic reader of
// the durable hub files so `deckent status`, `deckent watch`, and the dashboard
// all show the SAME "N pending, run this command" from one source of truth.
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPendingApprovals } from '../../src/core/pending-approvals.js';

const dirs: string[] = [];
function sandbox(): string {
  const d = mkdtempSync(join(tmpdir(), 'pending-approvals-'));
  dirs.push(d);
  mkdirSync(join(d, '.deckent', 'nervous'), { recursive: true });
  return d;
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const nervousPath = (d: string) => join(d, '.deckent', 'nervous', 'nervous-pending.json');

describe('readPendingApprovals', () => {
  it('returns [] when no pending file exists (fail-safe)', () => {
    const d = sandbox();
    expect(readPendingApprovals(d)).toEqual([]);
    expect(existsSync(join(d, '.deckent', 'approvals'))).toBe(false);
  });

  it('reads parked nervous approvals and emits the exact accept/reject commands', () => {
    const d = sandbox();
    writeFileSync(nervousPath(d), JSON.stringify([
      { id: 'k9a2', title: 'Directives changed mid-sprint' },
      { id: 'm3z1', title: 'Cost over threshold' },
    ]));
    const pending = readPendingApprovals(d);
    expect(pending).toHaveLength(2);
    expect(pending[0]).toMatchObject({
      kind: 'nervous',
      id: 'k9a2',
      acceptCommand: 'deckent nervous accept k9a2',
      rejectCommand: 'deckent nervous reject k9a2',
    });
  });

  it('is fail-safe on malformed JSON (returns [])', () => {
    const d = sandbox();
    writeFileSync(nervousPath(d), '{ not json');
    expect(readPendingApprovals(d)).toEqual([]);
  });
});

// ─── W5 — autonomous parked triggers join the unified hub ──────────────────
const autonomousPath = (d: string) => {
  mkdirSync(join(d, '.deckent', 'autonomous'), { recursive: true });
  return join(d, '.deckent', 'autonomous', 'pending.json');
};

describe('readPendingApprovals — autonomous (W5 cross-surface unification)', () => {
  it('reads parked autonomous triggers and emits the exact approve/reject commands', () => {
    const d = sandbox();
    writeFileSync(autonomousPath(d), JSON.stringify([
      { triggerId: 't-42', action: 'autonomous.execute', requestedBy: 'system:backlog', enqueuedAt: '2026-06-15T00:00:00.000Z' },
    ]));
    const pending = readPendingApprovals(d);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      kind: 'autonomous',
      id: 't-42',
      acceptCommand: 'deckent autonomous approve t-42',
      rejectCommand: 'deckent autonomous reject t-42',
    });
    // The action is the human-readable title operators see in `deckent status`.
    expect(pending[0]!.title).toContain('autonomous.execute');
  });

  it('merges nervous + autonomous parked approvals across surfaces', () => {
    const d = sandbox();
    writeFileSync(nervousPath(d), JSON.stringify([{ id: 'n1', title: 'T' }]));
    writeFileSync(autonomousPath(d), JSON.stringify([
      { triggerId: 'a1', action: 'autonomous.execute', requestedBy: 'system', enqueuedAt: '2026-06-15T00:00:00.000Z' },
    ]));
    const kinds = readPendingApprovals(d).map((p) => p.kind).sort();
    expect(kinds).toEqual(['autonomous', 'nervous']);
  });

  it('is fail-safe on malformed autonomous JSON (nervous still surfaces)', () => {
    const d = sandbox();
    writeFileSync(nervousPath(d), JSON.stringify([{ id: 'n1', title: 'T' }]));
    writeFileSync(autonomousPath(d), '{ not json');
    expect(readPendingApprovals(d).map((p) => p.kind)).toEqual(['nervous']);
  });
});

describe('readPendingApprovals — paused run recovery', () => {
  it('projects canonical PAUSED authority into actionable resume/finalize commands', () => {
    const d = sandbox();
    const sprintId = 'sprint-906';
    writeFileSync(join(d, '.deckent', 'sprint-state.json'), JSON.stringify({
      sprintId,
      phase: 'EVALUATE',
      status: 'PAUSED',
    }));
    writeFileSync(join(d, '.deckent', 'pause-state.json'), JSON.stringify({
      sprintId,
      phase: 'EVALUATE',
      status: 'PAUSED',
      reason: 'provider auth',
    }));
    writeFileSync(join(d, '.deckent', `${sprintId}-checkpoint.json`), '{}');

    expect(readPendingApprovals(d)).toContainEqual({
      kind: 'recovery',
      id: `resume:${sprintId}`,
      title: sprintId,
      acceptCommand: `deckent recover ${sprintId} --resume`,
      rejectCommand: `deckent finalize --sprint ${sprintId} --force`,
    });
  });
});

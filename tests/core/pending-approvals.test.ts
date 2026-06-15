// tests/core/pending-approvals.test.ts
// W4 — the durable pending-approval reader: a pure, surface-agnostic reader of
// the durable hub files so `deckent status`, `deckent watch`, and the dashboard
// all show the SAME "N pending, run this command" from one source of truth.
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPendingApprovals } from '../../src/core/pending-approvals.js';

const dirs: string[] = [];
function sandbox(): string {
  const d = mkdtempSync(join(tmpdir(), 'pending-approvals-'));
  dirs.push(d);
  mkdirSync(join(d, '.deckent'), { recursive: true });
  return d;
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const nervousPath = (d: string) => join(d, '.deckent', 'nervous-pending.json');

describe('readPendingApprovals', () => {
  it('returns [] when no pending file exists (fail-safe)', () => {
    expect(readPendingApprovals(sandbox())).toEqual([]);
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

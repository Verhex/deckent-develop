// tests/cli/status-pending-approvals.test.ts
// W4 — `deckent status` surfaces parked approvals with the EXACT accept command,
// independent of sprint state, from the durable hub (one source of truth).
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPendingApprovalsSection } from '../../src/cli/commands/status.js';

const dirs: string[] = [];
function sandbox(): string {
  const d = mkdtempSync(join(tmpdir(), 'status-pending-'));
  dirs.push(d);
  mkdirSync(join(d, '.deckent', 'nervous'), { recursive: true });
  return d;
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('buildPendingApprovalsSection (W4 status surfacing)', () => {
  it('returns null when nothing is parked (no noise)', () => {
    expect(buildPendingApprovalsSection(sandbox(), 'en')).toBeNull();
  });

  it('renders the count header + the exact accept command per parked approval', () => {
    const d = sandbox();
    writeFileSync(join(d, '.deckent', 'nervous', 'nervous-pending.json'), JSON.stringify([
      { id: 'k9', title: 'Directives changed mid-sprint' },
    ]));
    const s = buildPendingApprovalsSection(d, 'en');
    expect(s).not.toBeNull();
    expect(s!).toContain('Pending approvals: 1');
    expect(s!).toContain('deckent nervous accept k9');
    expect(s!).toContain('Directives changed mid-sprint');
  });

  it('localizes the header (TR)', () => {
    const d = sandbox();
    writeFileSync(join(d, '.deckent', 'nervous', 'nervous-pending.json'), JSON.stringify([{ id: 'x1', title: 't' }]));
    expect(buildPendingApprovalsSection(d, 'tr')!).toContain('Bekleyen onaylar: 1');
  });
});

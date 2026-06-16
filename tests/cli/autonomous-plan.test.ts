import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handlePlan } from '../../src/cli/commands/autonomous.js';

let dir: string | undefined;
afterEach(() => { if (dir) { rmSync(dir, { recursive: true, force: true }); dir = undefined; } });

function root(): string {
  dir = mkdtempSync(join(tmpdir(), 'auto-plan-'));
  mkdirSync(join(dir, '.deckent', 'autonomous'), { recursive: true });
  return dir;
}

const TWO = JSON.stringify({ items: [
  { id: 'a', title: 'A', kind: 'task', scopeDir: 'src/api/', summary: 'do a', policy: 'auto', trigger: 'one-off' },
  { id: 'b', title: 'B', kind: 'capability', scopeDir: 'src/', summary: 'check b', policy: 'approval-required', trigger: { recurring: '* * * * *' }, capabilityTarget: { capability: 'db.query' } },
] });

describe('handlePlan', () => {
  it('writes the planned items to the backlog as pending+planned', async () => {
    const r = root();
    const lines: string[] = [];
    await handlePlan({ goal: 'finish things', root: r, complete: async () => TWO, print: (l) => lines.push(l) });
    const bl = JSON.parse(readFileSync(join(r, '.deckent', 'autonomous', 'backlog.json'), 'utf-8'));
    expect(bl.entries.map((e: any) => e.id)).toEqual(['a', 'b']);
    expect(bl.entries.every((e: any) => e.planned && e.status === 'pending')).toBe(true);
    expect(lines.join('\n')).toContain('a');
  });
  it('dry-run prints but does NOT write', async () => {
    const r = root();
    await handlePlan({ goal: 'g', root: r, dryRun: true, complete: async () => TWO, print: () => {} });
    const p = join(r, '.deckent', 'autonomous', 'backlog.json');
    expect(() => readFileSync(p, 'utf-8')).toThrow();
  });
});

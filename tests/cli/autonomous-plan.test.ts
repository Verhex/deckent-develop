import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handlePlan } from '../../src/cli/commands/autonomous.js';
import { SqliteMissionStore } from '../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';
import { readMissionAudit } from '../../src/orchestra/autonomous/mission-store/mission-audit-bridge.js';

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
    expect(existsSync(join(r, '.deckent', 'autonomous', 'autonomous.db'))).toBe(false);
    expect(lines.join('\n')).toContain('a');
  });
  it('dry-run prints but does NOT write', async () => {
    const r = root();
    await handlePlan({ goal: 'g', root: r, dryRun: true, complete: async () => TWO, print: () => {} });
    const p = join(r, '.deckent', 'autonomous', 'backlog.json');
    expect(() => readFileSync(p, 'utf-8')).toThrow();
  });

  it('writes a v2 plan atomically to MissionStore without creating a backlog', async () => {
    const r = root();
    const lines: string[] = [];
    await handlePlan({
      goal: 'finish things', root: r, engine: 'v2', complete: async () => TWO,
      print: (line) => lines.push(line),
    });

    expect(existsSync(join(r, '.deckent', 'autonomous', 'backlog.json'))).toBe(false);
    const store = new SqliteMissionStore(r);
    store.migrate();
    const missions = store.listMissions();
    expect(missions).toHaveLength(1);
    expect(missions[0]!.id).toMatch(/^plan-[a-f0-9]{24}$/);
    const items = store.listItems(missions[0]!.id);
    expect(items).toHaveLength(2);
    expect(items.every((item) => item.id.startsWith(`${missions[0]!.id}-`))).toBe(true);
    expect(items.map((item) => item.policy)).toEqual(['auto', 'approval-required']);
    expect(items[0]!.spec).toMatchObject({
      title: 'A', summary: 'do a', planned: true, plannerItemId: 'a', scopeDir: 'src/api/',
    });
    expect(items[1]!.spec).toMatchObject({
      capabilityTarget: { capability: 'db.query' }, plannerItemId: 'b',
    });
    expect(items[1]!.trigger).toEqual({ type: 'recurring', cron: '* * * * *' });
    store.close();
    expect(lines.join('\n')).toContain('MissionStore mission');
    expect(readMissionAudit(r)).toHaveLength(1);
  });

  it('replays an exact v2 plan without duplicate missions, items, or create audit events', async () => {
    const r = root();
    const lines: string[] = [];
    const input = {
      goal: 'replay safely', root: r, engine: 'v2' as const, complete: async () => TWO,
      print: (line: string) => lines.push(line),
    };
    await handlePlan(input);
    await handlePlan(input);

    const store = new SqliteMissionStore(r);
    store.migrate();
    const missions = store.listMissions();
    expect(missions).toHaveLength(1);
    expect(store.listItems(missions[0]!.id)).toHaveLength(2);
    store.close();
    expect(readMissionAudit(r)).toHaveLength(1);
    expect(lines.join('\n')).toContain('no duplicate was created');
  });

  it('v2 dry-run creates neither MissionStore nor backlog state', async () => {
    const r = root();
    await handlePlan({
      goal: 'inspect only', root: r, engine: 'v2', dryRun: true,
      complete: async () => TWO, print: () => {},
    });
    expect(existsSync(join(r, '.deckent', 'autonomous', 'autonomous.db'))).toBe(false);
    expect(existsSync(join(r, '.deckent', 'autonomous', 'backlog.json'))).toBe(false);
  });

  it('persists a changed v2 planner batch as a distinct mission', async () => {
    const r = root();
    await handlePlan({ goal: 'evolve', root: r, engine: 'v2', complete: async () => TWO, print: () => {} });
    const changed = JSON.stringify({
      items: [
        { id: 'a', title: 'A2', kind: 'task', scopeDir: 'src/api/', summary: 'do a differently', policy: 'auto', trigger: 'one-off' },
      ],
    });
    await handlePlan({ goal: 'evolve', root: r, engine: 'v2', complete: async () => changed, print: () => {} });

    const store = new SqliteMissionStore(r);
    store.migrate();
    const missions = store.listMissions();
    expect(missions).toHaveLength(2);
    expect(new Set(missions.map((mission) => mission.id)).size).toBe(2);
    expect(missions.map((mission) => store.listItems(mission.id).length).sort()).toEqual([1, 2]);
    store.close();
    expect(readMissionAudit(r)).toHaveLength(2);
  });
});

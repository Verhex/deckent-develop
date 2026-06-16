import { describe, it, expect } from 'vitest';
import { parsePlannedItems, planGoal } from '../../../src/orchestra/autonomous/goal-planner.js';

const TWO = JSON.stringify({ items: [
  { id: 'roles-api', title: 'Roles API', kind: 'task', scopeDir: 'src/api/', summary: 'add roles crud', policy: 'auto', trigger: 'one-off' },
  { id: 'tbl-check', title: 'Table check', kind: 'capability', scopeDir: 'src/', summary: 'check tables', policy: 'auto', trigger: { recurring: '*/15 * * * *' }, fanOut: { over: 'tables', concurrency: 20 }, capabilityTarget: { capability: 'db.query' } },
] });

describe('parsePlannedItems', () => {
  it('parses + validates items, dropping invalid ones', () => {
    const raw = JSON.stringify({ items: [
      { id: 'ok', title: 'T', kind: 'task', scopeDir: 'src/', summary: 's', policy: 'auto', trigger: 'one-off' },
      { id: 'bad', title: 'T', kind: 'NOPE', scopeDir: 'src/', summary: 's', policy: 'auto', trigger: 'one-off' },
    ] });
    const items = parsePlannedItems(raw);
    expect(items.map((i) => i.id)).toEqual(['ok']);
  });
  it('strips code fences and dedups by id', () => {
    const raw = '```json\n' + JSON.stringify({ items: [
      { id: 'x', title: 'T', kind: 'task', scopeDir: 'src/', summary: 's', policy: 'auto', trigger: 'one-off' },
      { id: 'x', title: 'T2', kind: 'task', scopeDir: 'src/', summary: 's2', policy: 'auto', trigger: 'one-off' },
    ] }) + '\n```';
    expect(parsePlannedItems(raw).map((i) => i.title)).toEqual(['T']);
  });
});

describe('planGoal', () => {
  it('calls the LLM with the goal and returns validated items, capped to maxItems', async () => {
    let seenPrompt = '';
    const complete = async (p: string) => { seenPrompt = p; return TWO; };
    const items = await planGoal({ goal: 'finish roles + table checks', maxItems: 1, complete });
    expect(seenPrompt).toContain('finish roles + table checks');
    expect(items).toHaveLength(1); // capped
    expect(items[0]!.id).toBe('roles-api');
  });
  it('includes artifact seeds in the prompt when provided', async () => {
    let seenPrompt = '';
    const complete = async (p: string) => { seenPrompt = p; return TWO; };
    await planGoal({ goal: 'g', seeds: ['seed-one', 'seed-two'], complete });
    expect(seenPrompt).toContain('seed-one');
  });
  it('includes the default policy in the prompt when provided', async () => {
    let seen = '';
    const complete = async (p: string) => { seen = p; return JSON.stringify({ items: [] }); };
    await planGoal({ goal: 'g', defaultPolicy: 'approval-required', complete });
    expect(seen).toContain('approval-required');
  });
});

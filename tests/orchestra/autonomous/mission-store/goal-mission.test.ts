import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteMissionStore } from '../../../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';
import {
  createGoalMission,
  advanceGoalMission,
  buildGoalDeps,
} from '../../../../src/orchestra/autonomous/mission-store/goal-mission.js';
import type { NewWorkItem, WorkItem } from '../../../../src/orchestra/autonomous/mission-store/mission-types.js';

const dirs: string[] = [];
function newStore() {
  const d = mkdtempSync(join(tmpdir(), 'goal-'));
  dirs.push(d);
  const s = new SqliteMissionStore(d);
  s.migrate();
  return s;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('createGoalMission', () => {
  it('creates a kind=goal mission (renderAs goal) with goal + acceptance persisted', () => {
    const store = newStore();
    const mission = createGoalMission(store, {
      id: 'goal-1',
      title: 'Ship the feature',
      goal: 'All endpoints return 200',
      acceptance: 'integration tests green',
      tenant: 'acme',
      deliverTo: 'user@example.com',
    });

    expect(mission.id).toBe('goal-1');
    expect(mission.kind).toBe('goal');
    expect(mission.renderAs).toBe('goal');
    expect(mission.status).toBe('pending');
    expect(mission.tenant).toBe('acme');
    expect(mission.deliverTo).toBe('user@example.com');

    const stored = store.getMission('goal-1')!;
    expect(stored.spec).toEqual({ goal: 'All endpoints return 200', acceptance: 'integration tests green' });

    store.close();
  });
});

describe('advanceGoalMission', () => {
  it('authors the next work-items when there are no open items', async () => {
    const store = newStore();
    createGoalMission(store, { id: 'g-author', title: 'Author round', goal: 'do work' });

    const author = vi.fn(async (_goal: string, _prior: WorkItem[]): Promise<NewWorkItem[]> => [
      { id: 'g-author-step-1', missionId: 'g-author', kind: 'task', spec: { description: 'step 1' } },
    ]);
    const accept = vi.fn(async () => false);

    const outcome = await advanceGoalMission(store, 'g-author', { author, accept });

    expect(outcome).toBe('authored');
    expect(author).toHaveBeenCalledTimes(1);
    expect(author).toHaveBeenCalledWith('do work', []);
    expect(accept).not.toHaveBeenCalled();

    const items = store.listItems('g-author');
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('g-author-step-1');
    expect(items[0].status).toBe('pending');
    expect(items[0].missionId).toBe('g-author');

    store.close();
  });

  it('stamps missionId on enqueue even when author returns a foreign missionId', async () => {
    const store = newStore();
    createGoalMission(store, { id: 'g-stamp', title: 'Stamp', goal: 'g' });

    const author = vi.fn(async (): Promise<NewWorkItem[]> => [
      { id: 'g-stamp-1', missionId: 'WRONG', kind: 'task' },
    ]);
    const accept = vi.fn(async () => false);

    const outcome = await advanceGoalMission(store, 'g-stamp', { author, accept });

    expect(outcome).toBe('authored');
    const items = store.listItems('g-stamp');
    expect(items).toHaveLength(1);
    expect(items[0].missionId).toBe('g-stamp');

    store.close();
  });

  it('completes the mission (accepted) when author is empty and accept returns true', async () => {
    const store = newStore();
    createGoalMission(store, { id: 'g-accept', title: 'Accept', goal: 'reach it' });

    const author = vi.fn(async (): Promise<NewWorkItem[]> => []);
    const accept = vi.fn(async () => true);

    const outcome = await advanceGoalMission(store, 'g-accept', { author, accept });

    expect(outcome).toBe('accepted');
    expect(author).toHaveBeenCalledTimes(1);
    expect(accept).toHaveBeenCalledTimes(1);
    expect(accept).toHaveBeenCalledWith('reach it', []);

    const mission = store.getMission('g-accept')!;
    expect(mission.status).toBe('completed');
    expect(mission.completedAt).not.toBeNull();
    expect(mission.lastResult).toEqual({ ok: true });

    store.close();
  });

  it('fails the mission (exhausted) when author is empty and accept returns false', async () => {
    const store = newStore();
    createGoalMission(store, { id: 'g-exhaust', title: 'Exhaust', goal: 'unreachable' });

    const author = vi.fn(async (): Promise<NewWorkItem[]> => []);
    const accept = vi.fn(async () => false);

    const outcome = await advanceGoalMission(store, 'g-exhaust', { author, accept });

    expect(outcome).toBe('exhausted');
    const mission = store.getMission('g-exhaust')!;
    expect(mission.status).toBe('failed');
    expect(mission.lastResult).toEqual({ ok: false, reason: 'goal not reached, no further work' });

    store.close();
  });

  it('is a no-op (waiting) while an open work-item is still pending/running', async () => {
    const store = newStore();
    createGoalMission(store, { id: 'g-wait', title: 'Wait', goal: 'g' });
    // Seed an open (pending) item — the scheduler has not settled it yet.
    store.enqueueItem({ id: 'g-wait-open', missionId: 'g-wait', kind: 'task' });

    const author = vi.fn(async (): Promise<NewWorkItem[]> => []);
    const accept = vi.fn(async () => true);

    const outcome = await advanceGoalMission(store, 'g-wait', { author, accept });

    expect(outcome).toBe('waiting');
    expect(author).not.toHaveBeenCalled();
    expect(accept).not.toHaveBeenCalled();

    const mission = store.getMission('g-wait')!;
    expect(mission.status).toBe('pending'); // unchanged

    store.close();
  });

  it('trips the maxRounds guard → exhausted/failed without authoring', async () => {
    const store = newStore();
    createGoalMission(store, { id: 'g-max', title: 'Max', goal: 'g' });
    // Two already-settled items; with maxRounds=2 the cumulative cap is reached.
    store.enqueueItem({ id: 'g-max-1', missionId: 'g-max', kind: 'task' });
    store.enqueueItem({ id: 'g-max-2', missionId: 'g-max', kind: 'task' });
    store.updateItemStatus('g-max-1', 'done', { ok: true });
    store.updateItemStatus('g-max-2', 'done', { ok: true });

    const author = vi.fn(async (): Promise<NewWorkItem[]> => [
      { id: 'g-max-3', missionId: 'g-max', kind: 'task' },
    ]);
    const accept = vi.fn(async () => false);

    const outcome = await advanceGoalMission(store, 'g-max', { author, accept, maxRounds: 2 });

    expect(outcome).toBe('exhausted');
    expect(author).not.toHaveBeenCalled();
    const mission = store.getMission('g-max')!;
    expect(mission.status).toBe('failed');
    expect(mission.lastResult).toEqual({ ok: false, reason: 'goal not reached, max rounds exhausted' });

    store.close();
  });

  it('throws when the mission does not exist', async () => {
    const store = newStore();
    const author = vi.fn(async (): Promise<NewWorkItem[]> => []);
    const accept = vi.fn(async () => false);

    await expect(advanceGoalMission(store, 'missing', { author, accept })).rejects.toThrow(/goal mission not found/);

    store.close();
  });
});

describe('buildGoalDeps', () => {
  it('adapts planner→author: planner is invoked and its items are enqueued', async () => {
    const store = newStore();
    createGoalMission(store, { id: 'g-bd', title: 'BuildDeps', goal: 'reach it' });

    const planner = vi.fn(async (_goal: string, _prior: WorkItem[]): Promise<NewWorkItem[]> => [
      { id: 'g-bd-1', missionId: 'g-bd', kind: 'task', spec: { description: 'planned step' } },
    ]);
    const accepter = vi.fn(async () => false);

    const goalDeps = buildGoalDeps({ planner, accepter });
    const outcome = await advanceGoalMission(store, 'g-bd', goalDeps);

    expect(outcome).toBe('authored');
    expect(planner).toHaveBeenCalledTimes(1);
    expect(planner).toHaveBeenCalledWith('reach it', []);
    expect(accepter).not.toHaveBeenCalled();

    const items = store.listItems('g-bd');
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('g-bd-1');
    expect(items[0].status).toBe('pending');
    expect(items[0].missionId).toBe('g-bd');

    store.close();
  });

  it('adapts accepter→accept: when the planner is dry, the accepter decides completion', async () => {
    const store = newStore();
    createGoalMission(store, { id: 'g-bd-acc', title: 'Accept', goal: 'reach' });

    const planner = vi.fn(async (): Promise<NewWorkItem[]> => []);
    const accepter = vi.fn(async () => true);

    const outcome = await advanceGoalMission(store, 'g-bd-acc', buildGoalDeps({ planner, accepter }));

    expect(outcome).toBe('accepted');
    expect(planner).toHaveBeenCalledTimes(1);
    expect(accepter).toHaveBeenCalledTimes(1);
    expect(accepter).toHaveBeenCalledWith('reach', []);
    expect(store.getMission('g-bd-acc')!.status).toBe('completed');

    store.close();
  });

  it('forwards maxRounds to the loop guard (planner not consulted past the cap)', async () => {
    const store = newStore();
    createGoalMission(store, { id: 'g-bd-max', title: 'Max', goal: 'g' });
    store.enqueueItem({ id: 'g-bd-max-1', missionId: 'g-bd-max', kind: 'task' });
    store.updateItemStatus('g-bd-max-1', 'done', { ok: true });

    const planner = vi.fn(async (): Promise<NewWorkItem[]> => [
      { id: 'never', missionId: 'g-bd-max', kind: 'task' },
    ]);
    const accepter = vi.fn(async () => false);

    const outcome = await advanceGoalMission(
      store,
      'g-bd-max',
      buildGoalDeps({ planner, accepter, maxRounds: 1 }),
    );

    expect(outcome).toBe('exhausted');
    expect(planner).not.toHaveBeenCalled();
    expect(store.getMission('g-bd-max')!.status).toBe('failed');

    store.close();
  });
});

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteMissionStore } from '../../../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';
import { migrateBacklogJson } from '../../../../src/orchestra/autonomous/mission-store/mission-migrate.js';
import { PRODUCTION_V2_ADMISSION } from '../../../../src/orchestra/autonomous/mission-store/mission-kind-admission.js';

const dirs: string[] = [];
function root() { const d = mkdtempSync(join(tmpdir(), 'mig-')); dirs.push(d); return d; }
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('migrateBacklogJson', () => {
  it('imports legacy backlog entries as a legacy mission\'s work-items (idempotent)', () => {
    const r = root();
    mkdirSync(join(r, '.deckent', 'autonomous'), { recursive: true });
    writeFileSync(join(r, '.deckent', 'autonomous', 'backlog.json'), JSON.stringify({
      _version: '1.0',
      entries: [
        { id: 'e1', title: 'A', kind: 'task', spec: { description: 'do A' }, policy: 'auto', trigger: { type: 'one-off' }, status: 'pending' },
        { id: 'e2', title: 'B', kind: 'sprint', spec: { directivesRef: 'D' }, policy: 'auto', trigger: { type: 'one-off' }, status: 'done', lastResult: { ok: true, reason: 'historical success' } },
      ],
    }), 'utf-8');
    const s = new SqliteMissionStore(r); s.migrate();
    s.createMissionWithItems(
      { id: 'unrelated', kind: 'list', title: 'Existing v2 mission' },
      [],
    );
    const n = migrateBacklogJson(r, s, { admission: PRODUCTION_V2_ADMISSION });
    expect(n).toBe(2);
    const legacy = s.getMission('legacy')!;
    expect(legacy.id).toBe('legacy');
    expect(s.getMission('unrelated')).not.toBeNull();
    const items = s.listItems('legacy');
    expect(items.map(i => i.id).sort()).toEqual(['e1', 'e2']);
    expect(items.find(i => i.id === 'e2')!.kind).toBe('sprint');
    expect(items.find(i => i.id === 'e2')!.status).toBe('done');
    expect(items.find(i => i.id === 'e2')!.lastResult).toEqual({ ok: true, reason: 'historical success' });
    expect(legacy.spec?.['legacyImport']).toMatchObject({ schemaVersion: 1, source: 'backlog.json' });
    expect(migrateBacklogJson(r, s, { admission: PRODUCTION_V2_ADMISSION })).toBe(0); // idempotent — reserved legacy mission exists
    s.close();
  });

  it('fails loud when a fingerprinted source backlog changes after import', () => {
    const r = root();
    const path = join(r, '.deckent', 'autonomous', 'backlog.json');
    mkdirSync(join(r, '.deckent', 'autonomous'), { recursive: true });
    const initial = {
      _version: '1.0',
      entries: [
        { id: 'one', title: 'One', kind: 'task', spec: { description: 'one' }, policy: 'auto', trigger: { type: 'one-off' }, status: 'pending', lastResult: null },
      ],
    };
    writeFileSync(path, JSON.stringify(initial), 'utf-8');
    const s = new SqliteMissionStore(r); s.migrate();
    expect(migrateBacklogJson(r, s, { admission: PRODUCTION_V2_ADMISSION })).toBe(1);

    const changed = { ...initial, entries: [
      ...initial.entries,
      { id: 'two', title: 'Two', kind: 'task', spec: { description: 'two' }, policy: 'auto', trigger: { type: 'one-off' }, status: 'pending', lastResult: null },
    ] };
    writeFileSync(path, JSON.stringify(changed), 'utf-8');
    expect(() => migrateBacklogJson(r, s, { admission: PRODUCTION_V2_ADMISSION }))
      .toThrow('MISSION_MIGRATION_CONFLICT');
    expect(s.listItems('legacy').map((item) => item.id)).toEqual(['one']);
    s.close();
  });

  it('reconciles a matching pre-provenance mission and restores terminal evidence', () => {
    const r = root();
    mkdirSync(join(r, '.deckent', 'autonomous'), { recursive: true });
    writeFileSync(join(r, '.deckent', 'autonomous', 'backlog.json'), JSON.stringify({
      _version: '1.0',
      entries: [
        { id: 'historical', title: 'Historical', kind: 'sprint', spec: { directivesRef: 'D' }, policy: 'auto', trigger: { type: 'one-off' }, status: 'done', lastResult: { ok: true, reason: 'restored' } },
      ],
    }), 'utf-8');
    const s = new SqliteMissionStore(r); s.migrate();
    s.createMissionWithItems(
      { id: 'legacy', kind: 'list', title: 'Imported backlog', renderAs: 'checklist' },
      [{
        id: 'historical', missionId: 'legacy', kind: 'sprint', spec: { directivesRef: 'D' },
        policy: 'auto', trigger: { type: 'one-off' }, initialStatus: 'done',
      }],
    );

    expect(migrateBacklogJson(r, s, { admission: PRODUCTION_V2_ADMISSION })).toBe(0);
    expect(s.listItems('legacy')[0]!.lastResult).toEqual({ ok: true, reason: 'restored' });
    s.close();
  });

  it('rejects a pending unwired legacy kind atomically and preserves the source backlog', () => {
    const r = root();
    const path = join(r, '.deckent', 'autonomous', 'backlog.json');
    mkdirSync(join(r, '.deckent', 'autonomous'), { recursive: true });
    const source = JSON.stringify({
      _version: '1.0',
      entries: [
        { id: 'valid', title: 'Valid', kind: 'task', spec: { description: 'valid task' }, policy: 'auto', trigger: { type: 'one-off' }, status: 'pending' },
        { id: 'unwired', title: 'Unwired', kind: 'sprint', spec: { directivesRef: 'D' }, policy: 'auto', trigger: { type: 'one-off' }, status: 'pending' },
      ],
    });
    writeFileSync(path, source, 'utf-8');
    const s = new SqliteMissionStore(r); s.migrate();

    expect(() => migrateBacklogJson(r, s, { admission: PRODUCTION_V2_ADMISSION }))
      .toThrow('SPRINT_SNAPSHOT_REQUIRED');
    expect(s.getMission('legacy')).toBeNull();
    expect(readFileSync(path, 'utf-8')).toBe(source);
    s.close();
  });

  it('parks an imported running task with durable recovery evidence', () => {
    const r = root();
    mkdirSync(join(r, '.deckent', 'autonomous'), { recursive: true });
    writeFileSync(join(r, '.deckent', 'autonomous', 'backlog.json'), JSON.stringify({
      _version: '1.0',
      entries: [
        { id: 'running', title: 'Running', kind: 'task', spec: { description: 'uncertain task' }, policy: 'auto', trigger: { type: 'one-off' }, status: 'running' },
      ],
    }), 'utf-8');
    const s = new SqliteMissionStore(r); s.migrate();

    expect(migrateBacklogJson(r, s, { admission: PRODUCTION_V2_ADMISSION })).toBe(1);
    const item = s.listItems('legacy')[0]!;
    expect(item).toMatchObject({ status: 'parked', claimedAt: null, claimedBy: null });
    expect(item.lastResult?.reason).toContain('RECOVERY_RECONCILIATION_REQUIRED');
    expect(s.queryDue()).toEqual([]);
    expect(s.claimItem(item.id, 'scheduler')).toBe(false);
    s.close();
  });

  it.each([
    { name: 'malformed JSON', source: '{', reason: 'backlog JSON is unreadable' },
    { name: 'missing envelope', source: '{}', reason: 'must contain string _version and entries array' },
    { name: 'null entries', source: JSON.stringify({ _version: '1.0', entries: null }), reason: 'must contain string _version and entries array' },
    { name: 'object entries', source: JSON.stringify({ _version: '1.0', entries: {} }), reason: 'must contain string _version and entries array' },
    {
      name: 'missing identity',
      source: JSON.stringify({ _version: '1.0', entries: [{ kind: 'task', status: 'pending' }] }),
      reason: 'invalid identity, kind, or status',
    },
    {
      name: 'unknown status',
      source: JSON.stringify({ _version: '1.0', entries: [{ id: 'bad-status', kind: 'task', status: 'mystery' }] }),
      reason: 'invalid identity, kind, or status',
    },
  ])('fails loud for $name without mutating source or store', ({ source, reason }) => {
    const r = root();
    const path = join(r, '.deckent', 'autonomous', 'backlog.json');
    mkdirSync(join(r, '.deckent', 'autonomous'), { recursive: true });
    writeFileSync(path, source, 'utf-8');
    const s = new SqliteMissionStore(r); s.migrate();

    expect(() => migrateBacklogJson(r, s, { admission: PRODUCTION_V2_ADMISSION })).toThrow(reason);
    expect(s.getMission('legacy')).toBeNull();
    expect(readFileSync(path, 'utf-8')).toBe(source);
    s.close();
  });

  it('refuses presence-only replay of import/recovery creation state', () => {
    const r = root();
    const s = new SqliteMissionStore(r); s.migrate();
    const mission = { id: 'imported', kind: 'list' as const, title: 'Imported' };
    const items = [{
      id: 'imported-0', missionId: 'imported', kind: 'task' as const,
      spec: { description: 'historical' }, initialStatus: 'parked' as const,
      initialResult: { ok: false, reason: 'hold' },
    }];
    s.createMissionWithItems(mission, items);

    expect(() => s.createMissionWithItems(mission, items)).toThrow('external replay provenance');
    expect(s.listItems('imported')[0]!.lastResult).toEqual({ ok: false, reason: 'hold' });
    s.close();
  });

  it('rolls back the reserved legacy mission when an item identity conflicts', () => {
    const r = root();
    mkdirSync(join(r, '.deckent', 'autonomous'), { recursive: true });
    writeFileSync(join(r, '.deckent', 'autonomous', 'backlog.json'), JSON.stringify({
      _version: '1.0',
      entries: [
        { id: 'e1', title: 'Conflict', kind: 'task', spec: { description: 'legacy' }, policy: 'auto', trigger: { type: 'one-off' }, status: 'pending' },
      ],
    }), 'utf-8');
    const s = new SqliteMissionStore(r); s.migrate();
    s.createMissionWithItems(
      { id: 'owner', kind: 'list', title: 'Identity owner' },
      [{ id: 'e1', missionId: 'owner', kind: 'task' }],
    );

    expect(() => migrateBacklogJson(r, s)).toThrow('MISSION_BATCH_CONFLICT');
    expect(s.getMission('legacy')).toBeNull();
    expect(s.listItems('owner').map((item) => item.id)).toEqual(['e1']);
    s.close();
  });
});

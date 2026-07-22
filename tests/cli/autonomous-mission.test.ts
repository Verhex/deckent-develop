// tests/cli/autonomous-mission.test.ts
//
// Hermetic tests for `deckent autonomous-mission` CLI (Task 295-008).
// Tests use real SqliteMissionStore (tmpdir) + exported handler functions.
// No spawnSync, no real project-root reads, no network I/O.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteMissionStore } from '../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';
import {
  handleCreateList,
  handleCreateGoal,
  handleListMissions,
  parseItemFlags,
  registerAutonomousMission,
  type ParsedItem,
} from '../../src/cli/commands/autonomous-mission.js';
import { Command } from 'commander';

// ─── Helpers ──────────────────────────────────────────────────────────

const dirs: string[] = [];

function mkRoot(): string {
  const d = mkdtempSync(join(tmpdir(), 'autonomous-mission-cli-'));
  dirs.push(d);
  return d;
}

function newStore(root: string): SqliteMissionStore {
  const s = new SqliteMissionStore(root);
  s.migrate();
  return s;
}

function captureOutput(fn: () => void): string {
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    chunks.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return chunks.join('');
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

// ─── Tests ────────────────────────────────────────────────────────────

describe('handleCreateList', () => {
  it('creates a list-mission + work-items in the real store', () => {
    const root = mkRoot();
    const items: ParsedItem[] = [
      { kind: 'task', spec: { description: 'first' } },
      { kind: 'task', spec: { description: 'second' } },
      { kind: 'task', spec: { description: 'third' } },
    ];

    const out = captureOutput(() =>
      handleCreateList({ root, lang: 'en', title: 'My List', items, id: 'list-cli-001' }),
    );

    // getMessage resolves the key — no ham-key in output, readable string present
    expect(out).not.toContain('autonomous_mission.');
    expect(out).toContain('Mission created: list-cli-001');

    // verify in store
    const store = newStore(root);
    try {
      const mission = store.getMission('list-cli-001');
      expect(mission).not.toBeNull();
      expect(mission!.kind).toBe('list');
      expect(mission!.renderAs).toBe('checklist');
      expect(mission!.title).toBe('My List');

      const workItems = store.listItems('list-cli-001');
      expect(workItems).toHaveLength(3);
      expect(workItems.every((wi) => wi.status === 'pending')).toBe(true);
      expect(workItems.map((wi) => wi.kind)).toEqual(['task', 'task', 'task']);
    } finally {
      store.close();
    }
  });

  it('passes tenant and deliverTo through to the mission', () => {
    const root = mkRoot();
    handleCreateList({
      root,
      lang: 'en',
      title: 'Tenant test',
      items: [{ kind: 'task', spec: { description: 'tenant task' } }],
      id: 'list-tenant-001',
      tenant: 'acme',
      deliverTo: 'ops@example.com',
    });

    const store = newStore(root);
    try {
      const mission = store.getMission('list-tenant-001');
      expect(mission!.tenant).toBe('acme');
      expect(mission!.deliverTo).toBe('ops@example.com');
    } finally {
      store.close();
    }
  });

  it('uses getMessage key for output (i18n-first scaffold)', () => {
    const root = mkRoot();
    // getMessage falls back to the key when not registered — verify the call pattern
    // by checking output contains the mission id (injected into the message)
    const out = captureOutput(() =>
      handleCreateList({
        root,
        lang: 'tr',
        title: 'TR list',
        items: [{ kind: 'task', spec: { description: 'TR task' } }],
        id: 'list-tr-001',
      }),
    );
    // getMessage resolves the key — no ham-key in output, readable Turkish string present
    expect(out).not.toContain('autonomous_mission.');
    expect(out).toContain('Misyon oluşturuldu: list-tr-001');
  });

  it.each([
    {
      name: 'unwired capability',
      items: [
        { kind: 'task', spec: { description: 'valid sibling' } },
        { kind: 'capability', spec: { capabilityTarget: { capability: 'db.query' } } },
      ] as ParsedItem[],
      reason: 'CAPABILITY_BROKER_UNWIRED',
    },
    {
      name: 'empty task description',
      items: [{ kind: 'task' }] as ParsedItem[],
      reason: 'TASK_DESCRIPTION_REQUIRED',
    },
    {
      name: 'unknown kind cast',
      items: [{ kind: 'deploy' as never, spec: { description: 'invalid' } }] as ParsedItem[],
      reason: 'UNKNOWN_KIND',
    },
  ])('rejects $name before mission persistence with a localized reason', ({ items, reason }) => {
    const root = mkRoot();
    expect(() => handleCreateList({
      root,
      lang: 'en',
      title: 'Rejected list',
      items,
      id: `rejected-${reason.toLowerCase()}`,
    })).toThrow(reason);

    const store = newStore(root);
    try {
      expect(store.listMissions()).toEqual([]);
    } finally {
      store.close();
    }
  });
});

describe('handleCreateGoal', () => {
  it('creates a goal-mission in the real store', () => {
    const root = mkRoot();
    const out = captureOutput(() =>
      handleCreateGoal({
        root,
        lang: 'en',
        goal: 'Achieve full test coverage',
        acceptance: 'coverage >= 90%',
        id: 'goal-cli-001',
      }),
    );

    // getMessage resolves the key — no ham-key, readable English string present
    expect(out).not.toContain('autonomous_mission.');
    expect(out).toContain('Goal mission created: goal-cli-001');

    const store = newStore(root);
    try {
      const mission = store.getMission('goal-cli-001');
      expect(mission).not.toBeNull();
      expect(mission!.kind).toBe('goal');
      expect(mission!.renderAs).toBe('goal');
      expect(mission!.spec?.['goal']).toBe('Achieve full test coverage');
      expect(mission!.spec?.['acceptanceContract']).toMatchObject({
        schemaVersion: 1,
        authoredBy: { surface: 'cli', actorId: null },
        criteria: [{ text: 'coverage >= 90%', critical: true }],
      });
    } finally {
      store.close();
    }
  });

  it('uses goal as title when --title is omitted', () => {
    const root = mkRoot();
    handleCreateGoal({ root, lang: 'en', goal: 'Fix all bugs', id: 'goal-notitle-001' });

    const store = newStore(root);
    try {
      const mission = store.getMission('goal-notitle-001');
      expect(mission!.title).toBe('Fix all bugs');
    } finally {
      store.close();
    }
  });

  it('uses --title when provided', () => {
    const root = mkRoot();
    handleCreateGoal({
      root,
      lang: 'en',
      goal: 'Refactor module',
      title: 'Refactor Sprint',
      id: 'goal-titled-001',
    });

    const store = newStore(root);
    try {
      const mission = store.getMission('goal-titled-001');
      expect(mission!.title).toBe('Refactor Sprint');
    } finally {
      store.close();
    }
  });
});

describe('handleListMissions', () => {
  it('prints empty message when no db exists', () => {
    const root = mkRoot();
    const out = captureOutput(() => handleListMissions({ root, lang: 'en' }));
    // should not throw; should print resolved i18n string (not ham-key)
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toContain('autonomous_mission.');
    expect(out).toContain('No autonomous missions found.');
  });

  it('lists existing missions as a table', () => {
    const root = mkRoot();

    // Pre-populate store
    handleCreateList({
      root,
      lang: 'en',
      title: 'Alpha list',
      items: [
        { kind: 'task', spec: { description: 'alpha one' } },
        { kind: 'task', spec: { description: 'alpha two' } },
      ],
      id: 'list-alpha',
    });
    handleCreateGoal({ root, lang: 'en', goal: 'Beta goal', id: 'goal-beta' });

    const out = captureOutput(() => handleListMissions({ root, lang: 'en' }));

    expect(out).toContain('list-alpha');
    expect(out).toContain('goal-beta');
    expect(out).toContain('checklist');
    expect(out).toContain('goal');
  });

  it('outputs valid JSON with --json flag', () => {
    const root = mkRoot();
    handleCreateList({
      root,
      lang: 'en',
      title: 'JSON test',
      items: [{ kind: 'task', spec: { description: 'json task' } }],
      id: 'list-json-001',
    });

    const out = captureOutput(() => handleListMissions({ root, lang: 'en', json: true }));

    const parsed = JSON.parse(out) as Array<{ id: string; renderAs: string }>;
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.some((v) => v.id === 'list-json-001')).toBe(true);
  });
});

describe('parseItemFlags', () => {
  it('parses bare kind', () => {
    expect(parseItemFlags(['task'])).toEqual([{ kind: 'task' }]);
  });

  it('parses kind:json-spec', () => {
    const items = parseItemFlags(['task:{"description":"do work"}']);
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe('task');
    expect(items[0]!.spec).toEqual({ description: 'do work' });
  });

  it('parses kind:plain-string as {description}', () => {
    const items = parseItemFlags(['sprint:run everything']);
    expect(items[0]!.kind).toBe('sprint');
    expect(items[0]!.spec).toEqual({ description: 'run everything' });
  });
});

describe('registerAutonomousMission', () => {
  it('registers autonomous-mission command group on program', () => {
    const program = new Command();
    program.exitOverride();
    registerAutonomousMission(program);

    const names = program.commands.map((c) => c.name());
    expect(names).toContain('autonomous-mission');

    const missionCmd = program.commands.find((c) => c.name() === 'autonomous-mission')!;
    const subNames = missionCmd.commands.map((c) => c.name());
    expect(subNames).toContain('create-list');
    expect(subNames).toContain('create-goal');
    expect(subNames).toContain('list');
  });
});

describe('born-570 — engine-disabled honest warning on create', () => {
  function writeAutonomousEnabled(root: string, enabled: boolean): void {
    mkdirSync(join(root, '.deckent'), { recursive: true });
    writeFileSync(
      join(root, '.deckent', 'config.json'),
      JSON.stringify({ autonomous: { enabled } }),
      'utf-8',
    );
  }

  const WARN_EN = 'the autonomous engine is disabled';

  it('DISABLED (no config): create-list warns loudly the mission will not drain', () => {
    const root = mkRoot();
    const out = captureOutput(() =>
      handleCreateList({ root, lang: 'en', title: 'X', items: [{ kind: 'task', spec: { description: 'x' } }], id: 'l1' }),
    );
    expect(out).toContain('Mission created: l1');
    expect(out).toContain(WARN_EN);
    expect(out).not.toContain('autonomous_mission.'); // i18n key resolved
  });

  it('DISABLED (autonomous.enabled=false): create-goal warns', () => {
    const root = mkRoot();
    writeAutonomousEnabled(root, false);
    const out = captureOutput(() =>
      handleCreateGoal({ root, lang: 'en', goal: 'ship it', id: 'g1' }),
    );
    expect(out).toContain('Goal mission created: g1');
    expect(out).toContain(WARN_EN);
  });

  it('ENABLED (autonomous.enabled=true): NO warning — mission will drain', () => {
    const root = mkRoot();
    writeAutonomousEnabled(root, true);
    const out = captureOutput(() =>
      handleCreateList({ root, lang: 'en', title: 'X', items: [{ kind: 'task', spec: { description: 'x' } }], id: 'l2' }),
    );
    expect(out).toContain('Mission created: l2');
    expect(out).not.toContain(WARN_EN);
  });

  it('ENABLED: create-goal also stays quiet', () => {
    const root = mkRoot();
    writeAutonomousEnabled(root, true);
    const out = captureOutput(() =>
      handleCreateGoal({ root, lang: 'en', goal: 'ship it', id: 'g2' }),
    );
    expect(out).toContain('Goal mission created: g2');
    expect(out).not.toContain(WARN_EN);
  });
});

// src/cli/commands/autonomous-mission.ts
//
// `deckent autonomous-mission` — CLI command group for autonomous-v2 missions.
// Subcommands: create-list, create-goal, list
//
// ADR-012: registerAutonomousMission(program) pattern.
// i18n: all user-facing output via getMessage(). Keys prefixed autonomous_mission.*.
// NOTE: message keys are not yet registered in messages.ts (outside scope.filesWrite);
//       getMessage falls back to the key string — tracked as tech debt.

import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveProjectRoot } from '../helpers/process.js';
import { print, printError } from '../helpers/output.js';
import { getMessage } from '../helpers/messages.js';
import { detectLang } from '../helpers/i18n.js';
import { SqliteMissionStore } from '../../orchestra/autonomous/mission-store/sqlite-mission-store.js';
import { createListMission } from '../../orchestra/autonomous/mission-store/mission-ingest.js';
import { createGoalMission } from '../../orchestra/autonomous/mission-store/goal-mission.js';
import { auditMissionLifecycle } from '../../orchestra/autonomous/mission-store/mission-audit-bridge.js';
import { projectMission } from '../../orchestra/autonomous/mission-store/mission-view.js';
import type { WorkItemKind } from '../../orchestra/autonomous/mission-store/mission-types.js';
import { DECKENT_DIR } from '../../core/constants.js';

// ─── Store helpers ─────────────────────────────────────────────────────

function autonomousDbPath(root: string): string {
  return join(root, DECKENT_DIR, 'autonomous', 'autonomous.db');
}

function openStore(root: string): SqliteMissionStore {
  const store = new SqliteMissionStore(root);
  store.migrate();
  return store;
}

// ─── Item parsing ───────────────────────────────────────────────────────

export interface ParsedItem {
  kind: WorkItemKind;
  spec?: Record<string, unknown>;
  id?: string;
}

/** Parse `--item kind:spec` flags into work-item specs. */
export function parseItemFlags(flags: string[]): ParsedItem[] {
  return flags.map((raw) => {
    const colonIdx = raw.indexOf(':');
    if (colonIdx === -1) {
      return { kind: raw as WorkItemKind };
    }
    const kind = raw.slice(0, colonIdx) as WorkItemKind;
    const specStr = raw.slice(colonIdx + 1);
    let spec: Record<string, unknown>;
    try {
      spec = JSON.parse(specStr) as Record<string, unknown>;
    } catch {
      spec = { description: specStr };
    }
    return { kind, spec };
  });
}

/** Load items from a JSON file (array of {kind, spec?, id?, policy?}). */
export function loadItemsFromFile(filePath: string): ParsedItem[] {
  const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
  if (!Array.isArray(raw)) throw new Error('Expected JSON array');
  return (raw as Array<Record<string, unknown>>).map((e) => ({
    kind: e['kind'] as WorkItemKind,
    spec: e['spec'] as Record<string, unknown> | undefined,
    id: typeof e['id'] === 'string' ? e['id'] : undefined,
  }));
}

// ─── Handler functions (exported for testability) ───────────────────────

export interface CreateListOpts {
  root: string;
  lang: string;
  title: string;
  items: ParsedItem[];
  id?: string;
  tenant?: string;
  deliverTo?: string;
}

export function handleCreateList(opts: CreateListOpts): void {
  const store = openStore(opts.root);
  try {
    const missionId = opts.id ?? `list-${Date.now()}`;
    const mission = createListMission(store, {
      id: missionId,
      title: opts.title,
      tenant: opts.tenant,
      deliverTo: opts.deliverTo,
      items: opts.items,
    });
    auditMissionLifecycle(opts.root, {
      tenantId: opts.tenant ?? 'local',
      actor: 'cli',
      action: 'missions:create',
      missionId: mission.id,
      metadata: { kind: mission.kind, title: mission.title },
    });
    print(
      getMessage('autonomous_mission.create_list.created', opts.lang, {
        id: mission.id,
        title: mission.title,
        count: String(opts.items.length),
      }),
    );
  } finally {
    store.close();
  }
}

export interface CreateGoalOpts {
  root: string;
  lang: string;
  goal: string;
  title?: string;
  acceptance?: string;
  id?: string;
  tenant?: string;
  deliverTo?: string;
}

export function handleCreateGoal(opts: CreateGoalOpts): void {
  const store = openStore(opts.root);
  try {
    const missionId = opts.id ?? `goal-${Date.now()}`;
    const mission = createGoalMission(store, {
      id: missionId,
      title: opts.title ?? opts.goal,
      goal: opts.goal,
      acceptance: opts.acceptance,
      tenant: opts.tenant,
      deliverTo: opts.deliverTo,
    });
    auditMissionLifecycle(opts.root, {
      tenantId: opts.tenant ?? 'local',
      actor: 'cli',
      action: 'missions:create',
      missionId: mission.id,
      metadata: { kind: mission.kind, title: mission.title },
    });
    print(
      getMessage('autonomous_mission.create_goal.created', opts.lang, {
        id: mission.id,
        goal: opts.goal,
      }),
    );
  } finally {
    store.close();
  }
}

export interface ListMissionsOpts {
  root: string;
  lang: string;
  tenant?: string;
  json?: boolean;
}

export function handleListMissions(opts: ListMissionsOpts): void {
  const dbPath = autonomousDbPath(opts.root);
  if (!existsSync(dbPath)) {
    print(getMessage('autonomous_mission.list.empty', opts.lang));
    return;
  }

  const store = openStore(opts.root);
  try {
    const missions = store.listMissions(opts.tenant ? { tenant: opts.tenant } : undefined);

    if (opts.json) {
      const views = missions.map((m) => projectMission(store, m.id)).filter(Boolean);
      print(JSON.stringify(views, null, 2));
      return;
    }

    if (missions.length === 0) {
      print(getMessage('autonomous_mission.list.empty', opts.lang));
      return;
    }

    print(
      getMessage('autonomous_mission.list.header', opts.lang, {
        count: String(missions.length),
      }),
    );
    for (const m of missions) {
      const view = projectMission(store, m.id);
      if (!view) continue;
      const progress = `${view.progress.done}/${view.progress.total}`;
      print(`  ${m.id}  [${m.renderAs}]  ${m.status}  ${progress}  ${m.title}`);
    }
  } finally {
    store.close();
  }
}

// ─── Commander registration ─────────────────────────────────────────────

export function registerAutonomousMission(program: Command): void {
  const grp = program
    .command('autonomous-mission')
    .description('Manage autonomous v2 missions — list missions, goal missions');

  // create-list <title>
  grp
    .command('create-list <title>')
    .description('Create a Type-1 list mission from N work-items')
    .option(
      '--item <kind:spec>',
      'Work item (repeatable): kind or kind:json-spec',
      (val: string, acc: string[]) => [...acc, val],
      [] as string[],
    )
    .option('--items-file <path>', 'JSON file containing an array of {kind, spec?, id?} items')
    .option('--id <id>', 'Mission id (auto-generated if omitted)')
    .option('--tenant <tenant>', 'Tenant identifier')
    .option('--deliver-to <channel>', 'Delivery channel for settled notification')
    .action((title: string, opts: {
      item: string[];
      itemsFile?: string;
      id?: string;
      tenant?: string;
      deliverTo?: string;
    }) => {
      const root = resolveProjectRoot();
      const lang = detectLang(root);

      let items: ParsedItem[] = [];
      if (opts.itemsFile) {
        try {
          items = loadItemsFromFile(opts.itemsFile);
        } catch (err) {
          printError(
            getMessage('autonomous_mission.items_file_error', lang, { error: String(err) }),
          );
          return;
        }
      }
      items = [...items, ...parseItemFlags(opts.item)];

      handleCreateList({ root, lang, title, items, id: opts.id, tenant: opts.tenant, deliverTo: opts.deliverTo });
    });

  // create-goal <goal>
  grp
    .command('create-goal <goal>')
    .description('Create a Type-2 goal mission (runs until the goal is reached)')
    .option('--accept <criteria>', 'Acceptance criteria string')
    .option('--title <title>', 'Mission title (defaults to goal text)')
    .option('--id <id>', 'Mission id (auto-generated if omitted)')
    .option('--tenant <tenant>', 'Tenant identifier')
    .option('--deliver-to <channel>', 'Delivery channel for settled notification')
    .action((goal: string, opts: {
      accept?: string;
      title?: string;
      id?: string;
      tenant?: string;
      deliverTo?: string;
    }) => {
      const root = resolveProjectRoot();
      const lang = detectLang(root);
      handleCreateGoal({
        root,
        lang,
        goal,
        title: opts.title,
        acceptance: opts.accept,
        id: opts.id,
        tenant: opts.tenant,
        deliverTo: opts.deliverTo,
      });
    });

  // list
  grp
    .command('list')
    .description('List all missions (summary table)')
    .option('--json', 'Output as JSON')
    .option('--tenant <tenant>', 'Filter by tenant')
    .action((opts: { json?: boolean; tenant?: string }) => {
      const root = resolveProjectRoot();
      const lang = detectLang(root);
      handleListMissions({ root, lang, json: opts.json, tenant: opts.tenant });
    });
}

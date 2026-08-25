// src/cli/commands/autonomous-mission.ts
//
// `deckent autonomous-mission` — CLI command group for autonomous-v2 missions.
// Subcommands: create-list, create-goal, list
//
// ADR-012: registerAutonomousMission(program) pattern.
// i18n: all user-facing output via getMessage(). Keys prefixed autonomous_mission.*.

import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveProjectRoot } from '../helpers/process.js';
import { print, printError } from '../helpers/output.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
import { bindGovernanceArgumentDescriptions } from '../helpers/message-catalog/cli-governance.js';
import { detectLang } from '../helpers/i18n.js';
import { SqliteMissionStore } from '../../orchestra/autonomous/mission-store/sqlite-mission-store.js';
import { createListMission } from '../../orchestra/autonomous/mission-store/mission-ingest.js';
import { createGoalMission } from '../../orchestra/autonomous/mission-store/goal-mission.js';
import {
  MissionAdmissionError,
  PRODUCTION_V2_ADMISSION,
  listRuntimeAdmittedKinds,
} from '../../orchestra/autonomous/mission-store/mission-kind-admission.js';
import { PROJECT_CONFIG_PATH } from '../../core/constants.js';
import { DeckentError } from '../../core/errors.js';

/**
 * born-570 — is the autonomous engine explicitly enabled? A mission created
 * while it is off is written to the store but NEVER drained (the v2 engine only
 * runs when `autonomous.enabled` is true) — the silent "inert row" bug. This is
 * a best-effort SYNC read of the project config (the exact file that
 * `deckent autonomous enable` writes), so `create-*` can warn honestly instead
 * of silently queueing work that will never run. Any missing-file / parse error
 * is treated as disabled (warn) and never throws.
 */
function isAutonomousEngineEnabled(root: string): boolean {
  try {
    const raw = readFileSync(join(root, PROJECT_CONFIG_PATH), 'utf-8');
    const cfg = JSON.parse(raw) as { autonomous?: { enabled?: boolean } };
    return cfg.autonomous?.enabled === true;
  } catch {
    return false;
  }
}

/**
 * born-570 — after a mission is created, warn LOUDLY when the engine is disabled
 * so the user is never silently misled into thinking the mission will run. The
 * mission is still created (queue-then-enable stays valid); only the honest
 * heads-up is added.
 */
function warnIfAutonomousEngineDisabled(root: string, lang: string): void {
  if (!isAutonomousEngineEnabled(root)) {
    print(getMessage('autonomous_mission.engine_disabled_warning', lang));
  }
}
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
    let mission: ReturnType<typeof createListMission>;
    try {
      mission = createListMission(store, {
        id: missionId,
        title: opts.title,
        tenant: opts.tenant,
        deliverTo: opts.deliverTo,
        items: opts.items,
      }, { admission: PRODUCTION_V2_ADMISSION });
    } catch (error) {
      if (error instanceof MissionAdmissionError) {
        throw new DeckentError('DECKENT_E039', getMessage('autonomous.plan_kind_rejected', opts.lang, {
          id: error.itemId,
          kind: error.kind,
          reason: error.code,
          allowed: listRuntimeAdmittedKinds(PRODUCTION_V2_ADMISSION).join(', '),
        }));
      }
      throw error;
    }
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
    warnIfAutonomousEngineDisabled(opts.root, opts.lang);
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
      acceptanceAuthoredBy: { surface: 'cli', actorId: null },
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
    warnIfAutonomousEngineDisabled(opts.root, opts.lang);
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
    .description(getMessage('cli.autonomous_mission.desc', getLanguage(undefined)));

  // create-list <title>
  bindGovernanceArgumentDescriptions(
    grp.command('create-list <title>'),
    getLanguage(undefined),
    { title: 'cli.governance.mission.arg.title' },
  )
    .description(getMessage('cli.autonomous_mission.create_list.desc', getLanguage(undefined)))
    .option(
      '--item <kind:spec>',
      getMessage('cli.governance.mission.opt.item', getLanguage(undefined)),
      (val: string, acc: string[]) => [...acc, val],
      [] as string[],
    )
    .option('--items-file <path>', getMessage('cli.governance.mission.opt.items_file', getLanguage(undefined)))
    .option('--id <id>', getMessage('cli.governance.mission.opt.id', getLanguage(undefined)))
    .option('--tenant <tenant>', getMessage('cli.governance.opt.tenant', getLanguage(undefined)))
    .option('--deliver-to <channel>', getMessage('cli.governance.mission.opt.deliver_to', getLanguage(undefined)))
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
  bindGovernanceArgumentDescriptions(
    grp.command('create-goal <goal>'),
    getLanguage(undefined),
    { goal: 'cli.governance.mission.arg.goal' },
  )
    .description(getMessage('cli.autonomous_mission.create_goal.desc', getLanguage(undefined)))
    .option('--accept <criteria>', getMessage('cli.governance.mission.opt.accept', getLanguage(undefined)))
    .option('--title <title>', getMessage('cli.governance.mission.opt.title', getLanguage(undefined)))
    .option('--id <id>', getMessage('cli.governance.mission.opt.id', getLanguage(undefined)))
    .option('--tenant <tenant>', getMessage('cli.governance.opt.tenant', getLanguage(undefined)))
    .option('--deliver-to <channel>', getMessage('cli.governance.mission.opt.deliver_to', getLanguage(undefined)))
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
    .description(getMessage('cli.autonomous_mission.list.desc', getLanguage(undefined)))
    .option('--json', getMessage('cli.governance.opt.json', getLanguage(undefined)))
    .option('--tenant <tenant>', getMessage('cli.governance.opt.tenant_filter', getLanguage(undefined)))
    .action((opts: { json?: boolean; tenant?: string }) => {
      const root = resolveProjectRoot();
      const lang = detectLang(root);
      handleListMissions({ root, lang, json: opts.json, tenant: opts.tenant });
    });
}

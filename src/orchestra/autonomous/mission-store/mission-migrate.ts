import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DECKENT_DIR } from '../../../core/constants.js';
import type { MissionStore, NewMissionWorkItem } from './mission-types.js';
import type { BacklogEntry, BacklogStatus } from '../backlog-types.js';
import {
  admitWorkItemBatch,
  MissionAdmissionError,
  type MissionRuntimeAdmission,
} from './mission-kind-admission.js';

const STATUS_MAP: Record<BacklogStatus, 'pending' | 'running' | 'done' | 'failed' | 'parked'> = {
  pending: 'pending', running: 'running', done: 'done', failed: 'failed', parked: 'parked',
};

export interface MigrateBacklogOptions {
  /** Runtime truth at the production composition boundary. */
  admission?: MissionRuntimeAdmission;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  const normalize = (nested: unknown): unknown => {
    if (Array.isArray(nested)) return nested.map(normalize);
    if (isRecord(nested)) {
      return Object.fromEntries(Object.entries(nested)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalize(child)]));
    }
    return nested ?? null;
  };
  return JSON.stringify(normalize(value));
}

function importDefinition(items: readonly NewMissionWorkItem[]): unknown[] {
  return items.map((item) => ({
    id: item.id,
    kind: item.kind,
    spec: item.spec ?? null,
    policy: item.policy ?? 'auto',
    trigger: item.trigger ?? null,
  })).sort((left, right) => left.id.localeCompare(right.id));
}

/** One-time import of the legacy backlog.json into its reserved `legacy` mission. */
export function migrateBacklogJson(
  projectRoot: string,
  store: MissionStore,
  opts: MigrateBacklogOptions = {},
): number {
  const path = join(projectRoot, DECKENT_DIR, 'autonomous', 'backlog.json');
  if (!existsSync(path)) return 0;
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown; }
  catch (error) {
    throw new Error(`MISSION_MIGRATION_INVALID: backlog JSON is unreadable: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(parsed) || typeof parsed['_version'] !== 'string' || !Array.isArray(parsed['entries'])) {
    throw new Error('MISSION_MIGRATION_INVALID: backlog must contain string _version and entries array');
  }
  const entries = parsed['entries'] as BacklogEntry[];

  const invalidEntryIndex = entries.findIndex((entry) => (
    !entry
    || typeof entry.id !== 'string'
    || entry.id.trim().length === 0
    || typeof entry.kind !== 'string'
    || entry.kind.trim().length === 0
    || !Object.hasOwn(STATUS_MAP, entry.status)
  ));
  if (invalidEntryIndex !== -1) {
    throw new Error(`MISSION_MIGRATION_INVALID: legacy entry ${invalidEntryIndex} has invalid identity, kind, or status`);
  }

  const items: NewMissionWorkItem[] = entries.map((e) => {
    const importedStatus = STATUS_MAP[e.status] ?? 'pending';
    const uncertainRunning = importedStatus === 'running';
    return {
      id: e.id,
      missionId: 'legacy',
      kind: e.kind,
      spec: e.spec as Record<string, unknown>,
      policy: e.policy,
      trigger: e.trigger as unknown as Record<string, unknown>,
      initialStatus: uncertainRunning ? 'parked' : importedStatus,
      ...(uncertainRunning ? {
        initialResult: {
          ok: false,
          reason: 'RECOVERY_RECONCILIATION_REQUIRED: imported legacy running attempt has no terminal dispatch evidence; automatic redrive refused',
        },
      } : e.lastResult ? { initialResult: e.lastResult } : {}),
    };
  });
  let admittedItems = items;
  if (opts.admission) {
    // Terminal rows are historical evidence, not execution requests. Classify
    // every non-terminal row independently before the single atomic store write:
    // one legacy definition must not make unrelated admitted work unreachable.
    // Rejected rows preserve their exact kind/spec plus durable fail-closed
    // evidence; they are never rewritten into task or silently dropped.
    admittedItems = items.map((item): NewMissionWorkItem => {
      if (item.initialStatus === 'done' || item.initialStatus === 'failed') return item;
      try {
        return admitWorkItemBatch([item], opts.admission!)[0]!;
      } catch (error) {
        if (!(error instanceof MissionAdmissionError)) throw error;
        const parked = error.code.endsWith('_UNWIRED');
        return {
          ...item,
          ...(error.code === 'UNKNOWN_KIND' ? { renderAs: 'action' as const } : {}),
          initialStatus: parked ? 'parked' : 'failed',
          initialResult: {
            ok: false,
            reason: `MISSION_MIGRATION_QUARANTINED: ${error.message}`,
            missionAdmission: {
              schemaVersion: 1,
              code: error.code,
              itemId: error.itemId,
              persistedKind: error.kind,
              authorityRevision: opts.admission!.registryRevision,
              authorityDigest: opts.admission!.registryDigest,
              decision: parked ? 'parked-hold' : 'failed-closed',
              source: 'legacy-backlog-import',
            },
          },
        };
      }
    });
  }
  const sourceDigest = createHash('sha256').update(canonicalJson(entries)).digest('hex');
  const existing = store.getMission('legacy');
  if (existing) {
    const recordedDigest = isRecord(existing.spec?.['legacyImport'])
      ? existing.spec['legacyImport']['sourceDigest']
      : undefined;
    if (typeof recordedDigest === 'string') {
      if (recordedDigest !== sourceDigest) {
        throw new Error('MISSION_MIGRATION_CONFLICT: legacy backlog changed after its recorded import');
      }
      return 0;
    }

    // Backward-compatible reconciliation for stores imported before source
    // fingerprints existed. Compare immutable definitions; never presence-only.
    const storedItems = store.listItems('legacy');
    const storedDefinition = storedItems.map((item) => ({
      id: item.id,
      kind: item.kind,
      spec: item.spec,
      policy: item.policy,
      trigger: item.trigger,
    })).sort((left, right) => left.id.localeCompare(right.id));
    if (canonicalJson(storedDefinition) !== canonicalJson(importDefinition(items))) {
      throw new Error('MISSION_MIGRATION_CONFLICT: pre-provenance legacy mission does not match source backlog');
    }
    for (const item of items) {
      if ((item.initialStatus === 'done' || item.initialStatus === 'failed') && item.initialResult) {
        const stored = storedItems.find((candidate) => candidate.id === item.id);
        if (!stored) {
          throw new Error(`MISSION_MIGRATION_CONFLICT: terminal item missing for ${item.id}`);
        }
        if (stored?.lastResult === null) {
          const backfilled = store.backfillLegacyTerminalResult(
            item.id,
            stored.revision,
            item.initialStatus,
            item.initialResult,
          );
          if (!backfilled) {
            const current = store.listItems('legacy').find((candidate) => candidate.id === item.id);
            if (!current
              || current.status !== item.initialStatus
              || canonicalJson(current.lastResult) !== canonicalJson(item.initialResult)) {
              throw new Error(`MISSION_MIGRATION_CONFLICT: terminal evidence changed for ${item.id}`);
            }
          }
        } else if (stored.status !== item.initialStatus
          || canonicalJson(stored.lastResult) !== canonicalJson(item.initialResult)) {
          throw new Error(`MISSION_MIGRATION_CONFLICT: terminal evidence changed for ${item.id}`);
        }
      }
    }
    return 0;
  }
  if (items.length === 0) return 0;
  store.importLegacyMissionWithItems(
    {
      id: 'legacy',
      kind: 'list',
      title: 'Imported backlog',
      renderAs: 'checklist',
      spec: { legacyImport: { schemaVersion: 1, source: 'backlog.json', sourceDigest } },
    },
    admittedItems,
  );
  return items.length;
}

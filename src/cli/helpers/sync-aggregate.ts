// ─── Sync Aggregate (MASTER 7104 SYNC-PROVENANCE-TRUTH-001) ────────────────
//
// Pure, string-free reduction of `deckent sync --json` output into a compact,
// typed summary a REPL (or any other) consumer can render without re-deriving
// array lengths or conflict semantics itself. No user-facing prose lives
// here — every field is a number, an id, or a typed code; label text is the
// caller's responsibility (i18n-FIRST, per project quality bar).
//
// `buildSyncAggregate` never throws and never mutates its input: every count
// defaults to 0 and every collection defaults to empty when the corresponding
// report is absent (a `--git-only` or `--adapters-only` run omits most
// fields). The returned `SyncAggregateSummary` is deep-frozen at the top
// level and every nested object/array so a consumer cannot accidentally
// mutate shared state.

import {
  isSyncChangeDetectionMode,
  isSyncChangeDetectionIssueCode,
  type SyncChangeDetectionMode,
  type SyncChangeDetectionIssueCode,
} from './sync-change-detection.js';
import type {
  SyncResult,
  AdapterSyncError,
  WorkspaceSyncReport,
  AgentCapabilitiesSyncReport,
} from '../commands/sync.js';
import type { AgentPromptSyncReport } from '../../core/agent-prompt-sync.js';
import type { AgentManifestSyncReport } from '../../core/agent-manifest-sync.js';
import type { BuiltinSkillSyncReport } from '../../core/skill-pool.js';
import type { AgentSyncConflictKind } from '../../core/agent-sync-conflict.js';

// ─── Input shape (mirrors `deckent sync --json` stdout) ────────────────────

/**
 * The parsed shape of `deckent sync --json` stdout (see
 * `src/cli/commands/sync.ts`'s `registerSync` action, `output` local). Every
 * field is optional because `--git-only` / `--adapters-only` runs — and
 * older producer versions — omit whole sections rather than emitting empty
 * reports for work that never ran.
 */
export interface SyncCommandOutput {
  adaptersSynced?: string[];
  adapterErrors?: AdapterSyncError[];
  agentPromptSync?: AgentPromptSyncReport;
  agentManifestSync?: AgentManifestSyncReport;
  agentCapabilitiesSync?: AgentCapabilitiesSyncReport;
  skillManifestSync?: BuiltinSkillSyncReport;
  workspaceSync?: WorkspaceSyncReport;
  gitChanges?: SyncResult | null;
  warnings?: string[];
}

// ─── Output shape ────────────────────────────────────────────────────────

export const SYNC_AGGREGATE_SCHEMA_VERSION = 1 as const;

/**
 * Which shadow-sync report a conflict entry originated from. Not a
 * user-facing label — a caller maps this typed code to its own i18n string.
 */
export type SyncConflictScope = 'agent-prompt' | 'agent-manifest';

export interface SyncConflictEntry {
  scope: SyncConflictScope;
  agentId: string;
  kind: AgentSyncConflictKind;
}

export interface SyncAggregateSummary {
  schemaVersion: 1;
  adapters: { synced: number; errors: number };
  agentPrompts: { created: number; updated: number; keptLocal: number };
  agentManifests: { created: number; updated: number; keptLocal: number };
  capabilities: { migrated: number; issues: number };
  skills: { created: number; updated: number; keptLocal: number; unchanged: number; issues: number };
  workspace: { changed: number; unchanged: number };
  git: {
    commits: number;
    modified: number;
    added: number;
    deleted: number;
    renamed: number;
    /**
     * How the file lists above were established — mirrors
     * `SyncResult.detection.mode` (`src/cli/commands/sync.ts`) one-for-one,
     * minus the diagnostic `issue` detail (this aggregate is a compact,
     * renderable summary, not a full diagnostic payload). `'unavailable'`
     * covers BOTH an explicit git failure the producer reported AND a raw
     * report from a producer that predates this field entirely — see
     * `buildSyncAggregate`'s fail-closed default below. A truthful
     * `'root-fallback'` or `'unavailable'` here must never render the same
     * as `'range'`.
     */
    detection: SyncChangeDetectionMode;
    /**
     * WHICH git step failed when `detection === 'unavailable'` — mirrors
     * `SyncResult.detection.issue.code` (the closed
     * `SyncChangeDetectionIssueCode` enum), without the free-text `detail`.
     * `null` when the mode was established cleanly, AND for a legacy raw
     * report that carries no `detection` at all (unknown provenance: mode
     * 'unavailable', reason unknown). Lets a `--json` consumer tell a
     * successful zero (`commits: 0`, 'range', `null`) from a failed log
     * (`commits: 0`, 'unavailable', 'GIT_LOG_FAILED') without the raw report.
     */
    issueCode: SyncChangeDetectionIssueCode | null;
  } | null;
  missingBaseline: { count: number; agentIds: string[] };
  conflicts: SyncConflictEntry[];
  warnings: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Freezes `value` in place and returns the SAME reference, retaining its
 * original (non-`Readonly<...>`) static type. `Object.freeze<T>` in lib.d.ts
 * returns `Readonly<T>`, which is not assignable back to a plain mutable
 * field type (e.g. `string[]`) — discarding that return and handing back the
 * original binding keeps every exported interface exactly as specified while
 * still freezing the object at runtime.
 */
function freezeShallow<T extends object>(value: T): T {
  Object.freeze(value);
  return value;
}

/** The minimal shape `buildSyncAggregate` needs from a prompt/manifest sync conflict record. */
interface RawSyncConflict {
  agentId: string;
  kind?: AgentSyncConflictKind;
}

interface ClassifiedConflicts {
  missingBaselineIds: string[];
  localEditEntries: SyncConflictEntry[];
}

/**
 * Splits one report's `conflicts` array into missing-baseline agent ids and
 * local-edit entries for the given scope.
 *
 * Fail-closed by design: only a conflict record whose `kind` is explicitly
 * `'missing-baseline'` is treated as unverifiable provenance. Every other
 * record — including one from a legacy producer that predates the `kind`
 * field and so carries `kind: undefined` — is treated as `'local-edit'`, the
 * more severe classification. This never hides a possible real local edit
 * behind a schema gap.
 */
function classifyConflicts(
  entries: readonly RawSyncConflict[] | undefined,
  scope: SyncConflictScope,
): ClassifiedConflicts {
  const missingBaselineIds: string[] = [];
  const localEditEntries: SyncConflictEntry[] = [];
  for (const entry of entries ?? []) {
    if (entry.kind === 'missing-baseline') {
      missingBaselineIds.push(entry.agentId);
    } else {
      localEditEntries.push(
        freezeShallow<SyncConflictEntry>({ scope, agentId: entry.agentId, kind: 'local-edit' }),
      );
    }
  }
  return { missingBaselineIds, localEditEntries };
}

function compareConflicts(a: SyncConflictEntry, b: SyncConflictEntry): number {
  if (a.scope !== b.scope) {
    return a.scope === 'agent-prompt' ? -1 : 1;
  }
  if (a.agentId < b.agentId) return -1;
  if (a.agentId > b.agentId) return 1;
  return 0;
}

// ─── Reduction ───────────────────────────────────────────────────────────

/**
 * Pure reduction of one `deckent sync --json` payload into a compact,
 * deterministic, deep-frozen summary. Never throws; an absent report section
 * contributes zeros/empties rather than `undefined` propagating outward.
 */
export function buildSyncAggregate(output: SyncCommandOutput): SyncAggregateSummary {
  const promptConflicts = classifyConflicts(output.agentPromptSync?.conflicts, 'agent-prompt');
  const manifestConflicts = classifyConflicts(output.agentManifestSync?.conflicts, 'agent-manifest');

  const missingBaselineIds = freezeShallow(
    Array.from(new Set([...promptConflicts.missingBaselineIds, ...manifestConflicts.missingBaselineIds])).sort(),
  );

  const conflicts = freezeShallow(
    [...promptConflicts.localEditEntries, ...manifestConflicts.localEditEntries].sort(compareConflicts),
  );

  const gitChanges = output.gitChanges;
  const git = gitChanges
    ? freezeShallow({
        commits: gitChanges.commits,
        modified: gitChanges.modified.length,
        added: gitChanges.added.length,
        deleted: gitChanges.deleted.length,
        renamed: gitChanges.renamed.length,
        // Fail-closed: a raw report from a producer that predates
        // `SyncResult.detection` — or otherwise omits it — carries unknown
        // provenance for the file lists above, so it collapses to
        // 'unavailable' rather than silently reading as a confirmed 'range'.
        detection: gitChanges.detection?.mode ?? 'unavailable',
        issueCode: gitChanges.detection?.issue?.code ?? null,
      })
    : null;

  const summary: SyncAggregateSummary = {
    schemaVersion: SYNC_AGGREGATE_SCHEMA_VERSION,
    adapters: freezeShallow({
      synced: output.adaptersSynced?.length ?? 0,
      errors: output.adapterErrors?.length ?? 0,
    }),
    agentPrompts: freezeShallow({
      created: output.agentPromptSync?.created.length ?? 0,
      updated: output.agentPromptSync?.updated.length ?? 0,
      keptLocal: output.agentPromptSync?.keptLocal.length ?? 0,
    }),
    agentManifests: freezeShallow({
      created: output.agentManifestSync?.created.length ?? 0,
      updated: output.agentManifestSync?.updated.length ?? 0,
      keptLocal: output.agentManifestSync?.keptLocal.length ?? 0,
    }),
    capabilities: freezeShallow({
      migrated: output.agentCapabilitiesSync?.migrated.length ?? 0,
      issues: output.agentCapabilitiesSync?.issues.length ?? 0,
    }),
    skills: freezeShallow({
      created: output.skillManifestSync?.created.length ?? 0,
      updated: output.skillManifestSync?.updated.length ?? 0,
      keptLocal: output.skillManifestSync?.keptLocal.length ?? 0,
      unchanged: output.skillManifestSync?.unchanged.length ?? 0,
      issues: output.skillManifestSync?.issues.length ?? 0,
    }),
    workspace: freezeShallow({
      changed: output.workspaceSync?.changed.length ?? 0,
      unchanged: output.workspaceSync?.unchanged.length ?? 0,
    }),
    git,
    missingBaseline: freezeShallow({
      count: missingBaselineIds.length,
      agentIds: missingBaselineIds,
    }),
    conflicts,
    warnings: output.warnings?.length ?? 0,
  };

  return freezeShallow(summary);
}

// ─── Validation ──────────────────────────────────────────────────────────

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasNonNegativeIntegerFields(value: unknown, keys: readonly string[]): value is Record<string, number> {
  if (!isPlainObject(value)) return false;
  return keys.every((key) => isNonNegativeSafeInteger(value[key]));
}

function isSyncConflictScope(value: unknown): value is SyncConflictScope {
  return value === 'agent-prompt' || value === 'agent-manifest';
}

function isSyncConflictEntry(value: unknown): value is SyncConflictEntry {
  if (!isPlainObject(value)) return false;
  return (
    isSyncConflictScope(value.scope) &&
    typeof value.agentId === 'string' &&
    // Contract: `summary.conflicts` carries ONLY local-edit records — a
    // confirmed three-way conflict. `missing-baseline` (unverifiable
    // provenance, not a confirmed edit) belongs exclusively in
    // `missingBaseline`; `buildSyncAggregate` never puts it here, and this
    // validator must reject it too so a forged or legacy payload cannot
    // smuggle it back in as a rendered conflict.
    value.kind === 'local-edit'
  );
}

/**
 * Strict structural validator for `SyncAggregateSummary`, used by the REPL
 * (or any other) consumer to accept a summary deserialized from JSON without
 * trusting the producer's TypeScript types at runtime. Checks every field's
 * shape and value range (schema version pin, non-negative safe-integer
 * counts, string arrays, a closed enum for conflict `scope`, `kind`
 * restricted to `'local-edit'` — `summary.conflicts` never carries
 * `'missing-baseline'`, which belongs only in `missingBaseline` — and, when
 * `git` is non-null, `git.detection` restricted to the closed
 * `SyncChangeDetectionMode` values and `git.issueCode` to `null` or the closed
 * `SyncChangeDetectionIssueCode` values, a code only ever alongside 'unavailable') — including that `missingBaseline.count`
 * matches the length of `missingBaseline.agentIds`, the invariant
 * `buildSyncAggregate` establishes.
 */
export function isSyncAggregateSummary(value: unknown): value is SyncAggregateSummary {
  if (!isPlainObject(value)) return false;

  if (value.schemaVersion !== 1) return false;

  if (!hasNonNegativeIntegerFields(value.adapters, ['synced', 'errors'])) return false;
  if (!hasNonNegativeIntegerFields(value.agentPrompts, ['created', 'updated', 'keptLocal'])) return false;
  if (!hasNonNegativeIntegerFields(value.agentManifests, ['created', 'updated', 'keptLocal'])) return false;
  if (!hasNonNegativeIntegerFields(value.capabilities, ['migrated', 'issues'])) return false;
  if (
    !hasNonNegativeIntegerFields(value.skills, ['created', 'updated', 'keptLocal', 'unchanged', 'issues'])
  ) {
    return false;
  }
  if (!hasNonNegativeIntegerFields(value.workspace, ['changed', 'unchanged'])) return false;

  if (value.git !== null) {
    if (!isPlainObject(value.git)) return false;
    const git = value.git;
    if (!hasNonNegativeIntegerFields(git, [
      'commits',
      'modified',
      'added',
      'deleted',
      'renamed',
    ])) {
      return false;
    }
    if (!isSyncChangeDetectionMode(git.detection)) return false;
    if (git.issueCode !== null && !isSyncChangeDetectionIssueCode(git.issueCode)) return false;
    // Coherence: an issue code names a FAILURE, so it can only accompany
    // 'unavailable' — a clean mode with a code (or vice versa) is a forgery.
    if (git.issueCode !== null && git.detection !== 'unavailable') return false;
  }

  if (!isPlainObject(value.missingBaseline)) return false;
  const missingBaseline = value.missingBaseline;
  if (!isNonNegativeSafeInteger(missingBaseline.count)) return false;
  if (!isStringArray(missingBaseline.agentIds)) return false;
  if (missingBaseline.count !== missingBaseline.agentIds.length) return false;

  if (!Array.isArray(value.conflicts) || !value.conflicts.every(isSyncConflictEntry)) return false;

  if (!isNonNegativeSafeInteger(value.warnings)) return false;

  return true;
}

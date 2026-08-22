// ─── Debt Store (Memory V2 — DB-first debt accessor) ──────────────────
// Bridges SQLite `debt` entries to the legacy DebtItem shape. This is the
// source of truth for tech debt — the root .brain/DEBT.md file was removed
// in Task #4 (saf DB-first). Lives in core/ so any layer can read debt
// without importing the orchestra debt-manager (and without mock churn).

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BRAIN_DIR, MEMORY_DB_FILE } from './constants.js';
import { canonicalAcceptanceConfirmationJson, deriveAcceptanceConfirmationId,
  parseAcceptanceConfirmationLineage } from './acceptance-confirmation-contract.js';
import { MemoryStore, type CreateAcceptanceRouteDebtInput, type CreateAcceptanceRouteDebtResult,
  type TransitionAcceptanceRouteDebtInput } from './memory-store.js';
import { DebtPriority } from './types.js';
import type { DebtItem } from './types.js';
import type { MemoryEntryV2 } from './memory-types.js';
import { parseSprintNumber } from './utils.js';

/** Open the Memory V2 DB if it exists; null for a pre-V2 / absent DB. */
function openStore(projectRoot: string): MemoryStore | null {
  const dbPath = join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE);
  try {
    if (!existsSync(dbPath)) return null;
    return new MemoryStore(dbPath);
  } catch {
    return null;
  }
}

/** Project-local facade for authoritative first-writer acceptance debt creation. */
export function createAcceptanceRouteDebt(projectRoot: string, input: CreateAcceptanceRouteDebtInput): CreateAcceptanceRouteDebtResult {
  const store = openStore(projectRoot);
  if (!store) return { state: 'CONFLICT' };
  try { return store.createAcceptanceRouteDebtFww(input); }
  catch { return { state: 'CONFLICT' }; }
  finally { store.close(); }
}

/** Project-local facade for the tenant/project/full-lineage debt CAS. */
export function transitionAcceptanceRouteDebt(projectRoot: string, input: TransitionAcceptanceRouteDebtInput): boolean {
  const store = openStore(projectRoot);
  if (!store) return false;
  try {
    if (store.transitionAcceptanceRouteDebtCas(input)) return true;

    // A retry of the exact command is successful only when the authoritative
    // post-state is already present. Keep this read tenant-qualified and bind
    // the replay to every lineage byte; a merely similar terminal row must not
    // turn a stale or foreign command into success.
    const lineage = parseAcceptanceConfirmationLineage(input.lineage);
    if (!lineage.ok || input.tenantId !== lineage.value.tenantId
      || input.projectId !== lineage.value.projectId
      || input.confirmationId !== deriveAcceptanceConfirmationId(lineage.value)) return false;
    const row = store.getById(input.id, { tenantId: input.tenantId });
    if (!row || row.type !== 'debt' || row.status !== input.nextStatus) return false;
    const replayMetadata = canonicalAcceptanceConfirmationJson({
      ...(input.nextMetadata ?? input.expectedMetadata ?? {}),
      kind: 'acceptance-route-debt', confirmationId: input.confirmationId, lineage: lineage.value,
    });
    return row.metadata === replayMetadata;
  }
  catch { return false; }
  finally { store.close(); }
}

/** Map a Memory V2 `debt` entry row to the legacy DebtItem shape. */
function debtEntryToDebtItem(entry: MemoryEntryV2): DebtItem {
  const meta = JSON.parse(entry.metadata || '{}') as Record<string, unknown>;
  const p = (entry.priority || 'normal').toUpperCase();
  const priority = p === 'HIGH' ? DebtPriority.HIGH
    : p === 'CRITICAL' ? DebtPriority.CRITICAL
    : DebtPriority.NORMAL;
  return {
    id: entry.id,
    description: entry.title,
    originTaskId: typeof meta.originTaskId === 'string' ? meta.originTaskId : '',
    originSprintId: (typeof meta.originSprintId === 'string' && meta.originSprintId)
      ? meta.originSprintId
      : (entry.sprint_id ?? ''),
    priority,
    sprintsOpen: typeof meta.sprintsOpen === 'number' ? meta.sprintsOpen : 0,
    resolved: entry.status === 'resolved',
    resolvedInSprintId: typeof meta.resolvedInSprintId === 'string' ? meta.resolvedInSprintId : undefined,
    createdAt: entry.created_at,
  };
}

/**
 * Load tech-debt items from the Memory V2 DB as DebtItem[].
 * DB-first replacement for `parseDebtTable(readFile('.brain/DEBT.md'))` — the
 * root DEBT.md file is no longer a source of truth (saf DB-first, Task #4).
 * @param projectRoot - Project root directory
 * @param opts.activeOnly - When true, resolved debt is excluded
 * @returns DebtItem[]; empty array when no DB is present
 */
export function getDebtItems(
  projectRoot: string,
  opts?: { activeOnly?: boolean; tenantId?: string },
): DebtItem[] {
  const store = openStore(projectRoot);
  if (!store) return [];
  try {
    // Projection only: reads must never reconcile or otherwise mutate debt.
    const entries = store.getByType('debt', opts?.tenantId);
    const filtered = opts?.activeOnly
      ? entries.filter(e => e.status !== 'resolved')
      : entries;
    return filtered.map(debtEntryToDebtItem);
  } catch {
    return []; // corrupt or locked DB — debt is non-critical, degrade gracefully
  } finally {
    store.close();
  }
}

/**
 * Reconcile legacy successful-rollback debt for exactly one tenant/project.
 * The project is bound by its Memory DB and every transition is an atomic,
 * tenant-qualified status CAS. Tenantless and cross-tenant mutation is not
 * available through this API.
 */
export function reconcileSuccessfulRollbackDebt(projectRoot: string, tenantId: string): number {
  if (tenantId.length === 0) return 0;
  const store = openStore(projectRoot);
  if (!store) return 0;
  try {
    let resolved = 0;
    for (const entry of store.getByType('debt', tenantId)) {
      if (entry.status === 'resolved') continue;
      let metadata: Record<string, unknown>;
      try {
        metadata = JSON.parse(entry.metadata || '{}') as Record<string, unknown>;
      } catch {
        continue;
      }
      if (
        metadata.kind === 'rollback'
        && metadata.rollbackSuccess === true
        && store.updateDebtStatusCas(entry.id, tenantId, entry.status, 'resolved', 'debt-reconciliation')
      ) {
        resolved++;
      }
    }
    return resolved;
  } catch {
    return 0;
  } finally {
    store.close();
  }
}

/**
 * Record a sprint rollback event as a Memory V2 debt entry.
 * DB-first replacement for the old `.brain/DEBT.md` row append (Task #4b) —
 * eliminates the 7-vs-9-column corruption and the missing-newline bug.
 * Idempotent: at most one rollback record per sprint.
 * @param projectRoot - Project root directory
 * @param sprintId - Sprint that was rolled back
 * @param success - Whether the rollback succeeded
 * @param message - Human-readable rollback detail
 */
export function recordRollbackDebt(
  projectRoot: string,
  sprintId: string,
  success: boolean,
  message: string,
  tenantId?: string,
): void {
  const store = openStore(projectRoot);
  if (!store) return;
  try {
    const id = `rollback-${sprintId}`;
    // A supplied tenant is always part of the authority check. A same-id row
    // owned by another tenant therefore cannot be read or mutated here; the
    // global primary-key collision makes the subsequent insert fail closed.
    if (store.getById(id, tenantId === undefined ? undefined : { tenantId })) return;
    const label = success ? 'SUCCESS' : 'FAILED';
    // A successful rollback is a closed historical event — record it as resolved
    // so it does not accumulate as active critical debt over subsequent sprints.
    // Only FAILED rollbacks remain active (they signal a real problem to address).
    store.insert({
      id,
      type: 'debt',
      title: `Sprint ${sprintId} rollback ${label}`.slice(0, 80),
      content: `Sprint ${sprintId} rollback ${label}: ${message}`,
      source: 'brain',
      status: success ? 'resolved' : 'active',
      priority: 'normal',
      sprint_id: sprintId,
      sprint_num: parseSprintNumber(sprintId),
      tags: ['debt', 'rollback', sprintId],
      metadata: {
        originTaskId: '',
        originSprintId: sprintId,
        sprintsOpen: 0,
        kind: 'rollback',
        rollbackSuccess: success,
      },
      tenant_id: tenantId,
    });
  } catch {
    // best-effort — recording a rollback event must never crash the caller
  } finally {
    store.close();
  }
}

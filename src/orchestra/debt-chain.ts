/**
 * Debt-lineage chain-walk — the single shared definition used by BOTH the
 * EVALUATE phase (`runEvaluatePhase`) and the FIX phase (`runFixPhase`).
 *
 * It lives in its own module (not `debt-manager.ts`) on purpose: `debt-manager`
 * is mocked with an explicit export list by ~two-dozen orchestra tests, so adding
 * a new export there would silently become `undefined` inside those mocks and
 * break the phase paths that call it. This module is unmocked, and internally
 * calls the ALREADY-mocked `resolveDebt` / `readJsonSafe`, so every existing test
 * keeps its behaviour while both phases share one walk implementation.
 *
 * Sprint 365 (365-001).
 */

import { join } from 'node:path';
import { TASKS_DIR } from '../core/constants.js';
import type { Task } from '../core/types.js';
import { readJsonSafe } from '../core/utils.js';
import { resolveDebt } from './debt-manager.js';

/**
 * Resolve a priority-fix task's ENTIRE debt lineage: the immediate
 * `debt-<fixForTaskId>` PLUS every ancestor debt reached by walking the
 * `fixForTaskId` links up the task chain to its root.
 *
 * A fix-of-a-fix that lands DONE/GWTD must clear the WHOLE lineage. Resolving
 * only the immediate parent leaves the origin debt `active`, so it re-injects
 * every sprint — the multi-sprint pile-up 362-001-fix diagnosed. Before this
 * extraction the FIX phase had its own inline walk and the EVALUATE phase did a
 * single-parent resolve; they drifted (hand-re-synced twice: 362-001-fix,
 * 363-001-fix). Routing both through this one function prevents a third drift.
 *
 * `resolveDebt` is idempotent (no-op on a missing / already-resolved row), so
 * resolving the whole chain is safe; the `seen` set (seeded with the fix task
 * itself) bounds the walk against a malformed self / cyclic `fixForTaskId` and
 * guarantees the fix task's own `debt-<seedTaskId>` is never resolved here (its
 * residual is tracked separately by `handleEvaluation`). The walk stops when an
 * ancestor task file is absent (`readJsonSafe` → null → `fixForTaskId`
 * undefined), degrading to the prior single-resolve behaviour.
 *
 * @param projectRoot        Project root (locates `.tasks/` + the memory DB).
 * @param seedTaskId         The fix task itself — walk origin, never resolved here.
 * @param firstAncestorId    The fix task's `fixForTaskId` (first debt in the lineage).
 * @param resolvedInSprintId Sprint that resolved the lineage.
 */
export function resolveDebtChain(
  projectRoot: string,
  seedTaskId: string,
  firstAncestorId: string,
  resolvedInSprintId: string,
): void {
  const tasksPath = join(projectRoot, TASKS_DIR);
  const seen = new Set<string>([seedTaskId]);
  let ancestorId: string | undefined = firstAncestorId;
  while (ancestorId && !seen.has(ancestorId)) {
    seen.add(ancestorId);
    resolveDebt(projectRoot, `debt-${ancestorId}`, resolvedInSprintId);
    const ancestorTask: Task | null = readJsonSafe<Task>(join(tasksPath, `task-${ancestorId}.json`));
    ancestorId = ancestorTask?.fixForTaskId;
  }
}

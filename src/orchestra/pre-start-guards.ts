// ═══ Pre-Start Guards (born-672a GUARD-EXTRACT) ════════════════════
//
// Extracted from runPlanPhase (sprint-phases.ts) — Sprint 427 Task 18.
// Bundles the four safety/validation side-effects that MUST run before any
// worker spawns:
//   1. checkBuildStaleness — fail-soft build/mtime pre-flight
//   2. runPreSprintValidation — pre-spawn CI/tsc gate (hard gate)
//   3. beforeSprint plugin hooks — fail-soft
//   4. git rollback safety point — fail-soft (except a stash-pop failure)
//
// Bundled into one module + one entrypoint (runPreStartGuards) so a second
// call site (born-672b, the exact-snapshot start path in
// sprint-controller.ts) can run the identical guard sequence instead of
// skipping it — see .brain MASTER-PLAN debt note "born-672 (flag-on yol
// safety-point+pre-spawn-gate+hooks atlıyor)".
//
// NOTE: this module and sprint-phases.ts form a safe circular dependency —
// checkBuildStaleness's definition/export stays in sprint-phases.ts (an
// existing test imports it from there directly), while sprint-phases.ts
// calls runPreStartGuards from here. All cross-module references are
// inside function bodies (deferred execution), never at module
// initialization time — the same pattern sprint-phases.ts already
// documents for its relationship with sprint-controller.ts.

import type { ResolvedConfig, Sprint } from '../core/types.js';
import { SprintPhase } from '../core/types.js';
import { debugLog } from '../core/utils.js';

import { BrainError } from './sprint-lifecycle.js';

import type { SafetyPoint } from './rollback.js';
import {
  createSafetyPoint, saveSafetyPoint, isGitRepo, cleanOrphanSafetyPoint,
} from './rollback.js';

import {
  runHooks, runPreSprintValidation,
} from '../core/plugin-hooks.js';
import type { BeforeSprintContext, CiValidationResult } from '../core/plugin-hooks.js';

// Deferred (function-body-only) import — see NOTE above.
import { checkBuildStaleness } from './sprint-phases.js';

/** Result of running the pre-start guard sequence. */
export interface PreStartGuardsResult {
  /** Git rollback safety point, or null when rollback is disabled/unavailable. */
  safetyPoint: SafetyPoint | null;
}

/**
 * Run the four pre-start guards, IN ORDER, exactly as runPlanPhase ran them
 * before born-672a:
 *   1. checkBuildStaleness (fail-soft)
 *   2. runPreSprintValidation CI/tsc gate (THROWS BrainError on failure)
 *   3. beforeSprint plugin hooks (fail-soft)
 *   4. git rollback safety point (fail-soft, except a stash-pop failure —
 *      DECKENT_E057 — which is critical and propagates)
 *
 * Order and fail-soft/fail-hard behavior per guard MUST NOT change — a
 * caller depends on this being the exact sequence the PLAN phase always
 * ran (born-672a/b goCriteria: guard order/skip changes are a NO_GO).
 *
 * @throws {BrainError} When the CI/tsc gate fails
 * @throws {Error} When git safety-point creation hits a stash-pop failure
 */
export async function runPreStartGuards(
  projectRoot: string,
  sprint: Pick<Sprint, 'id' | 'tasks'>,
  config: ResolvedConfig,
  rollbackEnabled: boolean,
): Promise<PreStartGuardsResult> {
  // Sprint 156 Task 008: Pre-flight build-staleness check. Compares
  // dist/orchestra/sprint-phases.js mtime against the previous sprint's
  // .deckent/sprint-state.json mtime. Fail-safe — never throws.
  try { checkBuildStaleness(projectRoot, sprint.id); }
  catch (e) { debugLog('runPreStartGuards:checkBuildStaleness', e); }

  // Run pre-sprint CI validation — keeps the fast tsc gate; the SLOW full
  // pre-sprint vitest is skipped unless `pre_sprint_tests` is opted in (Sprint
  // 255: the full suite blocking SPAWN was the main sprint-start latency).
  const ciResult: CiValidationResult = runPreSprintValidation(
    projectRoot,
    sprint.id,
    config.pre_sprint_tests ? undefined : { track_test_count: false },
  );
  if (!ciResult.passed) {
    throw new BrainError(
      ciResult.blockedReason ?? 'CI validation failed — sprint blocked',
      SprintPhase.PLAN,
    );
  }

  // Run beforeSprint hooks after planning (non-fatal)
  try {
    const ctx: BeforeSprintContext = {
      hook: 'beforeSprint',
      sprintId: sprint.id,
      tasks: sprint.tasks,
      config,
      projectRoot,
    };
    await runHooks('beforeSprint', ctx);
  } catch (e) { debugLog('runPreStartGuards:beforeSprintHook', e); }

  // Create git safety point after planning but before workers spawn
  let safetyPoint: SafetyPoint | null = null;
  if (rollbackEnabled) {
    // Pre-check: clean up orphan safety points from previous sprints
    try {
      cleanOrphanSafetyPoint(projectRoot, sprint.id);
    } catch (e) { debugLog('runPreStartGuards:cleanOrphanSafetyPoint', e); }

    // Pre-check: verify git repo exists
    if (!isGitRepo(projectRoot)) {
      const msg = 'Rollback disabled: not a git repository. Run `git init` or set rollback_policy to "never".';
      debugLog('runPreStartGuards:noGitRepo', msg);
      // Visible warning — do not silently disable
      console.warn(`[rollback] ${msg}`);
    } else {
      try {
        safetyPoint = createSafetyPoint(projectRoot, sprint.id);
        saveSafetyPoint(projectRoot, safetyPoint);
      } catch (e) {
        // Stash pop failure (DECKENT_E057) is critical — propagate to abort sprint
        if (e instanceof Error && e.message.includes('Stash pop failed')) {
          throw e;
        }
        debugLog('runPreStartGuards:createSafetyPoint', e);
      }
    }
  }

  return { safetyPoint };
}

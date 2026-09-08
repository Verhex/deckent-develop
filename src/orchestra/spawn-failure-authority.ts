import { releaseSprintLock } from '../core/multi-ide.js';
import { clearActiveSprint } from './sprint-lifecycle.js';
import { clearPid } from './sprint-pid-manager.js';

/**
 * Retire the current coordinator's planning lease when startup recovery
 * refuses before a Sprint/PID authority exists.
 *
 * No execution effect belongs to the new run at this boundary. The prior
 * checkpoint, sprint state and exact-attempt custody therefore remain
 * untouched; `releaseSprintLock` itself additionally proves that this process
 * owns the lock before unlinking it.
 */
export function retireFailedPrePlanAuthority(projectRoot: string): void {
  releaseSprintLock(projectRoot);
  clearActiveSprint();
}

/**
 * Retire only live coordinator authority after SPAWN retry exhaustion.
 *
 * The caller must first contain partial Worker effects. Sprint state,
 * checkpoint, dashboard and task artifacts deliberately remain untouched:
 * canonical status needs them to expose an evidence-honest ORPHANED,
 * resumable execution instead of erasing the failure.
 */
export function retireFailedSpawnAuthority(
  projectRoot: string,
  sprintId: string,
): void {
  releaseSprintLock(projectRoot);
  clearActiveSprint();
  clearPid(projectRoot, sprintId, { preserveSnapshot: true });
}

/**
 * A fatal EXECUTE admission hold can happen after Docker dispatch has begun.
 * Unlike a terminal SPAWN failure, live effects are therefore not known to be
 * absent until the exact lifecycle owner proves containment. Never retire the
 * coordinator authority first: that would let read surfaces report ABORTED
 * while an owned worker can still be running.
 */
export async function containAndRetireFailedExecutionAuthority(
  projectRoot: string,
  sprintId: string,
  lifecycleAuthority: {
    reconcileExactLifecycle(mode: 'contain'): Promise<unknown>;
  },
): Promise<void> {
  await lifecycleAuthority.reconcileExactLifecycle('contain');
  retireFailedSpawnAuthority(projectRoot, sprintId);
}

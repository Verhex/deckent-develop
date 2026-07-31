import { releaseSprintLock } from '../core/multi-ide.js';
import { clearActiveSprint } from './sprint-lifecycle.js';
import { clearPid } from './sprint-pid-manager.js';

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
  clearPid(projectRoot, sprintId);
}

// ═══ Recover — Task-Artifact Settlement Helpers (row 3314) ════════
// The recover path used to archive task artifacts into a tasks-local directory
// (`.tasks/archive/<sprintId>`) while normal settlement archived into the brain
// archive, and it left non-terminal artifacts loose in the tasks root. Row 3314
// measured three manual consolidation moves in one night because of that split.
//
// This module is the recover path's consumer of the SINGLE archive authority in
// `orchestra/sprint-finalizer.ts`. It deliberately contains no path literal, no
// classification and no second resolver: it forwards the recovery report's own
// terminal/non-terminal classification into `archiveTaskArtifacts`, which owns
// the destination, the typed preservation marker and the zero-residue sweep.
//
// Layering: cli → orchestra is the allowed direction (ADR-D-004 C3).

import {
  archiveTaskArtifacts,
  resolveTaskArtifactArchiveDir,
  type TaskArtifactArchiveResult,
} from '../../orchestra/sprint-finalizer.js';

/**
 * Classification produced by the recovery path (`postFinalizeCleanup` /
 * `previewFinalizeCleanup` in `core/orphan-cleaner.ts`). What counts as
 * non-terminal remains that module's decision — this helper never reclassifies.
 */
export interface RecoveredTaskArtifactClassification {
  /** Artifact filenames the recovery classifier found terminal (DONE/NO_GO). */
  readonly archivedFiles: readonly string[];
  /** Artifact filenames the recovery classifier held as still active. */
  readonly preservedFiles: readonly string[];
}

/**
 * Settle a recovered sprint's task artifacts through the single archive
 * authority. Terminal artifacts land in the canonical destination, non-terminal
 * artifacts are preserved inside it under a typed marker, any pre-existing
 * tasks-local archive for the sprint is consolidated, and the tasks root is left
 * with no residue for that sprint — including hidden worker artifacts.
 *
 * Archive means move: this never deletes an artifact.
 */
export function settleRecoveredTaskArtifacts(
  projectRoot: string,
  sprintId: string,
  classification: RecoveredTaskArtifactClassification,
): TaskArtifactArchiveResult {
  return archiveTaskArtifacts(projectRoot, sprintId, {
    archive: classification.archivedFiles,
    preserve: classification.preservedFiles,
  });
}

/**
 * The canonical destination the recover path reports to the operator. Resolves
 * through the same authority the mutation uses, so a dry-run preview can never
 * name a directory the real run would not write.
 */
export function recoveredTaskArtifactDestination(projectRoot: string, sprintId: string): string {
  return resolveTaskArtifactArchiveDir(projectRoot, sprintId);
}

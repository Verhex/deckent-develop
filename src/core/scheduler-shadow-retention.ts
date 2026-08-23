/**
 * Scheduler-Shadow Journal Retention — age-based (mtime) archive policy.
 *
 * `.deckent/runtime/scheduler-shadow/*.jsonl` (see scheduler-journal.ts
 * SCHEDULER_SHADOW_DIR) accumulates one file per sprint indefinitely without
 * this module. Unlike sprint-file-retention.ts's keep_last_n/size_cap hybrid,
 * the criterion here is per-file mtime age: a journal older than
 * retention_days is moved to archive_path/, everything else is kept in place.
 *
 * Fail-soft, mirroring scheduler-journal.ts's "a journal write failure must
 * NEVER affect scheduling": every fs operation here is try/catch wrapped —
 * this module is a housekeeping side-path, never on the live scheduling
 * mainline, so it must never throw.
 *
 * @module scheduler-shadow-retention
 */

import {
  existsSync, readdirSync, statSync,
} from 'node:fs';
import { join } from 'node:path';
import type { SchedulerShadowRetentionConfig } from './config-types.js';
import {
  publishSprintArchiveArtifact,
  resolveSprintArchiveDir,
} from './sprint-archive.js';

/**
 * Directory scanned for scheduler-shadow JSONL journals. Redefined here
 * (not imported from orchestra/scheduler-journal.ts) to keep core/
 * independent of orchestra/ per ADR-D-004 C1 (lower layers never import
 * upward) — the literal path must stay in sync with SCHEDULER_SHADOW_DIR
 * in that module.
 */
const SCHEDULER_SHADOW_DIR = '.deckent/runtime/scheduler-shadow';

/** Default retention configuration: 14-day age window. */
export const DEFAULT_SCHEDULER_SHADOW_RETENTION_CONFIG: SchedulerShadowRetentionConfig = {
  retention_days: 14,
  archive_path: '.deckent/archive/scheduler-shadow/',
};

export interface SchedulerShadowRetentionResult {
  /** Archive destination paths for journals that were moved. */
  archived: string[];
  /** Filenames left in place (not stale enough to archive). */
  kept: string[];
  /** Total bytes freed from the source directory. */
  bytesFreed: number;
}

/**
 * Archive scheduler-shadow JSONL journals older than `retention_days`.
 *
 * Never throws: a missing shadow directory, an unreadable file, or a failed
 * move are all absorbed and reflected in the result (or silently skipped),
 * matching the fail-soft philosophy of the module this policy governs.
 */
export function archiveStaleSchedulerShadowJournals(
  root: string,
  config: Partial<SchedulerShadowRetentionConfig> = {},
  now: Date = new Date(),
): SchedulerShadowRetentionResult {
  const resolved: SchedulerShadowRetentionConfig = {
    ...DEFAULT_SCHEDULER_SHADOW_RETENTION_CONFIG,
    ...config,
  };

  const result: SchedulerShadowRetentionResult = {
    archived: [],
    kept: [],
    bytesFreed: 0,
  };

  const shadowDir = join(root, SCHEDULER_SHADOW_DIR);

  let entries: string[];
  try {
    if (!existsSync(shadowDir)) return result;
    entries = readdirSync(shadowDir);
  } catch {
    return result;
  }

  const journals = entries.filter(f => f.endsWith('.jsonl'));
  const retentionMs = resolved.retention_days * 24 * 60 * 60 * 1000;
  for (const filename of journals) {
    const srcPath = join(shadowDir, filename);

    let mtimeMs: number;
    let fileSize: number;
    try {
      const st = statSync(srcPath);
      if (!st.isFile()) continue;
      mtimeMs = st.mtimeMs;
      fileSize = st.size;
    } catch {
      continue;
    }

    const ageMs = now.getTime() - mtimeMs;
    if (ageMs <= retentionMs) {
      result.kept.push(filename);
      continue;
    }

    const sprintMatch = /^(sprint-\d+)\.jsonl$/u.exec(filename);
    try {
      let destination: string;
      if (sprintMatch?.[1]) {
        const publication = publishSprintArchiveArtifact(
          root,
          sprintMatch[1],
          srcPath,
          join('scheduler', filename),
          { retireSource: true },
        );
        destination = join(resolveSprintArchiveDir(root, sprintMatch[1]), publication.path);
      } else {
        // Non-sprint journals have no canonical ownership identity and remain
        // in place until an owner-specific migration can name one.
        result.kept.push(filename);
        continue;
      }
      result.archived.push(destination);
      result.bytesFreed += fileSize;
    } catch {
      // best-effort — leave file in place, do not crash
      result.kept.push(filename);
    }
  }

  return result;
}

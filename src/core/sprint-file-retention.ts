/**
 * Sprint File Retention — Hybrid keep_last_n + size_cap_mb policy.
 *
 * Sprint-prefixed files in .deckent/ (events, seq, checkpoint, gate, pre-archive)
 * accumulate indefinitely without this module. Retention enforces:
 *  1. keep_last_n: keep the N most-recent sprints, archive older ones
 *  2. size_cap_mb: if total sprint file size exceeds cap, archive oldest first
 *  3. Counter cleanup: -seq and -checkpoint-seq files are deleted on sprint DONE
 *  4. Forensic files: -layer3-scorecard.md etc. moved to docs/audits/sprint-NNN/
 *
 * @module sprint-file-retention
 * @since Sprint 150
 */

import {
  existsSync, readdirSync, statSync, renameSync, mkdirSync, unlinkSync,
  readFileSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { SprintFileRetentionConfig } from './config-types.js';

// ─── Constants ────────────────────────────────────────────────────────

/** Default retention configuration */
export const DEFAULT_RETENTION_CONFIG: SprintFileRetentionConfig = {
  keep_last_n: 2,
  size_cap_mb: 500,
  archive_path: '.deckent/archive/sprints/',
};

/** Sprint-prefixed file families (machine-generated) */
const SPRINT_FILE_PATTERNS = [
  /-events\.jsonl$/,
  /-metrics\.jsonl$/,
  /-seq$/,
  /-checkpoint\.json$/,
  /-checkpoint-seq$/,
  /-gate\.json$/,
  /-pre-archive\.tar\.gz$/,
  /-pre-archive\.sha256$/,
  /-panic-[^/]*\.json$/,
] as const;

/** Counter files that should be deleted (not archived) when sprint is DONE */
const COUNTER_PATTERNS = [
  /-seq$/,
  /-checkpoint-seq$/,
] as const;

/** Forensic/human-generated files that should move to docs/audits/ */
const FORENSIC_PATTERNS = [
  /-layer3-scorecard\.md$/,
  /-verifier-log\.md$/,
  /-session-starter\.md$/,
  /-emergency-assessment\.md$/,
] as const;

// ─── Types ────────────────────────────────────────────────────────────

export interface RetentionResult {
  /** Files moved to archive */
  archived: string[];
  /** Sprint IDs kept in .deckent/ root */
  kept: string[];
  /** Counter files deleted */
  countersDeleted: string[];
  /** Forensic files moved to docs/audits/ */
  forensicMoved: string[];
  /** Total bytes freed */
  bytesFreed: number;
}

// ─── Sprint ID Extraction ─────────────────────────────────────────────

const SPRINT_ID_RE = /^(sprint-\d+)-/;

/** Extract sprint ID from a sprint-prefixed filename. */
export function extractSprintId(filename: string): string | null {
  const m = filename.match(SPRINT_ID_RE);
  return m?.[1] ?? null;
}

/** Numeric sprint number from sprint ID (e.g. 'sprint-145' → 145). */
function sprintNumber(sprintId: string): number {
  const m = sprintId.match(/(\d+)$/);
  return m?.[1] ? parseInt(m[1], 10) : 0;
}

// ─── File Discovery ───────────────────────────────────────────────────

/** Check if a filename matches any sprint file family pattern. */
function isSprintFile(filename: string): boolean {
  return SPRINT_FILE_PATTERNS.some(re => re.test(filename));
}

/** Check if a filename matches a forensic file pattern. */
function isForensicFile(filename: string): boolean {
  return FORENSIC_PATTERNS.some(re => re.test(filename));
}

/** Check if a filename matches a counter file pattern. */
function isCounterFile(filename: string): boolean {
  return COUNTER_PATTERNS.some(re => re.test(filename));
}

/** List all sprint-prefixed files in .deckent/ root (not subdirectories). */
export function listSprintFiles(root: string): string[] {
  const deckentDir = join(root, '.deckent');
  if (!existsSync(deckentDir)) return [];
  return readdirSync(deckentDir).filter(f => {
    const fullPath = join(deckentDir, f);
    // Only regular files with sprint- prefix
    if (!f.startsWith('sprint-')) return false;
    try { return statSync(fullPath).isFile(); } catch { return false; }
  });
}

/** List all forensic sprint files in .deckent/ root. */
export function listForensicFiles(root: string): string[] {
  const deckentDir = join(root, '.deckent');
  if (!existsSync(deckentDir)) return [];
  return readdirSync(deckentDir).filter(f => {
    if (!f.startsWith('sprint-')) return false;
    try {
      return statSync(join(deckentDir, f)).isFile() && isForensicFile(f);
    } catch { return false; }
  });
}

/** Group sprint files by sprint ID. */
export function groupBySprintId(files: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const f of files) {
    const id = extractSprintId(f);
    if (!id) continue;
    if (!groups[id]) groups[id] = [];
    groups[id].push(f);
  }
  return groups;
}

/** Calculate total size in bytes of sprint files. */
function calculateTotalSize(root: string, files: string[]): number {
  const deckentDir = join(root, '.deckent');
  let total = 0;
  for (const f of files) {
    try { total += statSync(join(deckentDir, f)).size; } catch { /* skip */ }
  }
  return total;
}

// ─── Counter Cleanup ──────────────────────────────────────────────────

/**
 * Delete counter files (-seq, -checkpoint-seq) for a completed sprint.
 * These are ephemeral counters whose state is already captured in checkpoint.json.
 */
export function cleanupCounters(root: string, sprintId: string): string[] {
  const deckentDir = join(root, '.deckent');
  const deleted: string[] = [];
  if (!existsSync(deckentDir)) return deleted;

  const files = readdirSync(deckentDir).filter(f =>
    f.startsWith(`${sprintId}-`) && isCounterFile(f),
  );

  for (const f of files) {
    try {
      unlinkSync(join(deckentDir, f));
      deleted.push(f);
    } catch { /* best-effort */ }
  }
  return deleted;
}

// ─── Forensic File Migration ──────────────────────────────────────────

/**
 * Move forensic/human-generated sprint files to docs/audits/sprint-NNN/.
 * These are git-tracked artifacts that should not stay in the runtime .deckent/ dir.
 */
export function migrateForensicFiles(root: string): string[] {
  const forensicFiles = listForensicFiles(root);
  const moved: string[] = [];

  for (const f of forensicFiles) {
    const sprintId = extractSprintId(f);
    if (!sprintId) continue;

    const targetDir = join(root, 'docs', 'audits', sprintId);
    mkdirSync(targetDir, { recursive: true });

    const srcPath = join(root, '.deckent', f);
    // Strip sprint prefix for cleaner filenames in audit dir
    const cleanName = f.replace(`${sprintId}-`, '');
    const dstPath = join(targetDir, cleanName);

    try {
      renameSync(srcPath, dstPath);
      moved.push(dstPath);
    } catch {
      // Cross-device? Fall back to copy+delete
      try {
        writeFileSync(dstPath, readFileSync(srcPath));
        unlinkSync(srcPath);
        moved.push(dstPath);
      } catch { /* best-effort */ }
    }
  }
  return moved;
}

// ─── Main Retention Enforcement ───────────────────────────────────────

/**
 * Enforce sprint file retention policy.
 *
 * Strategy:
 * 1. List all sprint-prefixed machine files in .deckent/
 * 2. Group by sprint ID, sort chronologically
 * 3. Apply keep_last_n — sprints beyond window are archived
 * 4. Apply size_cap_mb — if remaining files exceed cap, archive more
 * 5. Archive = move to .deckent/archive/sprints/<sprint-id>/
 */
export function enforceRetention(
  root: string,
  config: Partial<SprintFileRetentionConfig> = {},
): RetentionResult {
  const resolved: SprintFileRetentionConfig = {
    ...DEFAULT_RETENTION_CONFIG,
    ...config,
  };

  const result: RetentionResult = {
    archived: [],
    kept: [],
    countersDeleted: [],
    forensicMoved: [],
    bytesFreed: 0,
  };

  // Step 1: List all sprint machine files (excluding forensic — handled separately)
  const allFiles = listSprintFiles(root);
  const machineFiles = allFiles.filter(f => isSprintFile(f));
  const grouped = groupBySprintId(machineFiles);

  // Sort sprint IDs chronologically (by sprint number)
  const sprintIds = Object.keys(grouped).sort((a, b) => sprintNumber(a) - sprintNumber(b));

  if (sprintIds.length === 0) {
    return result;
  }

  // Step 2: Determine which sprints to archive by keep_last_n
  const toArchiveByCount = sprintIds.length > resolved.keep_last_n
    ? sprintIds.slice(0, sprintIds.length - resolved.keep_last_n)
    : [];

  // Step 3: Archive by count threshold
  const archiveSet = new Set(toArchiveByCount);

  // Step 4: Check size cap on remaining files
  const keptIds = sprintIds.filter(id => !archiveSet.has(id));
  const keptFiles = keptIds.flatMap(id => grouped[id] ?? []);
  let totalSize = calculateTotalSize(root, keptFiles);
  const sizeCap = resolved.size_cap_mb * 1024 * 1024;

  // If over size cap, archive oldest kept sprints until under cap
  if (totalSize > sizeCap) {
    // Archive from oldest kept
    for (const id of [...keptIds]) {
      if (totalSize <= sizeCap) break;
      const sprintFiles = grouped[id] ?? [];
      const sprintSize = calculateTotalSize(root, sprintFiles);
      archiveSet.add(id);
      totalSize -= sprintSize;
    }
  }

  // Step 5: Execute archival
  const deckentDir = join(root, '.deckent');

  for (const sprintId of archiveSet) {
    const archiveDir = join(root, resolved.archive_path, sprintId);
    mkdirSync(archiveDir, { recursive: true });

    const sprintFiles = grouped[sprintId] ?? [];
    for (const f of sprintFiles) {
      const srcPath = join(deckentDir, f);
      if (!existsSync(srcPath)) continue;

      // Strip sprint-id prefix for cleaner archive names
      const cleanName = f.replace(`${sprintId}-`, '');
      const dstPath = join(archiveDir, cleanName);

      try {
        const fileSize = statSync(srcPath).size;
        renameSync(srcPath, dstPath);
        result.archived.push(dstPath);
        result.bytesFreed += fileSize;
      } catch {
        // Cross-device rename fallback
        try {
          const fileSize = statSync(srcPath).size;
          writeFileSync(dstPath, readFileSync(srcPath));
          unlinkSync(srcPath);
          result.archived.push(dstPath);
          result.bytesFreed += fileSize;
        } catch { /* best-effort */ }
      }
    }
  }

  // Compute kept list
  result.kept = sprintIds.filter(id => !archiveSet.has(id));

  return result;
}

// ─── Combined Retention Run ───────────────────────────────────────────

/**
 * Run full retention pipeline:
 * 1. Clean counters for the completed sprint
 * 2. Migrate forensic files to docs/audits/
 * 3. Enforce retention policy (keep_last_n + size_cap)
 */
export function runRetention(
  root: string,
  completedSprintId: string | null,
  config: Partial<SprintFileRetentionConfig> = {},
): RetentionResult {
  const result: RetentionResult = {
    archived: [],
    kept: [],
    countersDeleted: [],
    forensicMoved: [],
    bytesFreed: 0,
  };

  // 1. Clean counters for completed sprint
  if (completedSprintId) {
    result.countersDeleted = cleanupCounters(root, completedSprintId);
  }

  // 2. Migrate forensic files
  result.forensicMoved = migrateForensicFiles(root);

  // 3. Enforce retention
  const retention = enforceRetention(root, config);
  result.archived = retention.archived;
  result.kept = retention.kept;
  result.bytesFreed = retention.bytesFreed;

  return result;
}

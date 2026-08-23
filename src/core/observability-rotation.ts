// ═══ Observability Rotation ════════════════════════════════════════
// Size-based and sprint-based metrics file rotation.
// Archives to .deckent/archive/sprints/<sprintId>/metrics/
// Sprint 150 — Task 030

import {
  existsSync, readFileSync, writeFileSync, mkdirSync,
  statSync, readdirSync, unlinkSync, linkSync,
} from 'node:fs';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash, randomUUID } from 'node:crypto';
import { debugLog } from './utils.js';
import { discoverSprintArchiveIds, resolveSprintArchiveDir } from './sprint-archive.js';

// ─── Types ───────────────────────────────────────────────────────

export interface ObservabilityRotationConfig {
  /** Max size in MB before auto-rotate (default: 1) */
  maxSizeMB: number;
  /** Archive format (only gzip supported) */
  archiveFormat: 'gzip';
  /** Keep last N archived files (default: 10) */
  keepLastN: number;
}

export interface RotationResult {
  rotated: boolean;
  archivePath?: string;
  originalSizeBytes?: number;
  archivedSizeBytes?: number;
  pruned: string[];
}

// ─── Defaults ────────────────────────────────────────────────────

export const DEFAULT_ROTATION_CONFIG: ObservabilityRotationConfig = {
  maxSizeMB: 1,
  archiveFormat: 'gzip',
  keepLastN: 10,
};

// ─── Constants ───────────────────────────────────────────────────

const METRICS_FILENAME = 'metrics.jsonl';
const DECKENT_DIR = '.deckent';
const LEGACY_ARCHIVE_DIR = 'archive/metrics';

// ─── Core Functions ──────────────────────────────────────────────

/**
 * Rotate the metrics.jsonl file for a given sprint.
 * Compresses current content to gzip archive, truncates original.
 * Returns rotation result with archive path and sizes.
 */
export function rotateMetricsFile(
  root: string,
  sprintId: string,
  config: Partial<ObservabilityRotationConfig> = {},
): RotationResult {
  const opts = { ...DEFAULT_ROTATION_CONFIG, ...config };
  const metricsPath = join(root, DECKENT_DIR, METRICS_FILENAME);

  if (!existsSync(metricsPath)) {
    return { rotated: false, pruned: [] };
  }

  const stat = statSync(metricsPath);
  if (stat.size === 0) {
    return { rotated: false, pruned: [] };
  }

  // Read, compress, write archive
  const content = readFileSync(metricsPath);
  const gzipped = gzipSync(content);
  const digest = createHash('sha256').update(gzipped).digest('hex');
  const archiveBase = join(resolveSprintArchiveDir(root, sprintId), 'metrics');
  const archivePath = join(archiveBase, `metrics-${digest.slice(0, 16)}.jsonl.gz`);

  mkdirSync(archiveBase, { recursive: true });
  if (!existsSync(archivePath)) {
    const temporary = join(archiveBase, `.metrics-${process.pid}-${randomUUID()}.tmp`);
    try {
      writeFileSync(temporary, gzipped, { flag: 'wx' });
      if (!readFileSync(temporary).equals(gzipped)) throw new Error('METRICS_ARCHIVE_VERIFY_FAILED');
      try { linkSync(temporary, archivePath); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    } finally {
      try { unlinkSync(temporary); } catch { /* no temporary remained */ }
    }
  }
  if (!readFileSync(archivePath).equals(gzipped)) throw new Error('METRICS_ARCHIVE_CONFLICT');

  // Truncate original
  writeFileSync(metricsPath, '', 'utf-8');

  // Enforce keepLastN
  const pruned = enforceKeepLastN(root, opts.keepLastN);

  debugLog('observability-rotation', `Rotated ${stat.size} bytes → ${archivePath} (${gzipped.length} bytes gzipped), pruned ${pruned.length} old archives`);

  return {
    rotated: true,
    archivePath,
    originalSizeBytes: stat.size,
    archivedSizeBytes: gzipped.length,
    pruned,
  };
}

/**
 * Check if the metrics file exceeds the size threshold.
 * Returns true if rotation should be triggered.
 */
export function shouldRotate(
  root: string,
  config: Partial<ObservabilityRotationConfig> = {},
): boolean {
  const opts = { ...DEFAULT_ROTATION_CONFIG, ...config };
  const metricsPath = join(root, DECKENT_DIR, METRICS_FILENAME);

  if (!existsSync(metricsPath)) return false;

  const stat = statSync(metricsPath);
  const maxBytes = opts.maxSizeMB * 1024 * 1024;
  return stat.size >= maxBytes;
}

/**
 * Enforce keepLastN archive files.
 * Removes oldest archives beyond the limit.
 * Returns list of pruned file paths.
 */
export function enforceKeepLastN(root: string, keepLastN: number): string[] {
  const count = listArchives(root).length;
  if (count > keepLastN) {
    debugLog(
      'observability-rotation:retention',
      `Preserved ${count} immutable metric archives; sprint archive lifecycle owns retention (legacy keepLastN=${keepLastN})`,
    );
  }
  return [];
}

/**
 * Read and decompress an archived metrics file.
 * Returns the raw JSONL content as string.
 */
export function readArchivedMetrics(archivePath: string): string {
  if (!existsSync(archivePath)) {
    throw new Error(`Archive not found: ${archivePath}`);
  }
  const compressed = readFileSync(archivePath);
  const decompressed = gunzipSync(compressed);
  return decompressed.toString('utf-8');
}

/**
 * List all archived metrics files for a project.
 * Returns sorted list of archive file paths (oldest first).
 */
export function listArchives(root: string): string[] {
  const archives: string[] = [];
  const legacyBase = join(root, DECKENT_DIR, LEGACY_ARCHIVE_DIR);
  if (existsSync(legacyBase)) {
    archives.push(...readdirSync(legacyBase)
      .filter(file => file.startsWith('metrics-') && file.endsWith('.jsonl.gz'))
      .map(file => join(legacyBase, file)));
  }
  for (const sprintId of discoverSprintArchiveIds(root)) {
    const metricsDir = join(resolveSprintArchiveDir(root, sprintId), 'metrics');
    if (!existsSync(metricsDir)) continue;
    archives.push(...readdirSync(metricsDir)
      .filter(file => file.startsWith('metrics-') && file.endsWith('.jsonl.gz'))
      .map(file => join(metricsDir, file)));
  }
  return [...new Set(archives)].sort();
}

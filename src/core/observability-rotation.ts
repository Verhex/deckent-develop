// ═══ Observability Rotation ════════════════════════════════════════
// Size-based and sprint-based metrics file rotation.
// Archives to .deckent/archive/metrics/metrics-<sprintId>.jsonl.gz
// Sprint 150 — Task 030

import {
  existsSync, readFileSync, writeFileSync, mkdirSync,
  statSync, readdirSync, unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { debugLog } from './utils.js';

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
const ARCHIVE_DIR = 'archive/metrics';

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
  const archiveBase = join(root, DECKENT_DIR, ARCHIVE_DIR);
  const archivePath = join(archiveBase, `metrics-${sprintId}.jsonl.gz`);

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

  mkdirSync(archiveBase, { recursive: true });
  writeFileSync(archivePath, gzipped);

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
  const archiveBase = join(root, DECKENT_DIR, ARCHIVE_DIR);
  if (!existsSync(archiveBase)) return [];

  const files = readdirSync(archiveBase)
    .filter(f => f.startsWith('metrics-') && f.endsWith('.jsonl.gz'))
    .sort(); // lexicographic sort = chronological for sprint-NNN naming

  const pruned: string[] = [];
  if (files.length > keepLastN) {
    const toRemove = files.slice(0, files.length - keepLastN);
    for (const file of toRemove) {
      const fullPath = join(archiveBase, file);
      try {
        unlinkSync(fullPath);
        pruned.push(fullPath);
      } catch (e) {
        debugLog('observability-rotation:prune', `Failed to remove ${fullPath}: ${e}`);
      }
    }
  }

  return pruned;
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
  const archiveBase = join(root, DECKENT_DIR, ARCHIVE_DIR);
  if (!existsSync(archiveBase)) return [];

  return readdirSync(archiveBase)
    .filter(f => f.startsWith('metrics-') && f.endsWith('.jsonl.gz'))
    .sort()
    .map(f => join(archiveBase, f));
}

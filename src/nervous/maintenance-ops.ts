// src/nervous/maintenance-ops.ts
//
// Real, standalone maintenance operations behind the nervous low-risk action
// handlers (LOG_ROTATION / CACHE_INVALIDATE / IPC_DIR_CLEANUP /
// DEAD_EVENT_STREAM_CLEANUP / DEBT_TRENDING_REPORT). Each is projectRoot-scoped,
// dependency-light, and safe to run without a live sprint/coordinator — so the
// default action-handler deps perform a genuine effect instead of a no-op.
//
// These own resources the nervous system is allowed to maintain autonomously
// (transient IPC markers, oversized logs, the docs cache, a corrupt event file,
// a trend report) — distinct from the resource-recommendation surface, which
// only proposes (ADR-037).

import {
  existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, rmSync, statSync,
} from 'node:fs';
import { join } from 'node:path';
import { clearDocCache } from '../orchestra/managed-docs/doc-cache.js';
import { NERVOUS_IPC_DIR, PANIC_IPC_DIR, RECENT_WORKS_DIR } from '../core/constants.js';

const DECKENT_DIR = '.deckent';

// ─── LOG_ROTATION ────────────────────────────────────────────────────────────

/**
 * Archive sprint logs (`.brain/sprints/sprint-NNN.md`) beyond the newest `keep`,
 * moving the older ones into `.brain/sprints/archive/`. Sorted by the numeric
 * sprint id (robust to non-zero-padded names). Reversible (move, not delete).
 * Returns the count archived; 0 when the dir is absent or at/under `keep`.
 */
export function rotateSprintLogs(projectRoot: string, keep = 20): number {
  const dir = join(projectRoot, '.brain', 'sprints');
  if (!existsSync(dir)) return 0;
  const logs = readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ f, n: Number((f.match(/sprint-(\d+)/) ?? [])[1] ?? -1) }))
    .sort((a, b) => a.n - b.n); // ascending → oldest first
  if (logs.length <= keep) return 0;

  const archiveDir = join(dir, 'archive');
  if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });
  const toArchive = logs.slice(0, logs.length - keep);
  let moved = 0;
  for (const { f } of toArchive) {
    try {
      renameSync(join(dir, f), join(archiveDir, f));
      moved++;
    } catch {
      // a single un-movable log must not abort the rotation
    }
  }
  return moved;
}

// ─── CACHE_INVALIDATE ────────────────────────────────────────────────────────

/**
 * Invalidate the managed-docs content-hash cache (ADR-031) — the only persisted
 * cache deckent owns. cacheType 'all' | 'docs' clears it (canonical clearDocCache:
 * drops entries, preserves the self-documenting file). Other types ('build',
 * 'routing') have no persisted cache, so they are an accurate no-op (not debt).
 */
export function invalidateDocCache(projectRoot: string, cacheType: string): void {
  if (cacheType === 'all' || cacheType === 'docs') {
    clearDocCache(projectRoot);
  }
}

// ─── IPC_DIR_CLEANUP ─────────────────────────────────────────────────────────

/**
 * Remove orphan IPC marker files older than `maxAgeMs` from the nervous + panic
 * IPC dirs (consumed/abandoned markers). Default cutoff 1h — a marker older than
 * that has been processed or abandoned. Returns the count removed.
 */
export function cleanIpcDirs(projectRoot: string, maxAgeMs = 60 * 60 * 1000): number {
  const dirs = [
    join(projectRoot, NERVOUS_IPC_DIR, 'pending'),
    join(projectRoot, PANIC_IPC_DIR, 'pending'),
    join(projectRoot, PANIC_IPC_DIR, 'resolved'),
  ];
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      const path = join(dir, f);
      try {
        if (statSync(path).mtimeMs < cutoff) {
          rmSync(path, { force: true });
          removed++;
        }
      } catch {
        // skip an un-statable / un-removable entry
      }
    }
  }
  return removed;
}

// ─── DEAD_EVENT_STREAM_CLEANUP ───────────────────────────────────────────────

/**
 * Prune corrupt (unparseable) lines from a sprint event stream
 * (`.deckent/recently-works/<sprintId>-events.jsonl`), rewriting only the valid JSON events.
 * Returns the count of dropped lines; 0 when the file is absent or already clean.
 */
export function pruneDeadEventStream(projectRoot: string, sprintId: string): number {
  const path = join(projectRoot, RECENT_WORKS_DIR, `${sprintId}-events.jsonl`);
  if (!existsSync(path)) return 0;
  const lines = readFileSync(path, 'utf-8').split('\n').filter((l) => l.trim().length > 0);
  const valid: string[] = [];
  let dropped = 0;
  for (const line of lines) {
    try {
      JSON.parse(line);
      valid.push(line);
    } catch {
      dropped++;
    }
  }
  if (dropped > 0) {
    writeFileSync(path, valid.length > 0 ? valid.join('\n') + '\n' : '', 'utf-8');
  }
  return dropped;
}

// ─── DEBT_TRENDING_REPORT ────────────────────────────────────────────────────

/** Count open debt entries from the debt export (markdown table rows). */
function countOpenDebt(projectRoot: string): number {
  const path = join(projectRoot, '.brain', 'exports', 'debt.md');
  if (!existsSync(path)) return 0;
  const content = readFileSync(path, 'utf-8');
  if (/no active technical debt/i.test(content)) return 0;
  // table rows: lines starting with '|', excluding the separator row(s); the
  // first remaining '|'-line is the header, the rest are data rows.
  const rows = content
    .split('\n')
    .filter((l) => /^\s*\|/.test(l) && !/^\s*\|[\s:|-]+\|?\s*$/.test(l));
  return rows.length > 1 ? rows.length - 1 : 0;
}

/**
 * Append a dated debt snapshot to `.deckent/reports/debt-trend.jsonl` and rewrite
 * a human-readable `.deckent/reports/debt-trend.md` time-series table. Each call
 * adds one data point, so the report is a genuine trend (not a single snapshot).
 * Returns the markdown report path.
 */
export function generateDebtTrendReport(projectRoot: string): string {
  const reportsDir = join(projectRoot, DECKENT_DIR, 'reports');
  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
  const jsonlPath = join(reportsDir, 'debt-trend.jsonl');
  const mdPath = join(reportsDir, 'debt-trend.md');

  const snapshot = { ts: new Date().toISOString(), openCount: countOpenDebt(projectRoot) };
  writeFileSync(
    jsonlPath,
    (existsSync(jsonlPath) ? readFileSync(jsonlPath, 'utf-8') : '') + JSON.stringify(snapshot) + '\n',
    'utf-8',
  );

  const snaps = readFileSync(jsonlPath, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((l) => { try { return JSON.parse(l) as { ts: string; openCount: number }; } catch { return null; } })
    .filter((s): s is { ts: string; openCount: number } => s !== null)
    .slice(-30);

  const rows = snaps.map((s) => `| ${s.ts} | ${s.openCount} |`).join('\n');
  const md = `# Technical Debt Trend\n\n_Generated by the nervous DEBT_TRENDING_REPORT action._\n\n| Timestamp | Open debt |\n|-----------|-----------|\n${rows}\n`;
  writeFileSync(mdPath, md, 'utf-8');
  return mdPath;
}

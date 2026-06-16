// src/orchestra/autonomous/backlog.ts
// Durable backlog store. Single source of truth for autonomous work items.
// ADR-010 (no new dep): hand-written validation, mirrors validateCostConfig style.
import { existsSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteFileSync } from '../../agents/worker-lifecycle.js';
import { TASKS_DIR } from '../../core/constants.js';
import type { BacklogEntry, BacklogFile, BacklogStatus } from './backlog-types.js';
import { nextRun } from './scheduled-flow.js';

const KINDS = new Set(['task', 'sprint', 'capability', 'process']);
const POLICIES = new Set(['auto', 'approval-required', 'risk-tagged']);
const STATUSES = new Set(['pending', 'running', 'parked', 'done', 'failed']);
const TRIGGER_TYPES = new Set(['recurring', 'one-off', 'reactive']);

/** Returns an error string describing the first violation, or null when valid. */
export function validateBacklogEntry(e: unknown): string | null {
  if (!e || typeof e !== 'object') return 'entry must be an object';
  const r = e as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return 'entry.id must be a non-empty string';
  if (typeof r.title !== 'string' || !r.title.trim()) return `entry.${r.id}.title must be a non-empty string`;
  if (!KINDS.has(r.kind as string)) return `entry.${r.id}.kind must be task|sprint|capability|process`;
  if (!POLICIES.has(r.policy as string)) return `entry.${r.id}.policy must be auto|approval-required|risk-tagged`;
  if (!STATUSES.has(r.status as string)) return `entry.${r.id}.status invalid`;
  const t = r.trigger as Record<string, unknown> | undefined;
  if (!t || !TRIGGER_TYPES.has(t.type as string)) return `entry.${r.id}.trigger.type invalid`;
  if (t.type === 'recurring' && typeof t.cron !== 'string') return `entry.${r.id}.trigger.cron required`;
  if (t.type === 'reactive' && typeof t.detector !== 'string') return `entry.${r.id}.trigger.detector required`;
  if (!r.spec || typeof r.spec !== 'object' || Array.isArray(r.spec)) return `entry.${r.id}.spec must be a plain object`;
  if (r.kind === 'capability') {
    const target = (r.spec as Record<string, unknown>).capabilityTarget as Record<string, unknown> | undefined;
    if (!target || typeof target !== 'object') return `entry.${r.id}.spec.capabilityTarget required for kind=capability`;
    if (typeof target.capability !== 'string' || !target.capability.trim()) {
      return `entry.${r.id}.spec.capabilityTarget.capability must be a non-empty string`;
    }
  }
  if (r.fanOut !== undefined) {
    const f = r.fanOut as Record<string, unknown>;
    if (!f || typeof f !== 'object' || typeof f.over !== 'string' || !f.over.trim() || !Number.isInteger(f.concurrency) || (f.concurrency as number) < 1) {
      return `entry.${r.id}.fanOut must be { over: string, concurrency: number>=1 }`;
    }
  }
  if (r.planned !== undefined && typeof r.planned !== 'boolean') return `entry.${r.id}.planned must be boolean`;
  if (r.summary !== undefined && typeof r.summary !== 'string') return `entry.${r.id}.summary must be a string`;
  return null;
}

/** Load + validate the backlog. Missing file → empty backlog (fresh project). */
export function loadBacklog(path: string): BacklogFile {
  if (!existsSync(path)) return { _version: '1.0', entries: [] };
  let raw: BacklogFile;
  try {
    raw = JSON.parse(readFileSync(path, 'utf-8')) as BacklogFile;
  } catch (e) {
    throw new Error(`backlog file at ${path} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!Array.isArray(raw.entries)) throw new Error('backlog.entries must be an array');
  for (const e of raw.entries) {
    const err = validateBacklogEntry(e);
    if (err) throw new Error(`Invalid backlog entry: ${err}`);
  }
  return { _version: typeof raw._version === 'string' ? raw._version : '1.0', entries: raw.entries };
}

/**
 * Pending entries that are due now and should be dispatched by the engine.
 * Surfaces every `pending` entry regardless of trigger type:
 *   - `one-off`   — explicit one-shot, due as soon as pending
 *   - `reactive`  — written by the reactive ingester, due once pending
 *   - `recurring` — cron cadence is gated at FLIP time by `reenqueueRecurring`
 *     (done→pending only when the next run after `lastRun` has arrived), so a
 *     pending recurring entry means "due now". A freshly added recurring entry
 *     is pending = first run immediate, matching reenqueueRecurring's
 *     epoch-seeded semantics for never-run entries.
 */
export function queryDue(bl: BacklogFile, _now: Date): BacklogEntry[] {
  return bl.entries.filter((e) => e.status === 'pending');
}

/** Mutate one entry's status + lastResult and write the whole backlog atomically. */
export function updateStatus(
  path: string,
  bl: BacklogFile,
  id: string,
  status: BacklogStatus,
  lastResult: BacklogEntry['lastResult'],
): void {
  const e = bl.entries.find((x) => x.id === id);
  if (!e) throw new Error(`backlog entry ${id} not found`);
  e.status = status;
  // lastRun records run COMPLETION (set only when a non-null lastResult is supplied),
  // NOT run start. This is intentional: a partial/interrupted run does not advance lastRun,
  // so the scheduler can re-trigger the entry correctly on the next cycle.
  if (lastResult !== null) { e.lastResult = lastResult; e.lastRun = new Date().toISOString(); }
  atomicWriteFileSync(path, JSON.stringify(bl, null, 2));
}

/**
 * Purge done/failed backlog entries, keeping only the `keepRuns` most recently
 * completed ones (by `lastRun` timestamp). Active entries (pending/running/parked)
 * are never touched. Mutates `bl.entries` in place and writes atomically.
 *
 * Resolves AUT-6: completed entries accumulate forever without this cleanup pass.
 */
export function purgeCompletedBacklog(
  path: string,
  bl: BacklogFile,
  keepRuns = 5,
): void {
  const TERMINAL: ReadonlySet<BacklogStatus> = new Set(['done', 'failed']);
  const active = bl.entries.filter((e) => !TERMINAL.has(e.status));
  const completed = bl.entries.filter((e) => TERMINAL.has(e.status));
  // Sort most-recent first (null lastRun sorts to the end, i.e. treated as oldest)
  completed.sort((a, b) => (b.lastRun ?? '').localeCompare(a.lastRun ?? ''));
  bl.entries = [...active, ...completed.slice(0, keepRuns)];
  atomicWriteFileSync(path, JSON.stringify(bl, null, 2));
}

/**
 * Remove stale autonomous task artifacts from the tasks directory:
 *   - `task-run-*`  — per-run task files created by the autonomous execute-dispatcher
 *   - `_*.pid`      — launch PID bookkeeping files left by autonomous worker spawns
 *
 * Fail-safe: per-file errors are silently swallowed; a missing directory is a no-op.
 * Resolves AUT-6 (PID-1 finding): autonomous artifacts never cleaned up otherwise.
 * Returns the number of artifact files removed (so callers can report a count).
 */
export function cleanupAutonomousArtifacts(
  projectRoot: string,
  tasksDir: string = TASKS_DIR,
): number {
  const dir = join(projectRoot, tasksDir);
  if (!existsSync(dir)) return 0;
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const file of files) {
    if (!file.startsWith('task-run-') && !/^_.*\.pid$/.test(file)) continue;
    try {
      unlinkSync(join(dir, file));
      removed += 1;
    } catch {
      // per-file errors ignored — cleanup is best-effort
    }
  }
  return removed;
}

/**
 * Re-enqueue completed recurring backlog entries whose next cron cadence has arrived.
 *
 * For each recurring entry in `done` status, computes the next scheduled run after
 * `lastRun` (or epoch if never run). If that computed time is at or before `now`,
 * the entry is reset to `pending` so the FlowScheduler can dispatch it again.
 *
 * Fail-safe: a malformed cron expression is caught — the entry is left `done` and a
 * warning is logged; this function never throws.
 *
 * Pure function: returns a new BacklogFile without disk I/O. The caller persists if needed.
 * Non-recurring and non-done entries are returned unchanged.
 */
export function reenqueueRecurring(bl: BacklogFile, now: Date): BacklogFile {
  const entries = bl.entries.map((e) => {
    if (e.trigger.type !== 'recurring' || e.status !== 'done') return e;
    const cron = e.trigger.cron;
    // Seed from last completion time; fall back to epoch when the entry has never run.
    const from = e.lastRun ? new Date(e.lastRun) : new Date(0);
    let due: Date;
    try {
      due = nextRun(cron, from);
    } catch (err) {
      // Malformed cron — leave entry done, log, never throw.
      console.warn(
        `[backlog] reenqueueRecurring: malformed cron "${cron}" for entry ${e.id}:`,
        err instanceof Error ? err.message : String(err),
      );
      return e;
    }
    if (due > now) return e; // next run is still in the future
    return { ...e, status: 'pending' as BacklogStatus };
  });
  return { ...bl, entries };
}

/**
 * Disk-persisting wrapper around `reenqueueRecurring`: applies the flip and
 * writes the backlog atomically ONLY when at least one entry changed (so idle
 * ticks never rewrite the file). Returns the (possibly new) BacklogFile.
 *
 * This is the production call-site contract for the engine's backlog loader —
 * it closes the function-level dormant seam (capability-maturity gap #1).
 */
export function applyRecurringReenqueue(path: string, bl: BacklogFile, now: Date): BacklogFile {
  const next = reenqueueRecurring(bl, now);
  const changed = next.entries.some((e, i) => e !== bl.entries[i]);
  if (changed) atomicWriteFileSync(path, JSON.stringify(next, null, 2));
  return changed ? next : bl;
}

/**
 * Enqueue work-generator candidates into the backlog. Dedupe is by id against
 * entries of ANY status (a done/failed `wg-*` entry must not re-enqueue while
 * its source marker still exists) and within the batch itself. Invalid
 * candidates are skipped with a warning — this path is fed by generators and
 * must never throw. Mutates `bl.entries`, persists atomically only when at
 * least one candidate was accepted, and returns the newly enqueued entries.
 */
export function enqueueCandidates(
  path: string,
  bl: BacklogFile,
  candidates: BacklogEntry[],
): BacklogEntry[] {
  const seen = new Set(bl.entries.map((e) => e.id));
  const fresh: BacklogEntry[] = [];
  for (const c of candidates) {
    if (seen.has(c.id)) continue;
    const err = validateBacklogEntry(c);
    if (err) {
      console.warn(`[backlog] enqueueCandidates: skipping invalid candidate: ${err}`);
      continue;
    }
    seen.add(c.id);
    fresh.push(c);
  }
  if (fresh.length === 0) return [];
  bl.entries.push(...fresh);
  atomicWriteFileSync(path, JSON.stringify(bl, null, 2));
  return fresh;
}

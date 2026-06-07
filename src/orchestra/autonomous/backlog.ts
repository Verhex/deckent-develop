// src/orchestra/autonomous/backlog.ts
// Durable backlog store. Single source of truth for autonomous work items.
// ADR-010 (no new dep): hand-written validation, mirrors validateCostConfig style.
import { existsSync, readFileSync } from 'node:fs';
import { atomicWriteFileSync } from '../../agents/worker-lifecycle.js';
import type { BacklogEntry, BacklogFile, BacklogStatus } from './backlog-types.js';

const KINDS = new Set(['task', 'sprint']);
const POLICIES = new Set(['auto', 'approval-required', 'risk-tagged']);
const STATUSES = new Set(['pending', 'running', 'parked', 'done', 'failed']);
const TRIGGER_TYPES = new Set(['recurring', 'one-off', 'reactive']);

/** Returns an error string describing the first violation, or null when valid. */
export function validateBacklogEntry(e: unknown): string | null {
  if (!e || typeof e !== 'object') return 'entry must be an object';
  const r = e as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return 'entry.id must be a non-empty string';
  if (typeof r.title !== 'string' || !r.title.trim()) return `entry.${r.id}.title must be a non-empty string`;
  if (!KINDS.has(r.kind as string)) return `entry.${r.id}.kind must be task|sprint`;
  if (!POLICIES.has(r.policy as string)) return `entry.${r.id}.policy must be auto|approval-required|risk-tagged`;
  if (!STATUSES.has(r.status as string)) return `entry.${r.id}.status invalid`;
  const t = r.trigger as Record<string, unknown> | undefined;
  if (!t || !TRIGGER_TYPES.has(t.type as string)) return `entry.${r.id}.trigger.type invalid`;
  if (t.type === 'recurring' && typeof t.cron !== 'string') return `entry.${r.id}.trigger.cron required`;
  if (t.type === 'reactive' && typeof t.detector !== 'string') return `entry.${r.id}.trigger.detector required`;
  if (!r.spec || typeof r.spec !== 'object' || Array.isArray(r.spec)) return `entry.${r.id}.spec must be a plain object`;
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
 * Surfaces `trigger.type === 'one-off'` (explicit one-shot) and
 * `trigger.type === 'reactive'` (written by the reactive ingester — always
 * due once pending). Recurring-entry timing is owned by the FlowScheduler
 * in the trigger layer; `trigger.type === 'recurring'` entries are not
 * surfaced here (the scheduler manages their cron cadence).
 */
export function queryDue(bl: BacklogFile, _now: Date): BacklogEntry[] {
  return bl.entries.filter(
    (e) => e.status === 'pending' && (e.trigger.type === 'one-off' || e.trigger.type === 'reactive'),
  );
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

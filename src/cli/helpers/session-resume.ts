// ─── TERM-RESUME — recent-session listing + picker core (Sprint 357 Task 007) ──
//
// Pure data+selection core for the terminal's startup "recent session" teaser
// and the `/resume` picker (MASTER-PLAN row 50, TERM-RESUME). Render/Ink wiring
// is explicit follow-up work — this module never formats a user-facing string,
// so it stays reusable from any surface (Ink, plain stdout, a future dashboard
// bridge) without an i18n dependency.
//
// Source: `.deckent/runtime/jobs/*.json` (JOBS_DIR) — the disk-verified session
// trace. Each sprint run's job file carries `jobId` + `status` + `startedAt` from
// the moment it starts; `sprintId` (human id) and `completedAt`/`summary` land
// once the run reaches a numbered sprint / finishes. A record missing every
// usable id/date field, or a file that fails to parse, is skipped rather than
// surfaced — the teaser degrades to a shorter (or empty) list, never a crash.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JOBS_DIR } from '../../core/constants.js';

// ─── Public types ───────────────────────────────────────────────────────────

export interface SessionRecord {
  readonly id: string;
  readonly title: string;
  /** ISO 8601 UTC timestamp. */
  readonly date: string;
  readonly status: string;
}

export type PickResult =
  | { readonly kind: 'found'; readonly session: SessionRecord }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'ambiguous'; readonly matches: readonly SessionRecord[] };

// ─── Raw on-disk shape ──────────────────────────────────────────────────────
// Deliberately permissive: the job writer (orchestra/) may add fields over
// time, and legacy job files predate `sprintId`/`summary`/`completedAt`.

interface RawJob {
  jobId?: unknown;
  sprintId?: unknown;
  status?: unknown;
  summary?: unknown;
  startedAt?: unknown;
  completedAt?: unknown;
  endedAt?: unknown;
}

// ─── Pure core: single-record parsing ──────────────────────────────────────

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function firstValidDate(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value))) {
      return value;
    }
  }
  return undefined;
}

/** Parses one job file's raw text into a SessionRecord, or null when corrupt/unusable. */
export function parseSessionRecord(raw: string): SessionRecord | null {
  let job: RawJob;
  try {
    job = JSON.parse(raw) as RawJob;
  } catch {
    return null;
  }
  if (typeof job !== 'object' || job === null) return null;

  const id = firstNonEmptyString(job.sprintId, job.jobId);
  const status = typeof job.status === 'string' && job.status.length > 0 ? job.status : undefined;
  const date = firstValidDate(job.completedAt, job.endedAt, job.startedAt);
  if (id === undefined || status === undefined || date === undefined) return null;

  const title = firstNonEmptyString(job.summary, job.sprintId, job.jobId) as string;
  return { id, title, date, status };
}

// ─── listRecentSessions ─────────────────────────────────────────────────────

/**
 * Lists the `n` most recent sprint sessions (newest first) found under
 * `<root>/.deckent/runtime/jobs/`. Degrade-safe: a missing jobs directory,
 * an unreadable directory, or `n <= 0` all yield `[]` — never a throw, so the
 * startup teaser can call this unconditionally and simply not render when empty.
 */
export function listRecentSessions(root: string, n: number): SessionRecord[] {
  if (n <= 0) return [];

  const jobsDir = join(root, JOBS_DIR);
  if (!existsSync(jobsDir)) return [];

  let files: string[];
  try {
    files = readdirSync(jobsDir).filter(f => f.endsWith('.json'));
  } catch {
    return [];
  }

  const records: SessionRecord[] = [];
  for (const file of files) {
    let raw: string;
    try {
      raw = readFileSync(join(jobsDir, file), 'utf-8');
    } catch {
      continue;
    }
    const record = parseSessionRecord(raw);
    if (record !== null) records.push(record);
  }

  records.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  return records.slice(0, n);
}

// ─── pickSession ─────────────────────────────────────────────────────────

/**
 * Resolves a `/resume` argument against an already-fetched session list.
 * Match order: 1-based number (position in `sessions`) -> exact id ->
 * case-insensitive title-prefix. Never throws; ambiguous title-prefix or
 * duplicate-id matches report `{kind:'ambiguous', matches}` instead of
 * silently picking the first hit.
 */
export function pickSession(input: string, sessions: readonly SessionRecord[]): PickResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) return { kind: 'not-found' };

  if (/^\d+$/.test(trimmed)) {
    const index = Number.parseInt(trimmed, 10) - 1;
    const hit = sessions[index];
    return hit ? { kind: 'found', session: hit } : { kind: 'not-found' };
  }

  const idMatches = sessions.filter(s => s.id === trimmed);
  if (idMatches.length === 1) return { kind: 'found', session: idMatches[0] as SessionRecord };
  if (idMatches.length > 1) return { kind: 'ambiguous', matches: idMatches };

  const lowerInput = trimmed.toLowerCase();
  const titleMatches = sessions.filter(s => s.title.toLowerCase().startsWith(lowerInput));
  if (titleMatches.length === 1) return { kind: 'found', session: titleMatches[0] as SessionRecord };
  if (titleMatches.length > 1) return { kind: 'ambiguous', matches: titleMatches };

  return { kind: 'not-found' };
}

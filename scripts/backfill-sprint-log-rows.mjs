#!/usr/bin/env node
/**
 * backfill-sprint-log-rows.mjs — Reconstruct missing `sprint-log-<num>`
 * rows in `.brain/memory.db` from on-disk archives.
 *
 * Sprint 198 198-002 — Sprint 194 + 196 finalize left no `sprint-log-*`
 * row in memory.db (Sprint 194 halted pre-finalize; Sprint 196 mid-
 * finalize crash). This breaks downstream tools like
 * `scripts/sprint-retroactive-reclassify.mjs` which need the sprint
 * entry to land Task Outcomes. This script rebuilds the missing rows.
 *
 * Sources (best-effort, missing sources do not abort):
 *   1. `.brain/archive/sprint-NNN-tasks/task-*.result` — task outcomes
 *   2. `.deckent/archive/sprints/sprint-NNN/metrics.jsonl` — totals/dur
 *   3. `.brain/archive/DIRECTIVES-sprint-NNN.md` — sprint title fallback
 *
 * Usage:
 *   node scripts/backfill-sprint-log-rows.mjs --sprint sprint-194
 *   node scripts/backfill-sprint-log-rows.mjs --all-missing
 *   node scripts/backfill-sprint-log-rows.mjs --sprint sprint-196 --dry-run
 *
 * Options:
 *   --sprint <id>          Single sprint id (sprint-NNN)
 *   --all-missing          Scan archives, write all sprints lacking rows
 *   --db <path>            memory.db path (default: .brain/memory.db)
 *   --brain-archive <path> brain archive dir (default: .brain/archive)
 *   --deckent-archive <p>  deckent sprints archive (default: .deckent/archive/sprints)
 *   --dry-run              Print plan, do not write
 *
 * Exit codes: 0 OK · 1 missing inputs / write error.
 */

import Database from 'better-sqlite3';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const TASK_RESULT_RE = /^task-([0-9A-Za-z_.\-]+)\.result$/;
const SPRINT_DIR_RE = /^sprint-(\d+)-tasks$/;
const SPRINT_ID_RE = /^sprint-(\d+)$/;

/** Parse argv into a flag map. Repeated flags overwrite. */
export function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      opts[key] = true;
    } else {
      opts[key] = next;
      i++;
    }
  }
  return opts;
}

/**
 * List sprint IDs that have on-disk archives under
 * `.brain/archive/sprint-NNN-tasks/` or `.deckent/archive/sprints/sprint-NNN/`.
 * Returns canonical sprint-NNN strings sorted ascending by sprint number.
 */
export function discoverArchivedSprints(brainArchive, deckentArchive) {
  const ids = new Set();
  if (existsSync(brainArchive)) {
    for (const name of readdirSync(brainArchive)) {
      const m = name.match(SPRINT_DIR_RE);
      if (m) ids.add(`sprint-${parseInt(m[1], 10)}`);
    }
  }
  if (existsSync(deckentArchive)) {
    for (const name of readdirSync(deckentArchive)) {
      const m = name.match(SPRINT_ID_RE);
      if (m) {
        const full = join(deckentArchive, name);
        try {
          if (statSync(full).isDirectory()) {
            ids.add(`sprint-${parseInt(m[1], 10)}`);
          }
        } catch {
          // ignore unreadable entries
        }
      }
    }
  }
  return [...ids].sort((a, b) => {
    const na = parseInt(a.replace(/\D/g, ''), 10);
    const nb = parseInt(b.replace(/\D/g, ''), 10);
    return na - nb;
  });
}

/**
 * Parse `.brain/archive/sprint-NNN-tasks/` returning per-task outcomes
 * (taskId → selfAssessment). Skips `*-fix.result` files when a primary
 * `task-NNN.result` exists for the same id (latest pass wins).
 */
export function readTaskOutcomes(brainArchive, sprintId) {
  const num = parseInt(sprintId.replace(/\D/g, ''), 10);
  const dir = join(brainArchive, `sprint-${num}-tasks`);
  if (!existsSync(dir)) return new Map();
  const outcomes = new Map();
  for (const name of readdirSync(dir)) {
    const m = name.match(TASK_RESULT_RE);
    if (!m) continue;
    const taskId = m[1];
    let assessment = 'PENDING';
    try {
      const raw = readFileSync(join(dir, name), 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.selfAssessment === 'string') {
        assessment = parsed.selfAssessment;
      }
    } catch {
      // unreadable result → keep PENDING
    }
    // Fix-result wins only when the original is absent.
    if (!outcomes.has(taskId)) {
      outcomes.set(taskId, assessment);
    } else if (!taskId.endsWith('-fix')) {
      outcomes.set(taskId, assessment);
    }
  }
  return outcomes;
}

/**
 * Scan `.deckent/archive/sprints/sprint-NNN/events.jsonl` for task ids
 * that surfaced during the sprint. Used as a fallback when per-task
 * `.result` files were never archived (Sprint 194 halted pre-finalize).
 * Returns a Set of task ids — outcome will be `PENDING` so downstream
 * reclassify can patch the row in place.
 */
export function extractTaskIdsFromEvents(deckentArchive, sprintId) {
  const path = join(deckentArchive, sprintId, 'events.jsonl');
  const ids = new Set();
  if (!existsSync(path)) return ids;
  const num = parseInt(sprintId.replace(/\D/g, ''), 10);
  const idRe = new RegExp(`\\b${num}-\\d{3}(?:-[a-z0-9]+)*\\b`, 'g');
  try {
    const text = readFileSync(path, 'utf-8');
    const matches = text.match(idRe);
    if (matches) {
      for (const m of matches) ids.add(m);
    }
  } catch {
    // unreadable — return what we have
  }
  return ids;
}

/**
 * Read sprint duration / event count from metrics.jsonl. Returns
 * { durationMs, eventCount, firstTs, lastTs } — undefined fields when
 * the file is missing or empty.
 */
export function summarizeMetrics(deckentArchive, sprintId) {
  const path = join(deckentArchive, sprintId, 'metrics.jsonl');
  if (!existsSync(path)) return {};
  let firstTs;
  let lastTs;
  let eventCount = 0;
  let traceDurationMs;
  try {
    const text = readFileSync(path, 'utf-8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      eventCount += 1;
      try {
        const ev = JSON.parse(trimmed);
        const ts = typeof ev.timestamp === 'string' ? ev.timestamp : undefined;
        if (ts) {
          if (!firstTs || ts < firstTs) firstTs = ts;
          if (!lastTs || ts > lastTs) lastTs = ts;
        }
        if (
          ev.type === 'trace' &&
          ev.operation === 'wait_results' &&
          typeof ev.durationMs === 'number'
        ) {
          traceDurationMs = Math.round(ev.durationMs);
        }
      } catch {
        // malformed line — count it but skip parsing
      }
    }
  } catch {
    return {};
  }
  let durationMs = traceDurationMs;
  if (durationMs === undefined && firstTs && lastTs) {
    const start = Date.parse(firstTs);
    const end = Date.parse(lastTs);
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      durationMs = end - start;
    }
  }
  return { durationMs, eventCount, firstTs, lastTs };
}

/** Build the markdown body for a sprint-log entry. */
export function buildSprintLogContent({ sprintId, outcomes, metrics }) {
  const counts = { DONE: 0, NO_GO: 0, GO_WITH_TECH_DEBT: 0, PENDING: 0 };
  for (const ev of outcomes.values()) {
    if (counts[ev] !== undefined) counts[ev] += 1;
    else counts.PENDING += 1;
  }
  const lines = [`# ${sprintId}`, ''];
  lines.push(`- Total tasks: ${outcomes.size}`);
  lines.push(`- Completed: ${counts.DONE}`);
  lines.push(`- NO_GO: ${counts.NO_GO}`);
  lines.push(`- GO_WITH_TECH_DEBT: ${counts.GO_WITH_TECH_DEBT}`);
  if (typeof metrics.durationMs === 'number') {
    lines.push(`- Duration: ${metrics.durationMs}ms`);
  }
  lines.push('- Source: backfill-sprint-log-rows.mjs');
  if (outcomes.size > 0) {
    lines.push('');
    lines.push('## Task Outcomes');
    const sortedIds = [...outcomes.keys()].sort();
    for (const id of sortedIds) {
      lines.push(`- ${id}: ${outcomes.get(id)}`);
    }
  }
  return lines.join('\n');
}

/**
 * Pure transformation — given on-disk discoveries return a payload
 * suitable for MemoryStore.upsertSprintLog. Exposed for tests.
 *
 * When per-task `.result` files are absent (Sprint 194-style halt),
 * task ids are recovered from `events.jsonl` and marked `PENDING` so
 * downstream `sprint-retroactive-reclassify.mjs` can patch them.
 */
export function planSprintLogPayload(sprintId, brainArchive, deckentArchive) {
  const outcomes = readTaskOutcomes(brainArchive, sprintId);
  if (outcomes.size === 0) {
    const eventIds = extractTaskIdsFromEvents(deckentArchive, sprintId);
    for (const id of eventIds) outcomes.set(id, 'PENDING');
  }
  const metrics = summarizeMetrics(deckentArchive, sprintId);
  const content = buildSprintLogContent({ sprintId, outcomes, metrics });
  return {
    sprintId,
    sprintNum: parseInt(sprintId.replace(/\D/g, ''), 10) || 0,
    totalTasks: outcomes.size,
    durationMs: metrics.durationMs,
    content,
    extraTags: ['backfill'],
  };
}

/** Return set of sprint ids that already have a sprint-log-* row. */
export function listExistingSprintLogs(db) {
  const rows = db
    .prepare(`SELECT sprint_id FROM entries WHERE type = 'sprint' AND sprint_id IS NOT NULL`)
    .all();
  return new Set(rows.map((r) => r.sprint_id));
}

/**
 * Apply one backfill plan against a memory.db handle. Idempotent — uses
 * canonical `sprint-log-<num>` id with UPSERT semantics. Returns the
 * row id that was written.
 */
export function applyBackfill(db, payload) {
  const id = `sprint-log-${payload.sprintNum}`;
  const tagText = ['sprint', payload.sprintId, ...(payload.extraTags ?? [])]
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .join(' ');
  const existing = db.prepare(`SELECT id FROM entries WHERE id = ?`).get(id);
  if (existing) {
    db.prepare(`
      UPDATE entries SET
        title = @title,
        content = @content,
        tag_text = @tag_text,
        sprint_id = @sprint_id,
        sprint_num = @sprint_num,
        status = 'active',
        updated_at = datetime('now')
      WHERE id = @id
    `).run({
      id,
      title: `Sprint ${payload.sprintId}`,
      content: payload.content,
      tag_text: tagText,
      sprint_id: payload.sprintId,
      sprint_num: payload.sprintNum,
    });
  } else {
    db.prepare(`
      INSERT INTO entries (
        id, type, source, title, content, summary,
        tag_text, title_norm, content_norm, summary_norm, tag_norm,
        status, priority, sprint_id, sprint_num, lang,
        decay_exempt, metadata, tenant_id
      ) VALUES (
        @id, 'sprint', 'brain', @title, @content, NULL,
        @tag_text, @title, @content, '', @tag_text,
        'active', 'normal', @sprint_id, @sprint_num, 'en',
        0, '{}', NULL
      )
    `).run({
      id,
      title: `Sprint ${payload.sprintId}`,
      content: payload.content,
      tag_text: tagText,
      sprint_id: payload.sprintId,
      sprint_num: payload.sprintNum,
    });
    // Auxiliary tags table (best-effort — table presence guaranteed by schema).
    const insertTag = db.prepare(`INSERT OR IGNORE INTO tags (entry_id, tag) VALUES (?, ?)`);
    for (const tag of tagText.split(' ').filter(Boolean)) {
      try { insertTag.run(id, tag); } catch { /* ignore */ }
    }
  }
  return id;
}

/** High-level runner used by CLI + tests. */
export function runBackfill(opts) {
  const {
    dbPath,
    sprintIds,
    brainArchive,
    deckentArchive,
    dryRun = false,
  } = opts;

  if (!existsSync(dbPath)) {
    throw new Error(`memory.db not found at ${dbPath}`);
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const written = [];
  const skipped = [];
  try {
    for (const sprintId of sprintIds) {
      const payload = planSprintLogPayload(sprintId, brainArchive, deckentArchive);
      if (payload.totalTasks === 0 && payload.durationMs === undefined) {
        // No evidence on disk — record as skipped so operator can see why.
        skipped.push({ sprintId, reason: 'no-archive-evidence' });
        continue;
      }
      if (dryRun) {
        written.push({ sprintId, dryRun: true, payload });
        continue;
      }
      const id = applyBackfill(db, payload);
      written.push({ sprintId, id, totalTasks: payload.totalTasks, durationMs: payload.durationMs });
    }
  } finally {
    db.close();
  }

  return { written, skipped };
}

function resolveSprintIds(opts, defaults) {
  if (opts.sprint) {
    const m = String(opts.sprint).match(SPRINT_ID_RE);
    if (!m) throw new Error(`--sprint must look like sprint-NNN (got ${opts.sprint})`);
    return [`sprint-${parseInt(m[1], 10)}`];
  }
  if (opts['all-missing']) {
    const db = new Database(defaults.dbPath, { readonly: true });
    try {
      const existing = listExistingSprintLogs(db);
      const archived = discoverArchivedSprints(defaults.brainArchive, defaults.deckentArchive);
      return archived.filter((id) => !existing.has(id));
    } finally {
      db.close();
    }
  }
  throw new Error('Either --sprint <id> or --all-missing is required');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const defaults = {
    dbPath: opts.db || join(cwd, '.brain', 'memory.db'),
    brainArchive: opts['brain-archive'] || join(cwd, '.brain', 'archive'),
    deckentArchive: opts['deckent-archive'] || join(cwd, '.deckent', 'archive', 'sprints'),
  };
  const dryRun = Boolean(opts['dry-run']);

  if (!existsSync(defaults.dbPath)) {
    console.error(`memory.db not found at ${defaults.dbPath}`);
    process.exit(1);
  }

  const sprintIds = resolveSprintIds(opts, defaults);
  if (sprintIds.length === 0) {
    console.log('No missing sprint-log rows detected.');
    return;
  }

  const result = runBackfill({
    dbPath: defaults.dbPath,
    sprintIds,
    brainArchive: defaults.brainArchive,
    deckentArchive: defaults.deckentArchive,
    dryRun,
  });

  console.log(`Backfilled ${result.written.length} sprint-log rows${dryRun ? ' (dry-run)' : ''}`);
  for (const row of result.written) {
    console.log(`  ${row.sprintId} → ${row.id ?? '(dry-run)'} totalTasks=${row.totalTasks ?? row.payload?.totalTasks ?? 0}`);
  }
  if (result.skipped.length) {
    console.log(`Skipped ${result.skipped.length}`);
    for (const s of result.skipped) {
      console.log(`  ${s.sprintId} → ${s.reason}`);
    }
  }
}

const invokedDirectly = (() => {
  try {
    const arg1 = process.argv[1] ? process.argv[1] : '';
    return basename(arg1) === 'backfill-sprint-log-rows.mjs';
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().catch((err) => {
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  });
}

#!/usr/bin/env node
/**
 * sprint-retroactive-reclassify.mjs — Reclassify task decisions inside a sprint
 * entry stored in `.brain/memory.db`. Optionally recomputes agent / skill stats
 * and always writes a per-day audit record to `.deckent/decisions/`.
 *
 * Usage:
 *   node scripts/sprint-retroactive-reclassify.mjs \
 *     --sprint sprint-195 --task 195-004 --decision DONE --reason "..."
 *
 *   node scripts/sprint-retroactive-reclassify.mjs --from-file list.json
 *   node scripts/sprint-retroactive-reclassify.mjs --from-file list.json --dry-run
 *
 * Options:
 *   --sprint <id>          Sprint id (sprint-NNN) — single mode
 *   --task <id>            Task id — single mode
 *   --decision <D>         DONE | NO_GO | GO_WITH_TECH_DEBT — single mode
 *   --reason <text>        Free-form reason — single mode
 *   --from-file <path>     JSON array of entries — bulk mode
 *   --db <path>            memory.db path (default: .brain/memory.db)
 *   --agents-dir <path>    Agents dir (default: .deckent/agents)
 *   --skills-dir <path>    Skills dir (default: .deckent/skills)
 *   --decisions-dir <path> Decisions dir (default: .deckent/decisions)
 *   --date <YYYY-MM-DD>    Override audit file date (testing)
 *   --dry-run              Do not write to DB / files; print plan
 *   --backfill-missing     Before reclassifying, create/append sprint-log rows for
 *                          entries whose sprint entry is missing or whose task is
 *                          absent from the "## Task Outcomes" section (born-504)
 *   --default-prior-decision <D>
 *                          Decision to record for a backfilled task line when the
 *                          entry doesn't carry its own `priorDecision` (default: NO_GO)
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const VALID_DECISIONS = new Set(['DONE', 'NO_GO', 'GO_WITH_TECH_DEBT']);
const SUCCESS_DECISIONS = new Set(['DONE', 'GO_WITH_TECH_DEBT']);

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

/** Normalise a single reclassify entry. Throws on invalid input. */
export function validateEntry(entry, index = 0) {
  const { sprint, task, decision, reason } = entry || {};
  if (!sprint || typeof sprint !== 'string') {
    throw new Error(`entry[${index}]: 'sprint' is required (string)`);
  }
  if (!task || typeof task !== 'string') {
    throw new Error(`entry[${index}]: 'task' is required (string)`);
  }
  if (!decision || !VALID_DECISIONS.has(decision)) {
    throw new Error(
      `entry[${index}]: 'decision' must be one of ${[...VALID_DECISIONS].join('|')} (got ${decision})`,
    );
  }
  if (!reason || typeof reason !== 'string') {
    throw new Error(`entry[${index}]: 'reason' is required (string)`);
  }
  return {
    sprint,
    task,
    decision,
    reason,
    agent: typeof entry.agent === 'string' ? entry.agent : undefined,
    skills: Array.isArray(entry.skills) ? entry.skills.filter((s) => typeof s === 'string') : undefined,
    priorDecision:
      typeof entry.priorDecision === 'string' && VALID_DECISIONS.has(entry.priorDecision)
        ? entry.priorDecision
        : undefined,
  };
}

/**
 * Parse `## Task Outcomes` lines from a sprint entry content blob.
 * Returns a Map<taskId, decision>.
 */
export function parseTaskOutcomes(content) {
  const outcomes = new Map();
  if (!content) return outcomes;
  let inSection = false;
  for (const raw of content.split('\n')) {
    const line = raw.trimEnd();
    if (line.startsWith('## ')) {
      inSection = /task outcomes/i.test(line);
      continue;
    }
    if (!inSection) continue;
    // Tolerate an optional trailing " — <title>" label after the decision
    // (buildSprintEntrySummary enriches lines with the clean task title).
    // The decision token still anchors on id + [A-Z_]+; \b ends it cleanly.
    const m = line.match(/^-\s+([0-9A-Za-z_.\-]+)\s*:\s*([A-Z_]+)\b.*$/);
    if (m) outcomes.set(m[1], m[2]);
  }
  return outcomes;
}

/**
 * Replace one task outcome line in content and recompute the header counters.
 * Returns the updated content. If the taskId is missing, throws.
 */
export function rewriteTaskOutcome(content, taskId, newDecision) {
  if (!VALID_DECISIONS.has(newDecision)) {
    throw new Error(`Invalid decision '${newDecision}'`);
  }
  const lines = content.split('\n');
  let replaced = false;
  for (let i = 0; i < lines.length; i++) {
    // Group 5 captures everything after the decision (trailing whitespace OR
    // a " — <title>" label) so the title survives a decision rewrite.
    const m = lines[i].match(/^(-\s+)([0-9A-Za-z_.\-]+)(\s*:\s*)([A-Z_]+)(.*)$/);
    if (m && m[2] === taskId) {
      lines[i] = `${m[1]}${m[2]}${m[3]}${newDecision}${m[5]}`;
      replaced = true;
      break;
    }
  }
  if (!replaced) {
    throw new Error(`taskId '${taskId}' not found in Task Outcomes section`);
  }
  return recomputeHeaderCounters(lines).join('\n');
}

/**
 * Recompute the `- Completed:` / `- NO_GO:` / `- GO_WITH_TECH_DEBT:` header
 * counters in-place from the (already-updated) `## Task Outcomes` lines.
 * Shared by rewriteTaskOutcome and the backfill helpers below so the counter
 * logic exists in exactly one place.
 */
function recomputeHeaderCounters(lines) {
  const outcomes = parseTaskOutcomes(lines.join('\n'));
  const counts = { DONE: 0, NO_GO: 0, GO_WITH_TECH_DEBT: 0 };
  for (const d of outcomes.values()) {
    if (counts[d] !== undefined) counts[d]++;
  }
  for (let i = 0; i < lines.length; i++) {
    if (/^- Completed:/i.test(lines[i])) lines[i] = `- Completed: ${counts.DONE}`;
    else if (/^- NO_GO:/i.test(lines[i])) lines[i] = `- NO_GO: ${counts.NO_GO}`;
    else if (/^- GO_WITH_TECH_DEBT:/i.test(lines[i])) {
      lines[i] = `- GO_WITH_TECH_DEBT: ${counts.GO_WITH_TECH_DEBT}`;
    }
  }
  return lines;
}

const DEFAULT_PRIOR_DECISION = 'NO_GO';

/**
 * Choose the decision to record for a backfilled task-outcome line. Always
 * differs from the entry's target decision — otherwise reclassifyEntries
 * would see prior === target and skip it as 'already-classified', silently
 * defeating the point of backfilling it in the first place.
 */
function pickPriorDecision(entry, defaultPriorDecision) {
  if (entry.priorDecision) return entry.priorDecision;
  const candidate = VALID_DECISIONS.has(defaultPriorDecision) ? defaultPriorDecision : DEFAULT_PRIOR_DECISION;
  if (candidate === entry.decision) return candidate === 'NO_GO' ? 'DONE' : 'NO_GO';
  return candidate;
}

/**
 * Append task-outcome lines that are missing from an existing sprint entry's
 * `## Task Outcomes` section (creating the section if the entry has none),
 * then recompute header counters. Existing lines are never touched — this
 * only adds rows for tasks the section doesn't mention yet.
 */
export function appendTaskOutcomes(content, pairs) {
  const lines = content.split('\n');
  const existing = parseTaskOutcomes(content);
  const missing = pairs.filter((p) => !existing.has(p.task));
  if (missing.length === 0) return content;

  let sectionIdx = lines.findIndex((l) => /^##\s+task outcomes/i.test(l.trim()));
  if (sectionIdx === -1) {
    if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
    lines.push('## Task Outcomes');
    sectionIdx = lines.length - 1;
  }
  let insertAt = lines.length;
  for (let i = sectionIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) {
      insertAt = i;
      break;
    }
  }
  const newLines = missing.map((p) => `- ${p.task}: ${p.decision} — (backfilled)`);
  lines.splice(insertAt, 0, ...newLines);
  return recomputeHeaderCounters(lines).join('\n');
}

/**
 * Synthesize a full sprint-log body (same shape as buildSprintEntrySummary)
 * for a sprint that has no `type='sprint'` row at all. Marked as backfilled
 * so the row is traceably synthetic, not a real finalize output.
 */
export function buildBackfillSprintContent(sprintId, pairs) {
  const lines = [
    `# ${sprintId}`,
    '',
    `- Total tasks: ${pairs.length}`,
    '- Completed: 0',
    '- NO_GO: 0',
    '- GO_WITH_TECH_DEBT: 0',
    '- Backfilled via sprint-retroactive-reclassify --backfill-missing',
    '',
    '## Task Outcomes',
    ...pairs.map((p) => `- ${p.task}: ${p.decision} — (backfilled)`),
  ];
  return recomputeHeaderCounters(lines).join('\n');
}

/**
 * Backfill sprint-log rows / task-outcome lines that a reclassify batch
 * references but the DB does not yet have — closes the historical
 * 'sprint-entry-missing' / 'task-not-in-outcomes' skip gap (born-504).
 * Idempotent: a sprint/task that already has an outcome line is left alone.
 * Returns a per-sprint report; does not itself change any decision — the
 * subsequent reclassifyEntries() pass owns the actual decision change.
 */
export function backfillMissingSprintEntries(db, rawEntries, opts = {}) {
  const { defaultPriorDecision = DEFAULT_PRIOR_DECISION, dryRun = false } = opts;
  const entries = rawEntries.map((e) => validateEntry(e));

  const selectStmt = db.prepare(`SELECT id, content FROM entries WHERE sprint_id = ? AND type = 'sprint' LIMIT 1`);
  const updateStmt = db.prepare(`UPDATE entries SET content = ?, updated_at = ? WHERE id = ?`);
  const insertStmt = db.prepare(
    `INSERT INTO entries (id, type, title, content, sprint_id, sprint_num, source, decay_exempt, created_at, updated_at)
     VALUES (@id, 'sprint', @title, @content, @sprintId, @sprintNum, 'backfill', 1, @now, @now)`,
  );

  const bySprintOrder = [];
  const bySprint = new Map();
  for (const e of entries) {
    if (!bySprint.has(e.sprint)) {
      bySprint.set(e.sprint, []);
      bySprintOrder.push(e.sprint);
    }
    bySprint.get(e.sprint).push(e);
  }

  const now = new Date().toISOString();
  const report = [];

  for (const sprintId of bySprintOrder) {
    const sprintEntries = bySprint.get(sprintId);
    const pairs = sprintEntries.map((e) => ({ task: e.task, decision: pickPriorDecision(e, defaultPriorDecision) }));
    const row = selectStmt.get(sprintId);

    if (!row) {
      const content = buildBackfillSprintContent(sprintId, pairs);
      if (!dryRun) {
        const sprintNum = parseInt(sprintId.replace(/\D/g, ''), 10) || 0;
        insertStmt.run({
          id: `sprint-log-${sprintNum}`,
          title: `Sprint ${sprintId} (backfilled)`,
          content,
          sprintId,
          sprintNum,
          now,
        });
      }
      report.push({ sprint: sprintId, action: 'created', tasksBackfilled: pairs.map((p) => p.task) });
      continue;
    }

    const existingOutcomes = parseTaskOutcomes(row.content);
    const missingPairs = pairs.filter((p) => !existingOutcomes.has(p.task));
    if (missingPairs.length === 0) {
      report.push({ sprint: sprintId, action: 'noop', tasksBackfilled: [] });
      continue;
    }
    const updatedContent = appendTaskOutcomes(row.content, missingPairs);
    if (!dryRun) {
      updateStmt.run(updatedContent, now, row.id);
    }
    report.push({ sprint: sprintId, action: 'updated', tasksBackfilled: missingPairs.map((p) => p.task) });
  }

  return report;
}

function decisionToSuccess(d) {
  return SUCCESS_DECISIONS.has(d);
}

/**
 * Mutate agent.stats based on decision change. totalUses is unchanged; the
 * success count derived from (rate * uses) is shifted by ±1.
 */
export function recomputeAgentStats(agent, oldDecision, newDecision) {
  if (!agent || typeof agent !== 'object') return agent;
  if (!agent.stats) agent.stats = { totalUses: 0, successRate: 0 };
  const stats = agent.stats;
  const totalUses = Math.max(0, Number(stats.totalUses) || 0);
  if (totalUses === 0) return agent;
  const oldRate = clamp01(Number(stats.successRate) || 0);
  let successCount = Math.round(oldRate * totalUses);
  const oldS = decisionToSuccess(oldDecision);
  const newS = decisionToSuccess(newDecision);
  if (oldS === newS) return agent;
  if (newS && !oldS) successCount += 1;
  if (!newS && oldS) successCount -= 1;
  successCount = Math.max(0, Math.min(totalUses, successCount));
  stats.successRate = totalUses === 0 ? 0 : Number((successCount / totalUses).toFixed(4));
  return agent;
}

function clamp01(n) {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** File IO wrapper: apply agent stats delta to a manifest file in-place. */
export function applyAgentStatsDelta(jsonPath, oldDecision, newDecision, { dryRun = false } = {}) {
  if (!existsSync(jsonPath)) return { applied: false, reason: 'manifest-missing' };
  const raw = readFileSync(jsonPath, 'utf-8');
  const obj = JSON.parse(raw);
  const before = JSON.stringify(obj.stats || {});
  recomputeAgentStats(obj, oldDecision, newDecision);
  const after = JSON.stringify(obj.stats || {});
  if (before === after) return { applied: false, reason: 'no-change' };
  if (!dryRun) writeFileSync(jsonPath, JSON.stringify(obj, null, 2) + '\n', 'utf-8');
  return { applied: true, before, after };
}

/**
 * Apply a set of reclassify entries against a memory.db. Optionally applies
 * agent / skill stats deltas. Returns { applied, skipped }.
 */
export function reclassifyEntries(db, entries, opts = {}) {
  const { agentsDir, skillsDir, dryRun = false } = opts;
  const applied = [];
  const skipped = [];

  const selectStmt = db.prepare(`SELECT id, content FROM entries WHERE sprint_id = ? AND type = 'sprint' LIMIT 1`);
  const updateStmt = db.prepare(`UPDATE entries SET content = ?, updated_at = ? WHERE id = ?`);

  for (const raw of entries) {
    const e = validateEntry(raw);
    const row = selectStmt.get(e.sprint);
    if (!row) {
      skipped.push({ sprint: e.sprint, task: e.task, reason: 'sprint-entry-missing' });
      continue;
    }
    const outcomes = parseTaskOutcomes(row.content);
    const existing = outcomes.get(e.task);
    if (!existing) {
      skipped.push({ sprint: e.sprint, task: e.task, reason: 'task-not-in-outcomes' });
      continue;
    }
    if (existing === e.decision) {
      skipped.push({ sprint: e.sprint, task: e.task, reason: 'already-classified' });
      continue;
    }
    const newContent = rewriteTaskOutcome(row.content, e.task, e.decision);
    if (!dryRun) {
      updateStmt.run(newContent, new Date().toISOString(), row.id);
    }
    const record = {
      sprint: e.sprint,
      task: e.task,
      before: existing,
      after: e.decision,
      reason: e.reason,
    };
    if (e.agent && agentsDir) {
      const apath = join(agentsDir, e.agent, 'agent.json');
      const r = applyAgentStatsDelta(apath, existing, e.decision, { dryRun });
      record.agent = e.agent;
      record.agentStats = r;
    }
    if (e.skills && skillsDir) {
      record.skills = e.skills;
      record.skillStats = [];
      for (const skillId of e.skills) {
        const spath = join(skillsDir, skillId, 'manifest.json');
        const r = applyAgentStatsDelta(spath, existing, e.decision, { dryRun });
        record.skillStats.push({ skill: skillId, ...r });
      }
    }
    applied.push(record);
  }

  return { applied, skipped };
}

/** Pick an unused audit file path for the given date (YYYY-MM-DD). */
export function pickAuditPath(decisionsDir, dateStr) {
  const base = `decision-reclassify-${dateStr}`;
  const first = join(decisionsDir, `${base}.json`);
  if (!existsSync(first)) return first;
  for (let i = 1; i < 1000; i++) {
    const candidate = join(decisionsDir, `${base}-${i}.json`);
    if (!existsSync(candidate)) return candidate;
  }
  throw new Error(`Could not find a free audit path under ${decisionsDir} for ${dateStr}`);
}

/** Top-level reclassify runner — called by CLI and tests. */
export function runReclassify(opts) {
  const {
    dbPath,
    entries,
    agentsDir,
    skillsDir,
    decisionsDir,
    dateStr = new Date().toISOString().slice(0, 10),
    dryRun = false,
    backfillMissing = false,
    defaultPriorDecision = DEFAULT_PRIOR_DECISION,
  } = opts;

  if (!entries || entries.length === 0) {
    throw new Error('No reclassify entries supplied');
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  let result;
  let backfill = [];
  try {
    if (backfillMissing) {
      backfill = backfillMissingSprintEntries(db, entries, { defaultPriorDecision, dryRun });
    }
    result = reclassifyEntries(db, entries, { agentsDir, skillsDir, dryRun });
  } finally {
    db.close();
  }

  const auditPath = (() => {
    if (!decisionsDir) return null;
    if (dryRun) return null;
    if (result.applied.length === 0 && result.skipped.length === entries.length) {
      // All skipped — still emit an audit record (operators want this trail).
    }
    mkdirSync(decisionsDir, { recursive: true });
    return pickAuditPath(decisionsDir, dateStr);
  })();

  if (auditPath) {
    const payload = {
      timestamp: new Date().toISOString(),
      ...(backfillMissing ? { backfill } : {}),
      applied: result.applied,
      skipped: result.skipped,
    };
    writeFileSync(auditPath, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
  }

  return { ...result, backfill, auditPath };
}

function buildEntriesFromArgs(opts) {
  if (opts['from-file']) {
    const raw = readFileSync(opts['from-file'], 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error(`--from-file ${opts['from-file']} must contain a JSON array`);
    }
    return parsed;
  }
  return [
    {
      sprint: opts.sprint,
      task: opts.task,
      decision: opts.decision,
      reason: opts.reason,
    },
  ];
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const dbPath = opts.db || join(process.cwd(), '.brain', 'memory.db');
  const agentsDir = opts['agents-dir'] || join(process.cwd(), '.deckent', 'agents');
  const skillsDir = opts['skills-dir'] || join(process.cwd(), '.deckent', 'skills');
  const decisionsDir = opts['decisions-dir'] || join(process.cwd(), '.deckent', 'decisions');
  const dateStr = opts.date || new Date().toISOString().slice(0, 10);
  const dryRun = Boolean(opts['dry-run']);
  const backfillMissing = Boolean(opts['backfill-missing']);
  const defaultPriorDecision = opts['default-prior-decision'] || DEFAULT_PRIOR_DECISION;

  if (!existsSync(dbPath)) {
    console.error(`memory.db not found at ${dbPath}`);
    process.exit(1);
  }

  const entries = buildEntriesFromArgs(opts);
  const result = runReclassify({
    dbPath,
    entries,
    agentsDir,
    skillsDir,
    decisionsDir,
    dateStr,
    dryRun,
    backfillMissing,
    defaultPriorDecision,
  });

  if (result.backfill.length) {
    const created = result.backfill.filter((b) => b.action === 'created').length;
    const updated = result.backfill.filter((b) => b.action === 'updated').length;
    console.log(`Backfilled ${created} sprint entr${created === 1 ? 'y' : 'ies'}, appended outcomes to ${updated} more`);
  }
  console.log(`Reclassified ${result.applied.length} tasks${dryRun ? ' (dry-run)' : ''}`);
  if (result.skipped.length) {
    console.log(`Skipped ${result.skipped.length} (idempotent or invalid)`);
  }
  if (result.auditPath) {
    console.log(`Audit: ${result.auditPath}`);
  }
}

const invokedDirectly = (() => {
  try {
    const arg1 = process.argv[1] ? process.argv[1] : '';
    return arg1.endsWith('sprint-retroactive-reclassify.mjs');
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

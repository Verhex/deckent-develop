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
    const m = line.match(/^-\s+([0-9A-Za-z_.\-]+)\s*:\s*([A-Z_]+)\s*$/);
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
    const m = lines[i].match(/^(-\s+)([0-9A-Za-z_.\-]+)(\s*:\s*)([A-Z_]+)(\s*)$/);
    if (m && m[2] === taskId) {
      lines[i] = `${m[1]}${m[2]}${m[3]}${newDecision}${m[5]}`;
      replaced = true;
      break;
    }
  }
  if (!replaced) {
    throw new Error(`taskId '${taskId}' not found in Task Outcomes section`);
  }
  // Recompute header counters from the (now-updated) outcomes map.
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
  return lines.join('\n');
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
  } = opts;

  if (!entries || entries.length === 0) {
    throw new Error('No reclassify entries supplied');
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  let result;
  try {
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
      applied: result.applied,
      skipped: result.skipped,
    };
    writeFileSync(auditPath, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
  }

  return { ...result, auditPath };
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
  });

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

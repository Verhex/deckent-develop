#!/usr/bin/env node
/**
 * Series Metrics — Task 364-011 (RETRO-SERIES-METRICS)
 *
 * Aggregates per-sprint task/DONE/DEBT/NO_GO/duration/self-vs-brain-agreement/fix-heal-rate
 * metrics from `.brain/archive/sprint-N-tasks/` (task JSON + `.result` files) across a sprint
 * range, plus a cumulative rollup, emitted as both JSON and Markdown.
 *
 * Source is the raw per-task archive only — deliberately NOT `docs/SPRINT-LOG.md`'s rollup
 * table, which was found (during sprint 357 cross-check) to disagree with its own per-task
 * listing for the same sprint, matching the counter-source bug fixed by 358-011
 * (RETRO-DEBT-COUNT, born-460). The fold algorithm below was validated to match
 * `docs/SPRINT-LOG.md`'s per-task status lines exactly for sprints 357–363.
 *
 * Usage:
 *   node scripts/series-metrics.mjs <startSprint> <endSprint>
 *   node scripts/series-metrics.mjs 357 363
 *   node scripts/series-metrics.mjs 357 363 --archive-dir=/path/to/.brain/archive
 *   node scripts/series-metrics.mjs 357 363 --out-md=out.md --out-json=out.json
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(__dirname, '..');

const CONCRETE_STATUSES = new Set(['DONE', 'GO_WITH_TECH_DEBT', 'NO_GO']);
const HEALED_STATUSES = new Set(['DONE', 'GO_WITH_TECH_DEBT']);

function readJsonSafe(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

/** Load one sprint's archived task JSON + `.result` files. Returns null if the archive dir is missing. */
export function loadSprintArchive(archiveDir, sprintNum) {
  const dir = join(archiveDir, `sprint-${sprintNum}-tasks`);
  if (!existsSync(dir)) return null;

  const files = readdirSync(dir);
  const tasks = new Map();
  for (const f of files) {
    if (!f.endsWith('.json') || f.startsWith('.')) continue;
    const d = readJsonSafe(join(dir, f));
    if (d && d.id) tasks.set(d.id, d);
  }
  const results = new Map();
  for (const f of files) {
    if (!f.endsWith('.result')) continue;
    const d = readJsonSafe(join(dir, f));
    if (d && d.taskId) results.set(d.taskId, d);
  }
  return { tasks, results };
}

function outcomeOf(id, tasks, results) {
  const r = results.get(id);
  if (r && r.brainEvaluation) return r.brainEvaluation;
  const t = tasks.get(id);
  return t ? (t.status ?? 'UNKNOWN') : 'UNKNOWN';
}

/**
 * Fold same-sprint fix chains to their final resolved outcome.
 *
 * A task is a "root slot" when it has no `fixForTaskId`, or its `fixForTaskId` points outside
 * this sprint's own archive (a cross-sprint carryover fix — its parent isn't present here to
 * fold into, so it stands as its own slot for this sprint).
 *
 * Each root is walked forward through same-sprint fix children, only descending into a child
 * once that child has a concrete (DONE/GO_WITH_TECH_DEBT/NO_GO) outcome of its own — an
 * unresolved/pending fix-of-a-fix does not override the last concretely-resolved ancestor.
 */
export function foldSprintSlots({ tasks, results }) {
  const idSet = new Set(tasks.keys());
  const childrenOf = new Map();
  for (const t of tasks.values()) {
    if (t.fixForTaskId && idSet.has(t.fixForTaskId)) {
      if (!childrenOf.has(t.fixForTaskId)) childrenOf.set(t.fixForTaskId, []);
      childrenOf.get(t.fixForTaskId).push(t.id);
    }
  }

  const roots = [...idSet].filter(id => {
    const t = tasks.get(id);
    return !t.fixForTaskId || !idSet.has(t.fixForTaskId);
  });

  const slots = [];
  for (const rootId of roots) {
    let current = rootId;
    for (;;) {
      const concreteKids = (childrenOf.get(current) ?? [])
        .filter(k => CONCRETE_STATUSES.has(outcomeOf(k, tasks, results)));
      if (concreteKids.length === 0) break;
      // Deterministic tie-break when a parent has more than one concretely-resolved
      // same-sprint fix child: take the lexicographically-last id (a later fix-of-fix
      // attempt id, e.g. "-fix-fix", sorts after its "-fix" predecessor).
      concreteKids.sort();
      current = concreteKids[concreteKids.length - 1];
    }
    slots.push({ rootId, resolvedId: current, outcome: outcomeOf(current, tasks, results) });
  }
  return slots;
}

/** Sprint wall-clock duration, approximated as min(createdAt)..max(updatedAt) over all archived tasks. */
export function computeSprintDuration({ tasks }) {
  let min = Infinity;
  let max = -Infinity;
  for (const t of tasks.values()) {
    if (t.createdAt) min = Math.min(min, Date.parse(t.createdAt));
    if (t.updatedAt) max = Math.max(max, Date.parse(t.updatedAt));
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return 0;
  return max - min;
}

/** % of raw (unfolded) worker results where selfAssessment matches Brain's brainEvaluation. */
export function computeSelfBrainAgreement({ results }) {
  let matched = 0;
  let total = 0;
  for (const r of results.values()) {
    if (r.selfAssessment && r.brainEvaluation) {
      total++;
      if (r.selfAssessment === r.brainEvaluation) matched++;
    }
  }
  return { matched, total, pct: total > 0 ? Math.round((matched / total) * 100) : null };
}

/** % of isPriorityFix attempts whose own outcome healed to DONE/GO_WITH_TECH_DEBT. */
export function computeFixHealRate({ tasks, results }) {
  let healed = 0;
  let attempted = 0;
  for (const t of tasks.values()) {
    if (!t.isPriorityFix) continue;
    attempted++;
    if (HEALED_STATUSES.has(outcomeOf(t.id, tasks, results))) healed++;
  }
  return { healed, attempted, pct: attempted > 0 ? Math.round((healed / attempted) * 100) : null };
}

/** Full metrics for one sprint. Returns null if no archive exists for that sprint number. */
export function computeSprintMetrics(archiveDir, sprintNum) {
  const archive = loadSprintArchive(archiveDir, sprintNum);
  if (!archive) return null;

  const slots = foldSprintSlots(archive);
  const counts = { DONE: 0, GO_WITH_TECH_DEBT: 0, NO_GO: 0, PENDING: 0 };
  for (const s of slots) {
    if (s.outcome === 'DONE') counts.DONE++;
    else if (s.outcome === 'GO_WITH_TECH_DEBT') counts.GO_WITH_TECH_DEBT++;
    else if (s.outcome === 'NO_GO') counts.NO_GO++;
    else counts.PENDING++;
  }

  return {
    sprintId: `sprint-${sprintNum}`,
    sprintNum,
    tasks: slots.length,
    done: counts.DONE,
    techDebt: counts.GO_WITH_TECH_DEBT,
    noGo: counts.NO_GO,
    pending: counts.PENDING,
    durationMs: computeSprintDuration(archive),
    selfBrainAgreement: computeSelfBrainAgreement(archive),
    fixHeal: computeFixHealRate(archive),
  };
}

/** Metrics for every sprint in [startSprint, endSprint], plus a cumulative rollup. */
export function computeSeriesMetrics(archiveDir, startSprint, endSprint) {
  const sprints = [];
  const missing = [];
  for (let n = startSprint; n <= endSprint; n++) {
    const m = computeSprintMetrics(archiveDir, n);
    if (m) sprints.push(m);
    else missing.push(n);
  }

  const totals = sprints.reduce(
    (acc, s) => {
      acc.tasks += s.tasks;
      acc.done += s.done;
      acc.techDebt += s.techDebt;
      acc.noGo += s.noGo;
      acc.pending += s.pending;
      acc.durationMs += s.durationMs;
      acc.selfBrainMatched += s.selfBrainAgreement.matched;
      acc.selfBrainTotal += s.selfBrainAgreement.total;
      acc.fixHealed += s.fixHeal.healed;
      acc.fixAttempted += s.fixHeal.attempted;
      return acc;
    },
    {
      tasks: 0, done: 0, techDebt: 0, noGo: 0, pending: 0, durationMs: 0,
      selfBrainMatched: 0, selfBrainTotal: 0, fixHealed: 0, fixAttempted: 0,
    },
  );

  return {
    range: { start: startSprint, end: endSprint },
    sprints,
    missing,
    cumulative: {
      tasks: totals.tasks,
      done: totals.done,
      techDebt: totals.techDebt,
      noGo: totals.noGo,
      pending: totals.pending,
      durationMs: totals.durationMs,
      selfBrainAgreementPct: totals.selfBrainTotal > 0
        ? Math.round((totals.selfBrainMatched / totals.selfBrainTotal) * 100)
        : null,
      fixHealPct: totals.fixAttempted > 0
        ? Math.round((totals.fixHealed / totals.fixAttempted) * 100)
        : null,
    },
  };
}

function fmtDuration(ms) {
  if (!ms || ms <= 0) return '0s';
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function fmtPct(pct) {
  return pct === null ? 'N/A' : `${pct}%`;
}

/** Render the series metrics as a Markdown report. Pure — no file I/O. */
export function buildSeriesMarkdown(series, generatedAt) {
  const lines = [];
  lines.push(`# Sprint Series Metrics — ${series.range.start}–${series.range.end}`);
  lines.push('');
  lines.push(`Generated: ${generatedAt}`);
  lines.push('');
  lines.push(
    'Source: `.brain/archive/sprint-N-tasks/` (task JSON + `.result` files) — no dependency on ' +
    'the generated `docs/SPRINT-LOG.md` rollup. Same-sprint `-fix` chains are folded to their ' +
    'deepest concretely-resolved outcome; a `.result.brainEvaluation` field takes precedence ' +
    'over `task.json.status`.',
  );
  lines.push('');
  lines.push('## Definitions');
  lines.push('');
  lines.push(
    '- **Tasks** — distinct root slots dispatched this sprint, after folding same-sprint ' +
    '`-fix` chains to their final resolution (a cross-sprint carryover fix counts as its own ' +
    'root, since its parent is not in this sprint\'s archive to fold into).',
  );
  lines.push(
    '- **Self↔Brain Uyum** — among all raw worker results this sprint (one row per dispatched ' +
    'attempt, fix attempts included, unfolded), the % where `selfAssessment === brainEvaluation`.',
  );
  lines.push(
    '- **Fix/Heal** — among tasks flagged `isPriorityFix`, the % whose own final outcome is ' +
    'DONE or GO_WITH_TECH_DEBT (healed) rather than NO_GO or still-pending.',
  );
  lines.push('');
  lines.push('| Sprint | Tasks | DONE | Tech Debt | NO_GO | Pending | Duration | Self↔Brain Uyum | Fix/Heal |');
  lines.push('|--------|------:|-----:|----------:|------:|--------:|---------:|:---------------:|:--------:|');
  for (const s of series.sprints) {
    lines.push(
      `| ${s.sprintId} | ${s.tasks} | ${s.done} | ${s.techDebt} | ${s.noGo} | ${s.pending} | ` +
      `${fmtDuration(s.durationMs)} | ${fmtPct(s.selfBrainAgreement.pct)} ` +
      `(${s.selfBrainAgreement.matched}/${s.selfBrainAgreement.total}) | ` +
      `${fmtPct(s.fixHeal.pct)} (${s.fixHeal.healed}/${s.fixHeal.attempted}) |`,
    );
  }
  const c = series.cumulative;
  lines.push(
    `| **Cumulative** | **${c.tasks}** | **${c.done}** | **${c.techDebt}** | **${c.noGo}** | ` +
    `**${c.pending}** | **${fmtDuration(c.durationMs)}** | **${fmtPct(c.selfBrainAgreementPct)}** | ` +
    `**${fmtPct(c.fixHealPct)}** |`,
  );

  if (series.missing.length > 0) {
    lines.push('');
    lines.push(
      `> ⚠ Missing archive for sprint(s): ${series.missing.map(n => `sprint-${n}`).join(', ')} ` +
      '— excluded from the table and cumulative row above.',
    );
  }
  lines.push('');
  return lines.join('\n');
}

export function main(argv = process.argv.slice(2), opts = {}) {
  const positional = argv.filter(a => !a.startsWith('--'));
  const flags = {};
  for (const a of argv) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq === -1) flags[a.slice(2)] = true;
      else flags[a.slice(2, eq)] = a.slice(eq + 1);
    }
  }

  if (flags.help || flags.h || positional.length < 2) {
    process.stdout.write(
      'series-metrics.mjs — aggregate per-sprint DONE/DEBT/NO_GO/duration/self-brain-agreement/' +
      'fix-heal metrics from .brain/archive\n\n' +
      'Usage:\n' +
      '  node scripts/series-metrics.mjs <startSprint> <endSprint> ' +
      '[--archive-dir=path] [--out-json=path] [--out-md=path] [--root=path]\n',
    );
    return positional.length < 2 ? 2 : 0;
  }

  const start = parseInt(positional[0], 10);
  const end = parseInt(positional[1], 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    process.stderr.write('error: invalid sprint range\n');
    return 2;
  }

  const root = opts.root ?? flags.root ?? DEFAULT_ROOT;
  const archiveDir = flags['archive-dir'] ?? join(root, '.brain', 'archive');
  const outJson = flags['out-json'] ?? join(root, 'docs', 'analysis', `series-${start}-${end}.json`);
  const outMd = flags['out-md'] ?? join(root, 'docs', 'analysis', `series-${start}-${end}.md`);

  const series = computeSeriesMetrics(archiveDir, start, end);
  const generatedAt = opts.now ?? new Date().toISOString();
  const md = buildSeriesMarkdown(series, generatedAt);
  const json = JSON.stringify({ generatedAt, ...series }, null, 2);

  mkdirSync(dirname(outJson), { recursive: true });
  mkdirSync(dirname(outMd), { recursive: true });
  writeFileSync(outMd, md + '\n');
  writeFileSync(outJson, json + '\n');

  process.stdout.write(`series-metrics: wrote ${outMd}\n`);
  process.stdout.write(`series-metrics: wrote ${outJson}\n`);
  if (series.missing.length > 0) {
    process.stderr.write(
      `series-metrics: WARNING missing archive for sprint(s): ${series.missing.join(', ')}\n`,
    );
  }
  return 0;
}

const isMain = (() => {
  try {
    return fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '');
  } catch {
    return false;
  }
})();

if (isMain) {
  const code = main();
  process.exit(code);
}

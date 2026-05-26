#!/usr/bin/env node
/**
 * changelog-backfill.mjs — Backfill docs/CHANGELOG.md with sprint entries
 * from .brain/memory.db and .brain/sprints/*.md log files.
 *
 * Usage:
 *   node scripts/changelog-backfill.mjs [--since sprint-157] [--until sprint-194]
 *   node scripts/changelog-backfill.mjs --dry-run
 *
 * Options:
 *   --since <sprint-id>  First sprint to backfill (default: sprint-157)
 *   --until <sprint-id>  Last sprint to backfill (default: sprint-194)
 *   --dry-run            Print entries without writing to file
 *   --db <path>          Path to memory.db (default: .brain/memory.db)
 */

import Database from 'better-sqlite3';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const VERSION = '1.0.0-beta.1';
const CHANGELOG_PATH = join(process.cwd(), 'docs', 'CHANGELOG.md');
const SPRINT_LOGS_DIR = join(process.cwd(), '.brain', 'sprints');
const DB_PATH_DEFAULT = join(process.cwd(), '.brain', 'memory.db');

/** Parse sprint number from a sprint-id like "sprint-157" */
export function parseSprintNum(sprintId) {
  const m = String(sprintId).match(/sprint-(\d+)/i);
  return m ? parseInt(m[1], 10) : NaN;
}

/**
 * Parse metrics from sprint log .md table format:
 *   | Total Tasks | 10 |
 *   | Completed   |  6 |
 *   | Tech Debt   |  4 |
 *   | No-Go       | 12 |
 *
 * Also handles newer DB sprint format:
 *   - Total tasks: 7
 *   - Completed: 7
 */
export function parseMetricsFromContent(content) {
  if (!content) return { total: 0, done: 0, techDebt: 0, noGo: 0 };
  const m = { total: 0, done: 0, techDebt: 0, noGo: 0 };
  for (const line of content.split('\n')) {
    // Markdown table row: | Key | Value |
    const tableMatch = line.match(/\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|/);
    if (tableMatch) {
      const key = tableMatch[1].toLowerCase();
      const val = parseInt(tableMatch[2], 10);
      if (key.includes('total')) m.total = val;
      else if ((key.includes('completed') || key === 'done') && !key.includes('no')) m.done = val;
      else if (key.includes('tech debt')) m.techDebt = val;
      else if (key.includes('no-go') || key.includes('nogo')) m.noGo = val;
      continue;
    }
    // Bullet format: - Total tasks: 7
    const bulletMatch = line.match(/^[-*]\s+([\w\s]+?):\s*(\d+)/);
    if (bulletMatch) {
      const key = bulletMatch[1].toLowerCase();
      const val = parseInt(bulletMatch[2], 10);
      if (key.includes('total')) m.total = val;
      else if (key.includes('completed') || key.includes('done')) m.done = val;
      else if (key.includes('tech debt')) m.techDebt = val;
      else if (key.includes('no-go') || key.includes('nogo') || key.includes('no_go')) m.noGo = val;
    }
  }
  return m;
}

/**
 * Parse task list from sprint log .md "## Tasks" table section ONLY.
 * Avoids narrative bullet points from retro content.
 *
 * Expected format inside ## Tasks section:
 *   | 156-001: Title | agent | skills | STATUS |
 */
export function parseTasksFromLogContent(content) {
  if (!content) return [];
  const tasks = [];

  // Only parse within the ## Tasks table section
  const tasksSectionMatch = content.match(/## Tasks[\s\S]*?(?=\n## |\n# |$)/);
  if (!tasksSectionMatch) return tasks;
  const section = tasksSectionMatch[0];

  for (const line of section.split('\n')) {
    // Table row: | task-id: Title | agent | skills | STATUS |
    const m = line.match(/^\|\s*[\w-]+-\d+:\s*(.+?)\s*\|\s*[\w\s,.-]*\s*\|\s*[\w\s,.-]*\s*\|\s*(DONE|GO_WITH_TECH_DEBT|NO_GO|PENDING)\s*\|/);
    if (m) {
      tasks.push({ title: m[1].trim(), status: m[2].trim() });
    }
  }
  return tasks;
}

/** Categorize task title: 'fix'/'bug' → fixed, else → added */
export function categorizeTitle(title) {
  const t = title.toLowerCase();
  return t.includes('fix') || t.includes('bug') || t.includes('hotfix') ? 'fixed' : 'added';
}

/** Build a changelog entry block for a sprint */
export function buildEntry(sprintNum, date, metrics, tasks) {
  const versionTag = `${VERSION}-sprint${sprintNum}`;
  const added = [];
  const changed = [];
  const fixed = [];

  for (const task of tasks) {
    if (task.status === 'NO_GO' || task.status === 'PENDING') continue;
    if (task.status === 'GO_WITH_TECH_DEBT') {
      changed.push(`- ${task.title} (completed with tech debt)`);
      continue;
    }
    const bucket = categorizeTitle(task.title);
    if (bucket === 'fixed') fixed.push(`- ${task.title}`);
    else added.push(`- ${task.title}`);
  }

  const sections = [];
  if (added.length > 0) {
    sections.push('### Added\n');
    sections.push(...added.slice(0, 10));
  }
  if (changed.length > 0) {
    if (sections.length > 0) sections.push('');
    sections.push('### Changed\n');
    sections.push(...changed.slice(0, 10));
  }
  if (fixed.length > 0) {
    if (sections.length > 0) sections.push('');
    sections.push('### Fixed\n');
    sections.push(...fixed.slice(0, 10));
  }
  if (sections.length === 0) {
    sections.push('### Added\n', '- No completed tasks');
  }

  const { total, done, techDebt, noGo } = metrics;
  const footer = `\n\n_Tasks: ${total} total, ${done} done, ${techDebt} tech debt, ${noGo} no-go_`;
  return `## [${versionTag}] - ${date}\n\n${sections.join('\n')}${footer}\n`;
}

/** Load sprint metrics + date from memory.db (no task parsing from retro) */
function loadFromDB(db, sprintNum) {
  const sprintId = `sprint-${sprintNum}`;

  const sprintEntry = db.prepare(
    `SELECT content, created_at FROM entries WHERE type='sprint' AND sprint_id=? LIMIT 1`
  ).get(sprintId);
  const retroEntry = db.prepare(
    `SELECT content, created_at FROM entries WHERE type='retro' AND sprint_id=? LIMIT 1`
  ).get(sprintId);

  const dateRow = db.prepare(
    `SELECT created_at FROM entries WHERE sprint_id=? ORDER BY created_at ASC LIMIT 1`
  ).get(sprintId);

  const date = dateRow?.created_at ? String(dateRow.created_at).slice(0, 10) : null;

  // For sprint log format entries (have a ## Tasks table), can get tasks
  const sprintContent = sprintEntry?.content ?? null;
  const retroContent = retroEntry?.content ?? null;

  return { sprintContent, retroContent, date };
}

/** Load sprint log file content from .brain/sprints/sprint-NNN.md */
function loadFromFile(sprintNum) {
  const filePath = join(SPRINT_LOGS_DIR, `sprint-${sprintNum}.md`);
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, 'utf-8');
}

/** Detect existing sprint entries in CHANGELOG to avoid duplicates */
export function detectExistingEntries(changelogContent) {
  const existing = new Set();
  const re = /^## \[1\.0\.0-beta\.1-sprint(\d+)\]/gm;
  let m;
  while ((m = re.exec(changelogContent)) !== null) {
    existing.add(parseInt(m[1], 10));
  }
  return existing;
}

/**
 * Insert new sprint entries into the changelog maintaining newest-first order.
 * Parses existing sprint blocks, merges new ones, re-sorts descending.
 */
export function insertEntries(existing, newEntries) {
  // Find where sprint entries start
  const headerEnd = existing.indexOf('\n## [');
  const header = headerEnd >= 0 ? existing.slice(0, headerEnd + 1) : existing;
  const rest = headerEnd >= 0 ? existing.slice(headerEnd + 1) : '';

  const blocks = new Map(); // sprintNum → block text
  const otherLines = [];

  const lines = rest.split('\n');
  let currentNum = null;
  let currentLines = null;

  for (const line of lines) {
    const sprintMatch = line.match(/^## \[1\.0\.0-beta\.1-sprint(\d+)\]/);
    if (sprintMatch) {
      if (currentLines !== null && currentNum !== null) {
        blocks.set(currentNum, currentLines.join('\n'));
      }
      currentNum = parseInt(sprintMatch[1], 10);
      currentLines = [line];
    } else if (line.match(/^## \[/) && !sprintMatch) {
      // Non-sprint header (e.g. [Unreleased])
      if (currentLines !== null && currentNum !== null) {
        blocks.set(currentNum, currentLines.join('\n'));
      }
      currentNum = null;
      currentLines = null;
      otherLines.push(line);
    } else {
      if (currentLines !== null) {
        currentLines.push(line);
      } else {
        otherLines.push(line);
      }
    }
  }
  if (currentLines !== null && currentNum !== null) {
    blocks.set(currentNum, currentLines.join('\n'));
  }

  // Merge new entries
  for (const [num, text] of newEntries) {
    blocks.set(num, text);
  }

  // Sort sprint blocks newest-first
  const sorted = [...blocks.entries()].sort((a, b) => b[0] - a[0]);

  const parts = [header];
  for (const [, blockText] of sorted) {
    parts.push(blockText);
  }

  const result = parts.join('\n').replace(/\n{3,}/g, '\n\n');
  return result;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const sinceIdx = args.indexOf('--since');
  const untilIdx = args.indexOf('--until');
  const dbIdx = args.indexOf('--db');

  const sinceId = sinceIdx >= 0 && args[sinceIdx + 1] ? args[sinceIdx + 1] : 'sprint-157';
  const untilId = untilIdx >= 0 && args[untilIdx + 1] ? args[untilIdx + 1] : 'sprint-194';
  const dbPath = dbIdx >= 0 && args[dbIdx + 1] ? args[dbIdx + 1] : DB_PATH_DEFAULT;

  const sinceNum = parseSprintNum(sinceId);
  const untilNum = parseSprintNum(untilId);

  if (isNaN(sinceNum) || isNaN(untilNum)) {
    console.error('ERROR: Invalid --since or --until format. Use sprint-NNN.');
    process.exit(1);
  }

  if (!existsSync(CHANGELOG_PATH)) {
    console.error(`ERROR: ${CHANGELOG_PATH} not found`);
    process.exit(1);
  }

  const changelog = readFileSync(CHANGELOG_PATH, 'utf-8');
  const existing = detectExistingEntries(changelog);

  let db = null;
  if (existsSync(dbPath)) {
    db = new Database(dbPath, { readonly: true });
  } else {
    console.warn(`WARN: memory.db not found at ${dbPath}, using sprint log files only`);
  }

  const newEntries = new Map(); // sprintNum → entry text
  let skipped = 0;
  let generated = 0;

  for (let n = sinceNum; n <= untilNum; n++) {
    if (existing.has(n)) {
      skipped++;
      continue;
    }

    let metrics = { total: 0, done: 0, techDebt: 0, noGo: 0 };
    let tasks = [];
    let date = null;

    // Priority 1: sprint log file (most structured, has task table)
    const fileContent = loadFromFile(n);
    if (fileContent) {
      metrics = parseMetricsFromContent(fileContent);
      tasks = parseTasksFromLogContent(fileContent);
    }

    // Priority 2: DB for date and metrics fallback
    if (db) {
      const { sprintContent, retroContent, date: dbDate } = loadFromDB(db, n);
      if (!date && dbDate) date = dbDate;
      // Only use DB sprint content for metrics if file had none
      if (metrics.total === 0 && sprintContent) {
        metrics = parseMetricsFromContent(sprintContent);
      }
      // Use DB sprint content for tasks if it has the log table format (not newer format)
      if (tasks.length === 0 && sprintContent && sprintContent.includes('| Task |')) {
        tasks = parseTasksFromLogContent(sprintContent);
      }
      // Retro metrics fallback
      if (metrics.total === 0 && retroContent) {
        const retroMetrics = parseMetricsFromContent(retroContent);
        // Retro "Tasks completed: N/M" → extract done/total
        const completedMatch = retroContent.match(/Tasks completed[^|]*\|\s*(\d+)\/(\d+)/);
        if (completedMatch) {
          retroMetrics.done = parseInt(completedMatch[1], 10);
          retroMetrics.total = parseInt(completedMatch[2], 10);
        }
        if (retroMetrics.total > 0) metrics = retroMetrics;
      }
    }

    // Date fallback for sprints with no DB entries
    if (!date) {
      if (n >= 157 && n <= 161) date = '2026-05-13';
      else if (n === 184) date = '2026-05-21';
      else if (n === 194) date = '2026-05-26';
      else date = '2026-05-14';
    }

    const entry = buildEntry(n, date, metrics, tasks);
    newEntries.set(n, entry);
    generated++;

    if (dryRun) {
      console.log(`--- sprint-${n} (${date}) ---`);
      console.log(entry);
    }
  }

  if (db) db.close();

  console.log(`Sprints in range ${sinceId}–${untilId}: ${untilNum - sinceNum + 1} total`);
  console.log(`  Already present (skipped): ${skipped}`);
  console.log(`  New entries generated: ${generated}`);

  if (generated === 0) {
    console.log('Nothing to do.');
    return;
  }

  if (!dryRun) {
    const updated = insertEntries(changelog, newEntries);
    writeFileSync(CHANGELOG_PATH, updated, 'utf-8');
    console.log(`Updated ${CHANGELOG_PATH}`);
  }
}

main();

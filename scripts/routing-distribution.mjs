#!/usr/bin/env node
/**
 * Routing Distribution Report — Sprint 209 Task 005
 *
 * Reads .deckent/routing/learnings.json and prints agent+skill usage
 * distribution. Warns when a single agent claims >70% of tasks.
 *
 * Usage:
 *   node scripts/routing-distribution.mjs
 *   node scripts/routing-distribution.mjs --root /path/to/project
 *   node scripts/routing-distribution.mjs --json
 *   node scripts/routing-distribution.mjs --threshold 60
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ─── Types ───────────────────────────────────────────────────────────────────

/** One agent or skill with its task count and percentage */
export function computeDistribution(
  performanceMap,
  totalOverride = null,
) {
  const entries = Object.entries(performanceMap);
  if (entries.length === 0) return { entries: [], total: 0 };

  const total = totalOverride ?? entries.reduce((s, [, p]) => s + (p.totalTasks ?? 0), 0);
  if (total === 0) return { entries: entries.map(([id]) => ({ id, tasks: 0, pct: 0 })), total: 0 };

  const result = entries
    .map(([id, p]) => ({
      id,
      tasks: p.totalTasks ?? 0,
      pct: Math.round(((p.totalTasks ?? 0) / total) * 1000) / 10,
    }))
    .sort((a, b) => b.tasks - a.tasks);

  return { entries: result, total };
}

/** Returns warning strings for entities that exceed the imbalance threshold */
export function detectImbalance(distributionEntries, threshold = 70) {
  const warnings = [];
  for (const { id, pct } of distributionEntries) {
    if (pct > threshold) {
      warnings.push(`IMBALANCE WARNING: "${id}" dominates with ${pct}% of tasks (threshold: ${threshold}%)`);
    }
  }
  return warnings;
}

/** Load learnings.json from <rootDir>/.deckent/routing/learnings.json */
export function loadLearnings(rootDir) {
  const p = join(rootDir, '.deckent', 'routing', 'learnings.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf('--root');
  const rootDir = rootIdx !== -1 && args[rootIdx + 1]
    ? resolve(args[rootIdx + 1])
    : process.cwd();
  const asJson = args.includes('--json');
  const threshIdx = args.indexOf('--threshold');
  const threshold = threshIdx !== -1 && args[threshIdx + 1]
    ? Number(args[threshIdx + 1])
    : 70;

  const learnings = loadLearnings(rootDir);
  if (!learnings) {
    console.error(`No learnings.json found at ${rootDir}/.deckent/routing/learnings.json`);
    process.exit(1);
  }

  const agentDist = computeDistribution(learnings.agentPerformance ?? {});
  const skillDist = computeDistribution(learnings.skillPerformance ?? {});
  const agentWarnings = detectImbalance(agentDist.entries, threshold);
  const skillWarnings = detectImbalance(skillDist.entries, threshold);
  const allWarnings = [...agentWarnings, ...skillWarnings];

  if (asJson) {
    console.log(JSON.stringify({
      agents: agentDist,
      skills: skillDist,
      warnings: allWarnings,
      totalOutcomes: learnings.totalOutcomes ?? 0,
    }, null, 2));
    return;
  }

  console.log('\n═══ Routing Distribution Report ═══\n');
  console.log(`Total outcomes recorded: ${learnings.totalOutcomes ?? 0}`);
  console.log(`Total agent task assignments: ${agentDist.total}`);
  console.log(`Total skill task assignments: ${skillDist.total}\n`);

  console.log('── Agent Usage ──');
  for (const { id, tasks, pct } of agentDist.entries) {
    const bar = '█'.repeat(Math.round(pct / 5));
    console.log(`  ${id.padEnd(28)} ${String(tasks).padStart(5)} tasks  ${String(pct).padStart(5)}%  ${bar}`);
  }

  console.log('\n── Skill Usage ──');
  for (const { id, tasks, pct } of skillDist.entries) {
    const bar = '█'.repeat(Math.round(pct / 5));
    console.log(`  ${id.padEnd(28)} ${String(tasks).padStart(5)} tasks  ${String(pct).padStart(5)}%  ${bar}`);
  }

  if (allWarnings.length > 0) {
    console.log('\n⚠️  Imbalance Warnings:');
    for (const w of allWarnings) console.log(`  ${w}`);
  } else {
    console.log('\n✓ No imbalance detected (all agents/skills below threshold)');
  }

  console.log('');
}

// Run only when invoked directly (not when imported in tests)
if (process.argv[1] && (
  process.argv[1].endsWith('routing-distribution.mjs') ||
  process.argv[1].includes('routing-distribution')
)) {
  main();
}

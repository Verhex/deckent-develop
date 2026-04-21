#!/usr/bin/env node
/**
 * bundle-builtins.mjs — Sync built-in agents/skills from .deckent/ (dev) to src/core/builtins/.
 *
 * This script copies the canonical built-in agent and skill definitions from the
 * dev workspace (.deckent/agents/, .deckent/skills/) into src/core/builtins/ for
 * npm distribution. The copy-assets.mjs script then picks them up during build
 * and places them in dist/core/builtins/.
 *
 * Usage: node scripts/bundle-builtins.mjs [--dry-run] [--clean-stats]
 *
 * Sprint 150 Task 031 — P0 Beta GA Blocker.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, '.deckent');
const DST = join(ROOT, 'src', 'core', 'builtins');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const cleanStats = args.includes('--clean-stats');

let copied = 0;
let skipped = 0;

for (const category of ['agents', 'skills']) {
  const srcDir = join(SRC, category);
  const dstDir = join(DST, category);

  if (!existsSync(srcDir)) {
    console.warn(`⚠ Source directory not found: ${srcDir}`);
    continue;
  }

  if (!dryRun) {
    mkdirSync(dstDir, { recursive: true });
  }

  let entries;
  try {
    entries = readdirSync(srcDir);
  } catch {
    console.warn(`⚠ Cannot read: ${srcDir}`);
    continue;
  }

  for (const entry of entries) {
    const srcEntry = join(srcDir, entry);
    const stat = statSync(srcEntry);
    if (!stat.isDirectory()) continue;

    // Skip temp agents (LRU eviction targets) and archive
    if (entry.startsWith('temp-') || entry === 'archive') {
      skipped++;
      continue;
    }

    const dstEntry = join(dstDir, entry);

    if (dryRun) {
      console.log(`[dry-run] ${category}/${entry}`);
    } else {
      // Clean copy — remove existing first for idempotency
      if (existsSync(dstEntry)) {
        rmSync(dstEntry, { recursive: true, force: true });
      }
      cpSync(srcEntry, dstEntry, { recursive: true });

      // Optionally clean dev stats for distribution
      if (cleanStats) {
        cleanDevStats(dstEntry, category);
      }
    }
    copied++;
  }
}

if (dryRun) {
  console.log(`\n[dry-run] Would bundle ${copied} items (${skipped} skipped)`);
} else {
  console.log(`✓ bundle-builtins: ${copied} items bundled to src/core/builtins/ (${skipped} skipped)`);
}

/**
 * Reset dev-specific usage stats to zero for clean distribution.
 */
function cleanDevStats(entryDir, category) {
  if (category === 'agents') {
    const jsonPath = join(entryDir, 'agent.json');
    if (existsSync(jsonPath)) {
      try {
        const agent = JSON.parse(readFileSync(jsonPath, 'utf-8'));
        if (agent.stats) {
          agent.stats = { totalUses: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '' };
          writeFileSync(jsonPath, JSON.stringify(agent, null, 2) + '\n');
        }
      } catch { /* best-effort */ }
    }
  } else if (category === 'skills') {
    const jsonPath = join(entryDir, 'manifest.json');
    if (existsSync(jsonPath)) {
      try {
        const skill = JSON.parse(readFileSync(jsonPath, 'utf-8'));
        if (skill.stats) {
          skill.stats = { totalUses: 0, successCount: 0, successRate: 0, avgScore: 0, lastUsedInSprint: '' };
          writeFileSync(jsonPath, JSON.stringify(skill, null, 2) + '\n');
        }
      } catch { /* best-effort */ }
    }
  }
}

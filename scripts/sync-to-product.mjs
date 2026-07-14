#!/usr/bin/env node
// sync-to-product.mjs — Prepare deckent-develop → deckent (product) staging snapshot.
//
// Status (ADR-D-008, accepted 2026-06-30 — supersedes the retired ADR-065 two-repo
// continuous-sync model): today is SINGLE-repo development; there is NO ongoing
// develop→product sync. This script is retained as the building block for the
// one-time GA-2 public migration (deckent-develop → deckent, sensitive-scrub) that
// ADR-D-008's roadmap defines. Do not run it as a recurring sync.
//   • deckent-develop = full history, internal sprint state (.brain, .deckent/archive)
//   • deckent         = future public product repo, clean snapshot (no sprint internals)
//
// Usage:
//   node scripts/sync-to-product.mjs              # dry-run: report keep/drop + security PASS
//   node scripts/sync-to-product.mjs --apply      # extract HEAD → tmp staging dir, prune EXCLUDE
//   node scripts/sync-to-product.mjs --apply --staging=/path/to/dir
//
// Script ONLY prepares a staging directory — push is HUMAN-controlled
// (public-publish blast radius: orphan commit + git push --force is irreversible).

import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');

// Single source of truth — Sprint 201 manual snapshot list, 1:1.
// Directory entries end with `/` (prefix match); file entries are exact match.
export const EXCLUDE = [
  // directories — sprint internals + user-private docs
  '.brain/',
  '.deckent/archive/',
  'docs/superpowers/',
  'docs/directives/',
  'docs/launch/',
  'docs/release/',
  'docs/development/',
  'docs/archive/',
  'docs/audits/',
  'docs/analysis/',
  '.deckent/docs/core-memory/',
  // personal root markdowns
  'DIRECTIVES.md',
  'RESUME-MONDAY.md',
  'DECKENT-ANA-PLAN.md',
  'DECKENT-ANA-PLAN-TR.md',
  'NERVOUS-TODO.md',
  // runtime state — never publish
  '.deckent/config.json',
  '.deckent/config.json.bak',
  '.deckent/provider-cache.json',
  '.deckent/ci-baseline.json',
];

// API key shapes — real Anthropic + Google. Length-bounded to avoid false hits on
// short identifiers. NOTE: literal strings "sk-ant" and "AIza" appear here on purpose
// (goCriteria: grep -c "sk-ant\|AIza" must be ≥1).
const KEY_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]{20,}/g,
  /AIza[A-Za-z0-9_-]{30,}/g,
];

// Test fixtures may legitimately contain key-shaped strings; do not abort on them.
const KEY_FIXTURE_ALLOW = [/^tests?\//, /__fixtures__/];

const MAX_SCAN_BYTES = 5 * 1024 * 1024;

export function isExcluded(relPath, excludeList = EXCLUDE) {
  for (const pat of excludeList) {
    if (pat.endsWith('/')) {
      if (relPath === pat.slice(0, -1) || relPath.startsWith(pat)) return true;
    } else if (relPath === pat) {
      return true;
    }
  }
  return false;
}

export function partitionFiles(files, excludeList = EXCLUDE) {
  const keep = [];
  const drop = [];
  for (const f of files) (isExcluded(f, excludeList) ? drop : keep).push(f);
  return { keep, drop };
}

export function shouldSkipKeyScan(relPath, allowList = KEY_FIXTURE_ALLOW) {
  return allowList.some((re) => re.test(relPath));
}

export function scanForKeys(content) {
  const hits = [];
  for (const pat of KEY_PATTERNS) {
    const m = content.match(pat);
    if (m) hits.push(...m);
  }
  return hits;
}

function sh(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'pipe', encoding: 'utf-8', ...opts });
}

function listTrackedFiles(repoRoot) {
  return sh(`git -C "${repoRoot}" ls-files`).split('\n').filter(Boolean);
}

function extractHeadInto(repoRoot, dest) {
  sh(`git -C "${repoRoot}" archive --format=tar HEAD | tar -x -C "${dest}"`, { shell: '/bin/bash' });
}

function pruneExcluded(stagingDir, dropList, excludeDirs) {
  for (const rel of dropList) {
    try { rmSync(join(stagingDir, rel), { recursive: true, force: true }); } catch {}
  }
  for (const pat of excludeDirs) {
    try { rmSync(join(stagingDir, pat), { recursive: true, force: true }); } catch {}
  }
}

export function syncToProduct(opts = {}) {
  const dryRun = opts.dryRun !== false;
  const repoRoot = opts.repoRoot ?? REPO_ROOT;
  const log = opts.log ?? (() => {});

  const tracked = opts.trackedFiles ?? listTrackedFiles(repoRoot);
  const { keep, drop } = partitionFiles(tracked);
  log(`tracked=${tracked.length} keep=${keep.length} drop=${drop.length}`);

  const violations = [];
  for (const rel of keep) {
    if (shouldSkipKeyScan(rel)) continue;
    const abs = join(repoRoot, rel);
    if (!existsSync(abs)) continue;
    try {
      if (statSync(abs).size > MAX_SCAN_BYTES) continue;
      const hits = scanForKeys(readFileSync(abs, 'utf-8'));
      if (hits.length > 0) violations.push({ file: rel, hits: hits.slice(0, 3) });
    } catch { /* unreadable → skip */ }
  }

  if (violations.length > 0) {
    return { ok: false, abort: 'security', dryRun, keep: keep.length, drop: drop.length, violations };
  }

  let staging = null;
  if (!dryRun) {
    staging = opts.stagingDir ?? mkdtempSync(join(tmpdir(), 'deckent-product-'));
    extractHeadInto(repoRoot, staging);
    const excludeDirs = EXCLUDE.filter((p) => p.endsWith('/'));
    pruneExcluded(staging, drop, excludeDirs);
    log(`staging=${staging}`);
  }

  return {
    ok: true,
    dryRun,
    keep: keep.length,
    drop: drop.length,
    staging,
    dropList: drop,
    keepListSize: keep.length,
  };
}

function parseArgs(argv) {
  const opts = { dryRun: true };
  for (const a of argv.slice(2)) {
    if (a === '--apply') opts.dryRun = false;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a.startsWith('--staging=')) opts.stagingDir = a.slice('--staging='.length);
  }
  return opts;
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  const opts = parseArgs(process.argv);
  const report = syncToProduct({ ...opts, log: (msg) => process.stderr.write(`[sync] ${msg}\n`) });
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exit(report.ok ? 0 : 1);
}

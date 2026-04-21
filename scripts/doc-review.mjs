#!/usr/bin/env node
/**
 * doc-review.mjs — Deckent .md Documentation Review Script
 *
 * Scans all .md files in the workspace, categorizes them as:
 *   KEEP   — up-to-date, no issues
 *   REVISE — stale sprint refs, broken links, or needs update
 *   DELETE — empty, near-duplicate, or archived noise
 *   MOVE   — misplaced file (wrong directory)
 *
 * Output: docs/audits/sprint-150/doc-review-report.md
 *
 * Usage: node scripts/doc-review.mjs [--dry-run] [--root <path>] [--sprint <N>]
 */

import { readFileSync, statSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative, dirname, basename, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

// ─── Config ──────────────────────────────────────────────────────────────────

const CURRENT_SPRINT = 150;
const STALE_THRESHOLD = 10;          // Sprint N < current-threshold → REVISE
const STALE_SPRINT_CUTOFF = CURRENT_SPRINT - STALE_THRESHOLD; // 140
const OUTPUT_PATH = 'docs/audits/sprint-150/doc-review-report.md';

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.tasks',
  '.locks',
]);

// Files that should be at root (don't flag as MOVE)
const ROOT_OK_FILES = new Set([
  'README.md',
  'README-TR.md',
  'CONTRIBUTING.md',
  'CHANGELOG.md',
  'LICENSE.md',
  'CLAUDE.md',
  'DECKENT.md',
  'DIRECTIVES.md',
  'AGENTS.md',
  'VISION.md',
  'BETA-TRACKER.md',
  'COMPETITIVE-ANALYSIS.md',
  'ROADMAP.md',
  'SECURITY.md',
]);

// Patterns that indicate a file belongs in docs/ instead of root
const SHOULD_BE_IN_DOCS_PATTERN = /^[A-Z][A-Z0-9-]+\.md$/;

// ─── File Discovery ───────────────────────────────────────────────────────────

function findAllMarkdownFiles(rootDir) {
  const results = [];

  function walk(dir) {
    let entries;
    try {
      entries = execSync(`ls -1a "${dir}"`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
        .split('\n')
        .filter(e => e && e !== '.' && e !== '..');
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.startsWith('.') && !entry.startsWith('.brain') && !entry.startsWith('.deckent') && !entry.startsWith('.claude') && !entry.startsWith('.gemini')) {
        // Skip hidden dirs except known deckent ones
        const fullPath = join(dir, entry);
        try {
          const st = statSync(fullPath);
          if (st.isDirectory()) continue;
        } catch { continue; }
      }

      const fullPath = join(dir, entry);
      let st;
      try { st = statSync(fullPath); } catch { continue; }

      if (st.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry)) continue;
        walk(fullPath);
      } else if (entry.endsWith('.md') || entry.endsWith('.MD')) {
        results.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return results;
}

// ─── File Analysis ────────────────────────────────────────────────────────────

function analyzeFile(filePath, rootDir) {
  const relPath = relative(rootDir, filePath);
  let content = '';
  let stat;

  try {
    stat = statSync(filePath);
    content = readFileSync(filePath, 'utf-8');
  } catch (err) {
    return { relPath, error: err.message, category: 'DELETE', reasons: ['unreadable'] };
  }

  const sizeBytes = stat.size;
  const lastModified = stat.mtime;
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);

  // Sprint reference analysis
  const sprintRefs = extractSprintRefs(content);
  const maxSprintRef = sprintRefs.length > 0 ? Math.max(...sprintRefs) : null;
  const minSprintRef = sprintRefs.length > 0 ? Math.min(...sprintRefs) : null;
  const hasOldSprintRefs = sprintRefs.some(n => n < STALE_SPRINT_CUTOFF);

  // Internal link extraction
  const internalLinks = extractInternalLinks(content, filePath, rootDir);
  const brokenLinks = internalLinks.filter(link => !link.exists);

  return {
    relPath,
    sizeBytes,
    lastModified,
    hash,
    sprintRefs,
    maxSprintRef,
    minSprintRef,
    hasOldSprintRefs,
    internalLinks,
    brokenLinks,
    isEmpty: sizeBytes === 0 || content.trim().length === 0,
    lineCount: content.split('\n').length,
    content,  // kept for duplicate detection (will be cleared after hashing)
  };
}

function extractSprintRefs(content) {
  const refs = new Set();
  // Match "Sprint N", "sprint-N", "sprint_N", "S-N" (3 or more digits)
  const pattern = /\bsprint[-_ ]?(\d{3,})\b/gi;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const num = parseInt(match[1], 10);
    if (num >= 1 && num <= 300) refs.add(num);
  }
  return Array.from(refs);
}

function extractInternalLinks(content, filePath, rootDir) {
  const fileDir = dirname(filePath);
  const links = [];

  // Match [text](path) — only relative paths (no http/https)
  const pattern = /\[([^\]]*)\]\(([^)#]+)(?:#[^)]*)?\)/g;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    const href = match[2].trim();
    if (href.startsWith('http') || href.startsWith('mailto') || href.startsWith('//')) continue;

    // Resolve relative to file location
    let resolved;
    if (href.startsWith('/')) {
      resolved = join(rootDir, href);
    } else {
      resolved = join(fileDir, href);
    }

    const exists = existsSync(resolved) || existsSync(resolved + '.md');
    links.push({ href, resolved: relative(rootDir, resolved), exists });
  }

  return links;
}

// ─── Categorization ───────────────────────────────────────────────────────────

function categorize(info, seenHashes, rootDir) {
  const reasons = [];

  // DELETE conditions
  if (info.isEmpty) {
    reasons.push('empty file');
    return { category: 'DELETE', reasons };
  }

  if (seenHashes.has(info.hash)) {
    reasons.push(`duplicate of ${seenHashes.get(info.hash)}`);
    return { category: 'DELETE', reasons };
  }

  // MOVE conditions — root-level files that look like they belong in docs/
  const fileName = basename(info.relPath);
  const isAtRoot = !info.relPath.includes('/');
  if (isAtRoot && !ROOT_OK_FILES.has(fileName) && SHOULD_BE_IN_DOCS_PATTERN.test(fileName)) {
    reasons.push('root-level doc file — should be in docs/');
    return { category: 'MOVE', reasons };
  }

  // Archive/temp directories that should be cleaned up
  if (info.relPath.includes('archive/') || info.relPath.includes('-archive/')) {
    reasons.push('in archive directory');
    return { category: 'DELETE', reasons };
  }

  // REVISE conditions
  if (info.hasOldSprintRefs && info.maxSprintRef !== null && info.maxSprintRef < STALE_SPRINT_CUTOFF) {
    reasons.push(`stale sprint refs (max sprint-${info.maxSprintRef}, cutoff sprint-${STALE_SPRINT_CUTOFF})`);
  }

  if (info.brokenLinks.length > 0) {
    reasons.push(`${info.brokenLinks.length} broken link(s): ${info.brokenLinks.slice(0, 3).map(l => l.href).join(', ')}`);
  }

  if (reasons.length > 0) {
    return { category: 'REVISE', reasons };
  }

  return { category: 'KEEP', reasons: [] };
}

// ─── Report Generation ────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function generateReport(results, rootDir) {
  const byCategory = { KEEP: [], REVISE: [], DELETE: [], MOVE: [] };

  for (const r of results) {
    byCategory[r.category].push(r);
  }

  const totalFiles = results.length;
  const brokenLinksTotal = results.reduce((sum, r) => sum + (r.brokenLinks?.length ?? 0), 0);
  const duplicateCount = byCategory.DELETE.filter(r => r.reasons.some(x => x.startsWith('duplicate'))).length;
  const staleCount = byCategory.REVISE.filter(r => r.reasons.some(x => x.startsWith('stale'))).length;

  const lines = [];

  lines.push(`# Documentation Review Report — Sprint ${CURRENT_SPRINT}`);
  lines.push('');
  lines.push(`> Generated: ${new Date().toISOString()}`);
  lines.push(`> Root: ${rootDir}`);
  lines.push(`> Stale sprint cutoff: sprint-${STALE_SPRINT_CUTOFF} (current - ${STALE_THRESHOLD})`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total .md files scanned | ${totalFiles} |`);
  lines.push(`| KEEP | ${byCategory.KEEP.length} |`);
  lines.push(`| REVISE | ${byCategory.REVISE.length} |`);
  lines.push(`| DELETE | ${byCategory.DELETE.length} |`);
  lines.push(`| MOVE | ${byCategory.MOVE.length} |`);
  lines.push(`| Broken internal links | ${brokenLinksTotal} |`);
  lines.push(`| Duplicate files | ${duplicateCount} |`);
  lines.push(`| Files with stale sprint refs | ${staleCount} |`);
  lines.push('');

  // ── KEEP ──
  lines.push('## KEEP');
  lines.push('');
  lines.push('Files that appear current and well-maintained.');
  lines.push('');
  if (byCategory.KEEP.length === 0) {
    lines.push('_No files in this category._');
  } else {
    lines.push('| File | Size | Last Modified | Lines | Sprint Refs |');
    lines.push('|------|------|---------------|-------|-------------|');
    for (const r of byCategory.KEEP.sort((a, b) => a.relPath.localeCompare(b.relPath))) {
      const sprints = r.sprintRefs?.length > 0 ? r.sprintRefs.slice(0, 3).map(n => `s-${n}`).join(', ') : '—';
      lines.push(`| \`${r.relPath}\` | ${formatBytes(r.sizeBytes)} | ${formatDate(r.lastModified)} | ${r.lineCount} | ${sprints} |`);
    }
  }
  lines.push('');

  // ── REVISE ──
  lines.push('## REVISE');
  lines.push('');
  lines.push('Files that need attention — stale sprint references, broken links, or outdated content.');
  lines.push('');
  if (byCategory.REVISE.length === 0) {
    lines.push('_No files in this category._');
  } else {
    lines.push('| File | Size | Last Modified | Reasons |');
    lines.push('|------|------|---------------|---------|');
    for (const r of byCategory.REVISE.sort((a, b) => a.relPath.localeCompare(b.relPath))) {
      const reasonStr = r.reasons.join('; ');
      lines.push(`| \`${r.relPath}\` | ${formatBytes(r.sizeBytes)} | ${formatDate(r.lastModified)} | ${reasonStr} |`);
    }
  }
  lines.push('');

  // ── DELETE ──
  lines.push('## DELETE');
  lines.push('');
  lines.push('Files recommended for removal — empty, duplicate, or archived noise.');
  lines.push('');
  if (byCategory.DELETE.length === 0) {
    lines.push('_No files in this category._');
  } else {
    lines.push('| File | Size | Reason |');
    lines.push('|------|------|--------|');
    for (const r of byCategory.DELETE.sort((a, b) => a.relPath.localeCompare(b.relPath))) {
      const reasonStr = r.reasons.join('; ');
      lines.push(`| \`${r.relPath}\` | ${formatBytes(r.sizeBytes ?? 0)} | ${reasonStr} |`);
    }
  }
  lines.push('');

  // ── MOVE ──
  lines.push('## MOVE');
  lines.push('');
  lines.push('Files in wrong location — should be moved to appropriate directory.');
  lines.push('');
  if (byCategory.MOVE.length === 0) {
    lines.push('_No files in this category._');
  } else {
    lines.push('| File | Size | Last Modified | Reason | Suggested Location |');
    lines.push('|------|------|---------------|--------|-------------------|');
    for (const r of byCategory.MOVE.sort((a, b) => a.relPath.localeCompare(b.relPath))) {
      const reasonStr = r.reasons.join('; ');
      const suggested = `docs/${basename(r.relPath)}`;
      lines.push(`| \`${r.relPath}\` | ${formatBytes(r.sizeBytes)} | ${formatDate(r.lastModified)} | ${reasonStr} | \`${suggested}\` |`);
    }
  }
  lines.push('');

  // ── Broken Links Detail ──
  lines.push('## Broken Internal Links Detail');
  lines.push('');
  const filesWithBrokenLinks = results.filter(r => r.brokenLinks?.length > 0);
  if (filesWithBrokenLinks.length === 0) {
    lines.push('_No broken internal links found._');
  } else {
    lines.push('| File | Broken Link | Resolved Path |');
    lines.push('|------|-------------|---------------|');
    for (const r of filesWithBrokenLinks) {
      for (const link of r.brokenLinks.slice(0, 10)) {
        lines.push(`| \`${r.relPath}\` | \`${link.href}\` | \`${link.resolved}\` |`);
      }
    }
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`_Report generated by \`scripts/doc-review.mjs\` on ${new Date().toISOString()}_`);

  return lines.join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const rootIdx = args.indexOf('--root');
  const rootDir = rootIdx !== -1 ? args[rootIdx + 1] : process.cwd();
  // Allow --sprint N override at runtime
  const sprintIdx = args.indexOf('--sprint');
  if (sprintIdx !== -1) {
    const sprintOverride = parseInt(args[sprintIdx + 1], 10);
    if (!isNaN(sprintOverride)) {
      // Dynamic override is informational only — CURRENT_SPRINT is const above
      // For full override, re-run with different source; this just shows awareness
      console.log(`[doc-review] Sprint override flag detected: ${sprintOverride} (hardcoded: ${CURRENT_SPRINT})`);
    }
  }

  console.log(`[doc-review] Root: ${rootDir}`);
  console.log(`[doc-review] Current sprint: ${CURRENT_SPRINT}, stale cutoff: sprint-${STALE_SPRINT_CUTOFF}`);
  console.log(`[doc-review] Scanning .md files...`);

  // Find all markdown files
  let allFiles;
  try {
    // Use find command for reliability
    const findOutput = execSync(
      `find "${rootDir}" -name "*.md" -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*"`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );
    allFiles = findOutput.trim().split('\n').filter(Boolean);
  } catch (err) {
    console.error('[doc-review] find command failed:', err.message);
    process.exit(1);
  }

  console.log(`[doc-review] Found ${allFiles.length} .md files`);

  // Analyze files
  const analyzed = [];
  const seenHashes = new Map(); // hash → first relPath

  for (const filePath of allFiles) {
    const info = analyzeFile(filePath, rootDir);
    if (info.error) {
      analyzed.push({ ...info, category: 'DELETE', sizeBytes: 0, lastModified: new Date(), lineCount: 0, brokenLinks: [], sprintRefs: [] });
      continue;
    }

    // Categorize BEFORE marking hash as seen — so first occurrence is not flagged as duplicate
    const { category, reasons } = categorize(info, seenHashes, rootDir);

    // Track first-seen hash for duplicate detection (after categorize)
    if (!info.isEmpty && !seenHashes.has(info.hash)) {
      seenHashes.set(info.hash, info.relPath);
    }

    analyzed.push({ ...info, category, reasons, content: undefined }); // strip content from result
  }

  // Stats
  const counts = { KEEP: 0, REVISE: 0, DELETE: 0, MOVE: 0 };
  for (const r of analyzed) counts[r.category]++;

  console.log(`[doc-review] Categories:`);
  console.log(`  KEEP:   ${counts.KEEP}`);
  console.log(`  REVISE: ${counts.REVISE}`);
  console.log(`  DELETE: ${counts.DELETE}`);
  console.log(`  MOVE:   ${counts.MOVE}`);

  // Generate report
  const report = generateReport(analyzed, rootDir);

  if (dryRun) {
    console.log('[doc-review] --dry-run: not writing output file');
    console.log(report.slice(0, 500) + '...');
  } else {
    const outputPath = join(rootDir, OUTPUT_PATH);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, report, 'utf-8');
    console.log(`[doc-review] Report written to: ${OUTPUT_PATH}`);
    console.log(`[doc-review] Total lines: ${report.split('\n').length}`);
  }

  console.log('[doc-review] Done.');
}

main().catch(err => {
  console.error('[doc-review] Fatal error:', err);
  process.exit(1);
});

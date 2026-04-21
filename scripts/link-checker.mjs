#!/usr/bin/env node
/**
 * link-checker.mjs — Markdown internal link validator
 *
 * Scans all .md files and validates:
 * - Internal file links: [text](path/to/file.md) → check file exists
 * - Anchor links: [text](#heading) → reported but not validated (complex)
 * - External URLs: [text](https://...) → reported as SKIPPED (no network)
 *
 * Usage: node scripts/link-checker.mjs [--json] [--dir <path>] [--strict]
 *   --json      Output JSON instead of human-readable
 *   --dir       Root directory to scan (default: repo root)
 *   --strict    Exit 1 if any broken links found (default: exit 0)
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const args = process.argv.slice(2);
const OUTPUT_JSON = args.includes('--json');
const STRICT_MODE = args.includes('--strict');

const dirArgIdx = args.indexOf('--dir');
const SCAN_ROOT = dirArgIdx !== -1 ? resolve(args[dirArgIdx + 1]) : ROOT;

// Directories to exclude from scanning
const EXCLUDE_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.tasks',
  '.locks',
  'coverage',
  '.brain/archive',
]);

/**
 * Recursively find all .md files under a directory.
 */
function findMarkdownFiles(dir) {
  const results = [];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relPath = relative(SCAN_ROOT, fullPath);

      // Check if any excluded dir prefix matches
      const shouldExclude = [...EXCLUDE_DIRS].some(ex =>
        relPath === ex || relPath.startsWith(ex + '/') || relPath.startsWith(ex + '\\')
      );
      if (shouldExclude) continue;

      if (entry.isDirectory()) {
        results.push(...findMarkdownFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  } catch {
    // Permission denied or similar — skip silently
  }

  return results;
}

/**
 * Extract all markdown links from content.
 * Returns array of {text, href, line, col, type}
 */
function extractLinks(content, filePath) {
  const links = [];
  const lines = content.split('\n');

  // Pattern matches [text](href) — handles nested brackets and parens
  // Excludes image links ![]()
  const LINK_PATTERN = /(?<!!)\[([^\]]*)\]\(([^)]+)\)/g;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    let match;
    LINK_PATTERN.lastIndex = 0;

    while ((match = LINK_PATTERN.exec(line)) !== null) {
      const text = match[1];
      const href = match[2].trim().split(' ')[0]; // Remove title if present: [text](url "title")

      // Classify link type
      let type;
      if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
        type = 'external';
      } else if (href.startsWith('#')) {
        type = 'anchor';
      } else if (href.startsWith('mailto:')) {
        type = 'email';
      } else {
        type = 'internal';
      }

      links.push({
        text,
        href,
        line: lineIdx + 1,
        col: match.index + 1,
        type,
        sourceFile: filePath,
      });
    }
  }

  return links;
}

/**
 * Validate an internal link.
 * Returns { valid, reason }
 */
function validateInternalLink(href, sourceFile) {
  // Strip anchor from href
  const [filePart, anchor] = href.split('#');

  // Pure anchor link with no file part
  if (!filePart) {
    return { valid: null, reason: 'anchor-only', status: 'ANCHOR' };
  }

  // Resolve path relative to the source file's directory
  const sourceDir = dirname(sourceFile);
  const targetPath = resolve(sourceDir, filePart);

  if (!existsSync(targetPath)) {
    return { valid: false, reason: `File not found: ${relative(SCAN_ROOT, targetPath)}`, status: 'BROKEN' };
  }

  try {
    const stat = statSync(targetPath);
    if (stat.isDirectory()) {
      // Check for README.md in directory
      const indexPath = join(targetPath, 'README.md');
      if (existsSync(indexPath)) {
        return { valid: true, reason: 'directory → README.md', status: 'OK' };
      }
      return { valid: false, reason: `Directory without README.md: ${relative(SCAN_ROOT, targetPath)}`, status: 'BROKEN' };
    }
  } catch {
    return { valid: false, reason: 'Cannot stat file', status: 'BROKEN' };
  }

  return { valid: true, reason: 'exists', status: 'OK' };
}

/**
 * Process a single markdown file.
 */
function processFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const links = extractLinks(content, filePath);
  const results = [];

  for (const link of links) {
    let validation;

    switch (link.type) {
      case 'external':
        validation = { valid: null, reason: 'external URL — skipped', status: 'SKIPPED' };
        break;
      case 'anchor':
        validation = { valid: null, reason: 'in-page anchor — not validated', status: 'ANCHOR' };
        break;
      case 'email':
        validation = { valid: null, reason: 'email link — skipped', status: 'SKIPPED' };
        break;
      case 'internal':
        validation = validateInternalLink(link.href, filePath);
        break;
      default:
        validation = { valid: null, reason: 'unknown type', status: 'UNKNOWN' };
    }

    results.push({
      ...link,
      sourceFile: relative(SCAN_ROOT, filePath),
      ...validation,
    });
  }

  return results;
}

// ─── Main ──────────────────────────────────────────────────────────────────

const mdFiles = findMarkdownFiles(SCAN_ROOT);
const allResults = [];

for (const filePath of mdFiles) {
  try {
    const fileResults = processFile(filePath);
    allResults.push(...fileResults);
  } catch (err) {
    allResults.push({
      sourceFile: relative(SCAN_ROOT, filePath),
      href: '',
      type: 'error',
      status: 'ERROR',
      reason: err.message,
      text: '',
      line: 0,
      col: 0,
    });
  }
}

// Categorize results
const broken = allResults.filter(r => r.status === 'BROKEN');
const ok = allResults.filter(r => r.status === 'OK');
const skipped = allResults.filter(r => r.status === 'SKIPPED');
const anchors = allResults.filter(r => r.status === 'ANCHOR');
const errors = allResults.filter(r => r.status === 'ERROR');

if (OUTPUT_JSON) {
  console.log(JSON.stringify({
    summary: {
      totalFiles: mdFiles.length,
      totalLinks: allResults.length,
      broken: broken.length,
      ok: ok.length,
      skipped: skipped.length,
      anchors: anchors.length,
      errors: errors.length,
    },
    broken,
    errors,
    ok,
    skipped,
    anchors,
  }, null, 2));
} else {
  console.log('\n🔗 Markdown Link Checker\n');
  console.log('─'.repeat(70));
  console.log(`Scanned: ${mdFiles.length} files | Found: ${allResults.length} links`);
  console.log(`  ✅ OK: ${ok.length}  |  ❌ Broken: ${broken.length}  |  ⏭  Skipped: ${skipped.length}  |  ⚓ Anchors: ${anchors.length}`);
  console.log('─'.repeat(70));

  if (broken.length > 0) {
    console.log(`\n❌ BROKEN LINKS (${broken.length}):\n`);
    for (const link of broken) {
      console.log(`  File: ${link.sourceFile}:${link.line}`);
      console.log(`  Link: [${link.text}](${link.href})`);
      console.log(`  Issue: ${link.reason}`);
      console.log('');
    }
  } else {
    console.log('\n✅ No broken internal links found!');
  }

  if (errors.length > 0) {
    console.log(`\n⚠️  SCAN ERRORS (${errors.length}):\n`);
    for (const e of errors) {
      console.log(`  File: ${e.sourceFile} — ${e.reason}`);
    }
  }

  if (skipped.length > 0) {
    console.log(`\n⏭  EXTERNAL LINKS (${skipped.length} — not validated):`);
    // Show unique domains only
    const domains = new Set(
      skipped
        .filter(l => l.href.startsWith('http'))
        .map(l => {
          try { return new URL(l.href).hostname; } catch { return l.href; }
        })
    );
    for (const domain of [...domains].slice(0, 10)) {
      console.log(`  - ${domain}`);
    }
    if (domains.size > 10) {
      console.log(`  ... and ${domains.size - 10} more domains`);
    }
  }

  console.log('\n' + '─'.repeat(70));
  console.log(`\nResult: ${broken.length === 0 ? '✅ PASS' : `❌ ${broken.length} broken link(s) found`}`);
}

if (STRICT_MODE && broken.length > 0) {
  process.exit(1);
}

process.exit(0);

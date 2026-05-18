#!/usr/bin/env node
/**
 * lint-links.mjs — Markdown dead-link gate (Sprint 172 C3, OSS GA pre-flight)
 *
 * Validates:
 *  - Relative file links ([txt](./foo.md) / [txt](../bar/baz.md))
 *  - VitePress site-relative links ([txt](/reference/config))
 *  - Markdown anchor fragments (#heading-slug) against the target file's headings
 *  - Self-anchors ([txt](#section))
 *
 * Skips:
 *  - External URLs (http://, https://, mailto:, //...)
 *  - Empty / unknown
 *
 * Usage:
 *   node scripts/lint-links.mjs [--root <dir>] [--json] [--no-ignore]
 *
 * Exit codes:
 *   0 — no broken links
 *   1 — broken links found (gate-fail)
 *
 * Ignore file: `.lintlinkignore` (gitignore-like glob patterns, repo root).
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── classifyHref ──────────────────────────────────────────────────────────

/**
 * Classify a markdown link target.
 * @param {string} raw
 * @returns {{ kind: 'external'|'self-anchor'|'site-relative'|'relative-file'|'empty'|'unknown', filePart: string, anchor: string|null }}
 */
export function classifyHref(raw) {
  const href = (raw || '').trim();
  if (!href) return { kind: 'empty', filePart: '', anchor: null };
  if (/^(https?:|mailto:|tel:|ftp:|data:|javascript:)/i.test(href) || href.startsWith('//')) {
    return { kind: 'external', filePart: href, anchor: null };
  }
  if (href.startsWith('#')) {
    const anchor = href.slice(1);
    if (!anchor) return { kind: 'empty', filePart: '', anchor: null };
    return { kind: 'self-anchor', filePart: '', anchor };
  }
  const hashIdx = href.indexOf('#');
  const filePart = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
  const anchor = hashIdx >= 0 ? href.slice(hashIdx + 1) : null;
  if (filePart.startsWith('/')) {
    return { kind: 'site-relative', filePart, anchor: anchor || null };
  }
  return { kind: 'relative-file', filePart, anchor: anchor || null };
}

// ─── slugify (GitHub-style heading slug) ───────────────────────────────────

/**
 * GitHub-style heading slug:
 *   lowercase, strip punctuation except `_` and `-`, runs of whitespace → `-`.
 * Preserves `_` and consecutive `-` (matches GitHub markdown anchor behavior
 * used by VitePress in default mode).
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[`*~]/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

// ─── extractHeadings ──────────────────────────────────────────────────────

/**
 * Parse markdown heading slugs (ATX #..######).
 * @param {string} content
 * @returns {string[]}
 */
export function extractHeadings(content) {
  const slugs = [];
  const lines = content.split('\n');
  let inFence = false;
  let fence = '';
  for (const line of lines) {
    // Skip code fences
    const fenceMatch = line.match(/^(\s*)(```|~~~)/);
    if (fenceMatch) {
      if (!inFence) { inFence = true; fence = fenceMatch[2]; }
      else if (line.includes(fence)) { inFence = false; fence = ''; }
      continue;
    }
    if (inFence) continue;

    const m = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (m) {
      // Strip [link text](url) → leave just visible text for slugging
      const text = m[1]
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/<[^>]+>/g, '');
      slugs.push(slugify(text));
    }
  }
  return slugs;
}

// ─── extractLinks ─────────────────────────────────────────────────────────

const LINK_PATTERN = /(?<!!)\[([^\]]*)\]\(([^)]+)\)/g;

/**
 * Extract markdown links from content.
 * @param {string} content
 * @returns {{ text: string, href: string, line: number, col: number }[]}
 */
export function extractLinks(content) {
  const links = [];
  const lines = content.split('\n');
  let inFence = false;
  let fence = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(/^(\s*)(```|~~~)/);
    if (fenceMatch) {
      if (!inFence) { inFence = true; fence = fenceMatch[2]; }
      else if (line.includes(fence)) { inFence = false; fence = ''; }
      continue;
    }
    if (inFence) continue;

    LINK_PATTERN.lastIndex = 0;
    let match;
    while ((match = LINK_PATTERN.exec(line)) !== null) {
      const text = match[1];
      // Strip title attribute: [t](url "title") or [t](url 'title')
      const rawHref = match[2].trim();
      const href = rawHref.split(/\s+["']/)[0].split(/\s+/)[0];
      links.push({ text, href, line: i + 1, col: match.index + 1 });
    }
  }
  return links;
}

// ─── resolveTarget ────────────────────────────────────────────────────────

/**
 * Resolve a classified href against the source file and repo root.
 * Returns existence + anchor validity.
 *
 * @param {{ kind: string, filePart: string, anchor: string|null }} classified
 * @param {string} sourceFile - absolute path to source markdown
 * @param {string} root - absolute repo root
 * @param {{ docsRoot?: string }} [opts]
 * @returns {{ exists: boolean|null, anchorOk: boolean|null, reason: string, resolvedPath: string|null }}
 */
export function resolveTarget(classified, sourceFile, root, opts = {}) {
  const { kind, filePart, anchor } = classified;
  const docsRoot = opts.docsRoot ?? join(root, 'docs');

  if (kind === 'external' || kind === 'empty' || kind === 'unknown') {
    return { exists: null, anchorOk: null, reason: 'skipped', resolvedPath: null };
  }

  if (kind === 'self-anchor') {
    let headings = [];
    try {
      headings = extractHeadings(readFileSync(sourceFile, 'utf-8'));
    } catch {
      return { exists: false, anchorOk: false, reason: 'source unreadable', resolvedPath: null };
    }
    const ok = headings.includes(anchor.toLowerCase());
    return { exists: true, anchorOk: ok, reason: ok ? 'ok' : `anchor #${anchor} not found in source`, resolvedPath: sourceFile };
  }

  // Build candidate resolved paths
  const candidates = [];
  if (kind === 'relative-file') {
    const base = dirname(sourceFile);
    const direct = resolve(base, filePart);
    candidates.push(direct);
    // VitePress cleanUrls: foo → foo.md
    if (!/\.[a-z0-9]+$/i.test(filePart)) {
      candidates.push(direct + '.md');
      candidates.push(join(direct, 'index.md'));
      candidates.push(join(direct, 'README.md'));
    }
  } else if (kind === 'site-relative') {
    // /foo/bar → <docsRoot>/foo/bar(.md|/index.md|/README.md) or <root>/foo/bar
    const trim = filePart.replace(/^\/+/, '');
    const docsCandidate = join(docsRoot, trim);
    const rootCandidate = join(root, trim);
    for (const base of [docsCandidate, rootCandidate]) {
      candidates.push(base);
      if (!/\.[a-z0-9]+$/i.test(trim)) {
        candidates.push(base + '.md');
        candidates.push(join(base, 'index.md'));
        candidates.push(join(base, 'README.md'));
      }
    }
  }

  let resolvedPath = null;
  for (const c of candidates) {
    if (!existsSync(c)) continue;
    try {
      const st = statSync(c);
      if (st.isFile()) {
        resolvedPath = c;
        break;
      }
      if (st.isDirectory()) {
        const idx = join(c, 'index.md');
        const rd = join(c, 'README.md');
        if (existsSync(idx)) { resolvedPath = idx; break; }
        if (existsSync(rd)) { resolvedPath = rd; break; }
      }
    } catch { /* permission, ignore */ }
  }

  if (!resolvedPath) {
    return {
      exists: false,
      anchorOk: null,
      reason: `target not found: ${filePart}`,
      resolvedPath: null,
    };
  }

  if (!anchor) {
    return { exists: true, anchorOk: null, reason: 'ok', resolvedPath };
  }

  // Validate anchor
  let headings = [];
  try {
    headings = extractHeadings(readFileSync(resolvedPath, 'utf-8'));
  } catch {
    return { exists: true, anchorOk: false, reason: 'target unreadable for anchor check', resolvedPath };
  }
  const ok = headings.includes(anchor.toLowerCase());
  return {
    exists: true,
    anchorOk: ok,
    reason: ok ? 'ok' : `anchor #${anchor} not found in ${relative(root, resolvedPath)}`,
    resolvedPath,
  };
}

// ─── ignore patterns (gitignore-like, glob) ───────────────────────────────

// Sprint 172 C3-fix: built-in safe defaults. Mirrors the historical / internal
// surface the user is never expected to link-clean (snapshots, build artifacts,
// internal workspace, deprecated doc trees scheduled for B3/B4 reorg).
//
// GA-public surface (root README/CLAUDE/DECKENT/DIRECTIVES, docs/guide,
// docs/reference, docs/adr, docs/release, docs/vision, docs/launch root,
// .contracts/**) is intentionally NOT ignored — those must stay link-clean.
//
// Project-level `.lintlinkignore` (when present) layers on top of these
// defaults via `loadIgnoreFile`; defaults exist so the gate is sound even
// without that file (e.g. on fresh OSS installs / CI sandboxes).
const DEFAULT_IGNORES = [
  // Build artifacts & transient state
  'node_modules/**',
  'dist/**',
  '.git/**',
  '.tasks/**',
  '.locks/**',
  '.dashboard',
  'coverage/**',

  // Sprint / audit history (snapshot, never edited for link-correctness)
  '.audit/**',
  '.brain/archive/**',
  '.brain/exports/**',
  '.brain/sprints/**',
  '.brain/MEMORY.md',
  '.brain/RETRO.md',
  '.brain/PATTERNS.md',
  '.brain/PROJECT-IDENTITY.md',
  '.brain/ERRORS.md',

  // Deckent internal workspace (not user-facing OSS surface)
  '.deckent/**',

  // VitePress build output
  'docs/.vitepress/cache/**',
  'docs/.vitepress/dist/**',

  // Deprecated doc trees (scheduled for B3/B4 reorg in Sprint 172 plan)
  'docs/audits/**',
  'docs/archive/**',
  'docs/analysis/**',
  'docs/architecture/**',
  'docs/development/**',
  'docs/superpowers/**',
  'docs/design/**',
  'docs/agents/**',
  'docs/governance/**',
  'docs/directives/**',
  'docs/security/**',
  'docs/sprint-log/**',
  'docs/SPRINT-LOG.md',
  'docs/KNOWN_ISSUES.md',
  'docs/ROADMAP-GOD-LEVEL.md',
  'docs/smoke-*.md',

  // Source / examples — not docs
  'src/**',
  'tests/**',
  'examples/**',
];

/**
 * Convert a glob pattern to a regex (basic gitignore semantics: **, *, ?).
 * @param {string} glob
 * @returns {RegExp}
 */
function globToRegex(glob) {
  let p = glob.trim();
  if (!p || p.startsWith('#')) return null;
  // Anchor: leading `/` means relative to root; otherwise match anywhere
  const anchored = p.startsWith('/');
  if (anchored) p = p.slice(1);
  // Trailing `/` → directory only; treat as prefix
  const dirOnly = p.endsWith('/');
  if (dirOnly) p = p.slice(0, -1);

  let rx = '';
  let i = 0;
  while (i < p.length) {
    const c = p[i];
    if (c === '*' && p[i + 1] === '*') {
      rx += '.*';
      i += 2;
      if (p[i] === '/') i++;
    } else if (c === '*') {
      rx += '[^/]*';
      i++;
    } else if (c === '?') {
      rx += '[^/]';
      i++;
    } else if ('.+^$()|{}[]\\'.includes(c)) {
      rx += '\\' + c;
      i++;
    } else {
      rx += c;
      i++;
    }
  }
  const prefix = anchored ? '^' : '(^|/)';
  const suffix = dirOnly ? '(/|$)' : '($|/)';
  return new RegExp(prefix + rx + suffix);
}

function loadIgnoreFile(root) {
  const file = join(root, '.lintlinkignore');
  if (!existsSync(file)) return [];
  try {
    return readFileSync(file, 'utf-8')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));
  } catch { return []; }
}

function matchAnyIgnore(relPath, patterns) {
  for (const p of patterns) {
    const rx = globToRegex(p);
    if (rx && rx.test(relPath)) return true;
  }
  return false;
}

// ─── file walking ─────────────────────────────────────────────────────────

function listMarkdownFiles(root, ignorePatterns) {
  const out = [];
  function walk(dir) {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(dir, e.name);
      const rel = relative(root, full).replace(/\\/g, '/');
      if (matchAnyIgnore(rel, ignorePatterns)) continue;
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith('.md')) out.push(full);
    }
  }
  walk(root);
  return out;
}

// ─── scanFile / scanRoot ──────────────────────────────────────────────────

/**
 * Scan a single file, return broken-link entries.
 * @param {string} filePath
 * @param {string} root
 * @param {{ docsRoot?: string }} opts
 * @returns {{ sourceFile: string, line: number, col: number, href: string, text: string, reason: string }[]}
 */
export function scanFile(filePath, root, opts = {}) {
  let content;
  try { content = readFileSync(filePath, 'utf-8'); }
  catch { return []; }
  const links = extractLinks(content);
  const broken = [];
  for (const link of links) {
    const classified = classifyHref(link.href);
    if (classified.kind === 'external' || classified.kind === 'empty') continue;
    const r = resolveTarget(classified, filePath, root, opts);
    if (r.exists === false || r.anchorOk === false) {
      broken.push({
        sourceFile: filePath,
        line: link.line,
        col: link.col,
        href: link.href,
        text: link.text,
        reason: r.reason,
      });
    }
  }
  return broken;
}

/**
 * Scan an entire root directory.
 * @param {string} root
 * @param {{ ignorePatterns?: string[], extraIgnorePatterns?: string[], docsRoot?: string, useIgnoreFile?: boolean }} opts
 * @returns {{ scannedFiles: string[], filesScanned: number, broken: any[] }}
 */
export function scanRoot(root, opts = {}) {
  const useIgnoreFile = opts.useIgnoreFile !== false;
  const fileIgnores = useIgnoreFile ? loadIgnoreFile(root) : [];
  const ignorePatterns = [
    ...DEFAULT_IGNORES,
    ...fileIgnores,
    ...(opts.ignorePatterns || []),
    ...(opts.extraIgnorePatterns || []),
  ];
  const files = listMarkdownFiles(root, ignorePatterns);
  const broken = [];
  for (const f of files) {
    const fileBroken = scanFile(f, root, { docsRoot: opts.docsRoot });
    broken.push(...fileBroken);
  }
  return {
    scannedFiles: files,
    filesScanned: files.length,
    broken,
  };
}

// ─── CLI entrypoint ───────────────────────────────────────────────────────

function isMainModule() {
  try {
    const here = fileURLToPath(import.meta.url);
    const entry = process.argv[1] ? resolve(process.argv[1]) : '';
    return here === entry;
  } catch { return false; }
}

if (isMainModule()) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const noIgnore = args.includes('--no-ignore');
  const rootIdx = args.indexOf('--root');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const root = rootIdx >= 0 ? resolve(args[rootIdx + 1]) : resolve(__dirname, '..');

  const out = scanRoot(root, { useIgnoreFile: !noIgnore });

  if (json) {
    process.stdout.write(JSON.stringify({
      filesScanned: out.filesScanned,
      brokenCount: out.broken.length,
      broken: out.broken.map(b => ({
        ...b,
        sourceFile: relative(root, b.sourceFile).replace(/\\/g, '/'),
      })),
    }, null, 2) + '\n');
  } else {
    console.log('lint-links: scanning', out.filesScanned, 'files in', root);
    if (out.broken.length === 0) {
      console.log('✓ no broken links');
    } else {
      console.log(`✗ ${out.broken.length} broken link(s):`);
      for (const b of out.broken) {
        const rel = relative(root, b.sourceFile).replace(/\\/g, '/');
        console.log(`  ${rel}:${b.line}:${b.col}  →  ${b.href}   (${b.reason})`);
      }
    }
  }

  process.exit(out.broken.length === 0 ? 0 : 1);
}

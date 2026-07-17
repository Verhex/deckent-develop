// ═══ at-ref — `@path` file references for the native REPL (TERM-AT-REF 583/N2b) ═
//
// Typing `@` in the InputBar opens a fuzzy PATH menu (project files/dirs);
// selecting completes an `@rel/path` token; on submit each `@path` token's file
// content is injected into the OUTBOUND prompt (the transcript keeps the raw
// typed line). This module is the PURE core: token extraction, prompt
// expansion, fuzzy filtering, cursor-token detection, completion splicing and
// the cached candidate lister — every fs/walker dependency is injected, so the
// whole surface is hermetically testable (tests/cli/at-ref.test.ts) and the
// component (input-bar.tsx) never imports a cli/commands internal.
//
// i18n note: the `[@ref]` lines expandAtRefs appends are PROTOCOL strings fed
// to the MODEL as part of the prompt — English-canonical by the same rule as
// chat-tool-exec.ts's `[mcp-error]`/`[deckent]` tool_result markers, NOT a
// localization surface. The only user-facing string this feature adds is the
// @-menu hint, injected via labels (tui.atref_menu_hint, run.tsx).

import { relative, sep, isAbsolute } from 'node:path';

/** Hard caps — explicit, never silent: extras beyond MAX_REFS and content
 * beyond MAX_CHARS are NOTED in the prompt (expandAtRefs), never dropped. */
export const AT_REF_MAX_REFS = 5;
export const AT_REF_MAX_CHARS = 32 * 1024; // 32KB per referenced file

/**
 * Extract `@path` tokens from a message. A token starts at an `@` on a WORD
 * BOUNDARY (start of text or after whitespace) and runs to the next
 * whitespace/`@`. Emails (`a@b` — non-space before the `@`) and a literal
 * `@@` escape are ignored, as is a bare `@`. Duplicates are de-duplicated in
 * first-seen order (the same file is never injected twice).
 */
export function extractAtRefs(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/(^|\s)@([^\s@]+)/g)) {
    const token = m[2] as string;
    if (!seen.has(token)) { seen.add(token); out.push(token); }
  }
  return out;
}

/** One `@path` token's expansion outcome (honest bookkeeping for the caller). */
export interface AtRefExpansion {
  path: string;
  /** false → the reader refused it (missing, binary, or out of scope). */
  ok: boolean;
  /** true → content was cut at AT_REF_MAX_CHARS (marker noted in the prompt). */
  truncated: boolean;
}

/** A fence strictly longer than any backtick run in `body` (min 3) — file
 * content containing ``` must not break out of its own injected block. */
function pickFence(body: string): string {
  let longest = 0;
  for (const m of body.matchAll(/`+/g)) longest = Math.max(longest, m[0].length);
  return '`'.repeat(Math.max(3, longest + 1));
}

/**
 * Expand `@path` tokens into the outbound prompt: after the user's own text,
 * one fenced block per resolved ref (header line with the path, content capped
 * at AT_REF_MAX_CHARS with an explicit truncation marker). At most
 * AT_REF_MAX_REFS refs are expanded — extras are NOTED, not silently dropped;
 * an unreadable ref is noted honestly instead of vanishing. No tokens → the
 * text passes through byte-identical. Pure: the reader is injected
 * (`null` = unreadable), so tests never touch the real filesystem.
 */
export function expandAtRefs(
  text: string,
  readFile: (rel: string) => string | null,
): { prompt: string; refs: AtRefExpansion[] } {
  const tokens = extractAtRefs(text);
  if (tokens.length === 0) return { prompt: text, refs: [] };
  const expanded = tokens.slice(0, AT_REF_MAX_REFS);
  const skipped = tokens.slice(AT_REF_MAX_REFS);
  const refs: AtRefExpansion[] = [];
  const blocks: string[] = [];
  for (const path of expanded) {
    const content = readFile(path);
    if (content === null) {
      refs.push({ path, ok: false, truncated: false });
      blocks.push(`[@ref] ${path} — unreadable (missing, binary, or outside the project)`);
      continue;
    }
    const truncated = content.length > AT_REF_MAX_CHARS;
    const body = truncated ? content.slice(0, AT_REF_MAX_CHARS) : content;
    refs.push({ path, ok: true, truncated });
    const fence = pickFence(body);
    const header = `[@ref] ${path}${truncated ? ` (truncated at ${AT_REF_MAX_CHARS} chars)` : ''}:`;
    blocks.push(`${header}\n${fence}\n${body}\n${fence}`);
  }
  if (skipped.length > 0) {
    blocks.push(`[@ref] ${skipped.length} additional reference(s) not expanded (max ${AT_REF_MAX_REFS} per message): ${skipped.join(', ')}`);
  }
  return { prompt: `${text}\n\n${blocks.join('\n\n')}`, refs };
}

/** Basename of a candidate path (trailing `/` of a dir entry stripped first). */
function basenameOf(path: string): string {
  const clean = path.endsWith('/') ? path.slice(0, -1) : path;
  const cut = clean.lastIndexOf('/');
  return cut < 0 ? clean : clean.slice(cut + 1);
}

/**
 * Fuzzy-order path candidates for the `@` menu. Case-insensitive tiers:
 * basename-prefix (best) → basename-substring → path-prefix → path-substring;
 * ties: non-hidden root first, then shorter path, then plain lexicographic
 * (deterministic — deliberately not localeCompare). Empty query → the first
 * `limit` candidates as provided. Pure — pinned by tests/cli/at-ref.test.ts.
 */
export function filterAtPaths(candidates: readonly string[], query: string, limit = 8): string[] {
  const q = query.toLowerCase();
  if (q.length === 0) return candidates.slice(0, limit);
  // Alperen canlı-bulgusu (2026-07-17, `@cost`): the loose subsequence tier
  // matched 'c…o…s…t' across long archive paths and drowned the list in
  // noise — DROPPED. Substring tiers only, basename-weighted; hidden/meta
  // roots (.analysis/.brain/…) lose ties to real source paths.
  const scored: Array<{ path: string; score: number; dot: number }> = [];
  for (const candidate of candidates) {
    const lc = candidate.toLowerCase();
    const base = basenameOf(lc);
    let score: number;
    if (base.startsWith(q)) score = 0;
    else if (base.includes(q)) score = 1;
    else if (lc.startsWith(q)) score = 2;
    else if (lc.includes(q)) score = 3;
    else continue;
    scored.push({ path: candidate, score, dot: lc.startsWith('.') ? 1 : 0 });
  }
  scored.sort((a, b) =>
    a.score - b.score
    || a.dot - b.dot
    || a.path.length - b.path.length
    || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return scored.slice(0, limit).map((s) => s.path);
}

/** The `@` token the cursor is currently inside: its `@`'s index + the query
 * typed so far (chars between the `@` and the cursor). */
export interface ActiveAtToken { start: number; query: string }

/**
 * Detect the `@` token at the cursor (the menu-open condition — mirrors
 * slashMenuMatches's role for `/`). Scans left from the cursor within the
 * current word: an `@` on a word boundary (start / after whitespace) opens;
 * an email-style `@` (non-space before it) or an `@@` escape never does.
 */
export function activeAtQuery(buffer: string, cursor: number): ActiveAtToken | null {
  for (let i = cursor - 1; i >= 0; i--) {
    const ch = buffer[i] as string;
    if (ch === '@') {
      const before = i > 0 ? (buffer[i - 1] as string) : '';
      if (before !== '' && !/\s/.test(before)) return null; // email / mid-word '@'
      if (buffer[i + 1] === '@') return null;               // literal '@@' escape
      return { start: i, query: buffer.slice(i + 1, cursor) };
    }
    if (/\s/.test(ch)) return null; // left the current word without an '@'
  }
  return null;
}

/** Splice a selected path over the active `@` token: `@` + path + one trailing
 * space, cursor placed after the space; text right of the cursor is kept. */
export function completeAtToken(
  buffer: string,
  cursor: number,
  start: number,
  path: string,
): { buffer: string; cursor: number } {
  const next = `${buffer.slice(0, start)}@${path} ${buffer.slice(cursor)}`;
  return { buffer: next, cursor: start + path.length + 2 };
}

/**
 * Pure textual scope check for an `@path` token: repo-relative only — refuses
 * absolute paths (POSIX and Windows drive/UNC forms, Law #2: every
 * environment), and any `..` traversal that climbs above the project root.
 * The WIRING layer (run.tsx's createScopedAtRefReader) layers the symlink-
 * aware real-path check (resolveRealPathLenient, chat-tool-exec.ts) on top;
 * this function is the injectable, hermetically-tested first gate.
 */
export function isScopedRelPath(path: string): boolean {
  if (path.length === 0) return false;
  if (isAbsolute(path) || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\') || path.startsWith('/')) return false;
  let depth = 0;
  for (const seg of path.split(/[\\/]+/)) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      depth -= 1;
      if (depth < 0) return false; // climbed above the project root
    } else {
      depth += 1;
    }
  }
  return depth > 0;
}

export interface PathListerOptions {
  /** Max candidate entries kept (files + derived dirs). Default 2000. */
  cap?: number;
  /** Cache lifetime per project root. Default 15s (per-REPL-boot freshness). */
  ttlMs?: number;
  /** Clock seam (tests). Default Date.now. */
  now?: () => number;
}

/**
 * Cached project-path candidate lister for the `@` menu. The WALKER is
 * injected (run.tsx passes chat-tool-exec.ts's walkProjectFiles — pure-Node,
 * node_modules/.git skipped, depth-capped) so this stays hermetically
 * testable. One walk fills the cache; repeat calls within `ttlMs` (and the
 * same root — /cd invalidates by root change) reuse it. Candidates are the
 * `/`-joined relative file paths plus every ancestor directory (with a
 * trailing `/`), sorted, capped at `cap` entries.
 */
export function createCachedPathLister(
  walk: (rootAbs: string, visit: (fileAbs: string) => boolean) => unknown,
  resolveRoot: () => string,
  opts: PathListerOptions = {},
): (prefix: string) => string[] {
  // Alperen canlı-bulgusu: deckent-dev 30k+ dosya — 2000-cap DFS-sırasıyla
  // (.analysis/.brain önce) doluyordu ve gerçek kaynak dosyaları listeye
  // hiç giremiyordu. 40k = mevcut repo + pay; bellek ~birkaç MB string.
  const cap = opts.cap ?? 40_000;
  const ttlMs = opts.ttlMs ?? 15_000;
  const now = opts.now ?? Date.now;
  let cache: { at: number; root: string; entries: string[] } | null = null;
  return () => {
    const root = resolveRoot();
    const at = now();
    if (cache && cache.root === root && at - cache.at < ttlMs) return cache.entries;
    const files: string[] = [];
    const dirs = new Set<string>();
    walk(root, (fileAbs) => {
      const rel = relative(root, fileAbs).split(sep).join('/');
      if (rel.length === 0) return true;
      files.push(rel);
      let dir = rel;
      for (;;) {
        const cut = dir.lastIndexOf('/');
        if (cut < 0) break;
        dir = dir.slice(0, cut);
        dirs.add(`${dir}/`);
      }
      return files.length < cap; // visitor-false stops the whole walk (cap)
    });
    const entries = [...files, ...dirs]
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      .slice(0, cap);
    cache = { at, root, entries };
    return entries;
  };
}

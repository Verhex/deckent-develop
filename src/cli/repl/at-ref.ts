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

import type { ReferenceAttachment } from '../../agent/reference-digest-types.js';
import { createHash } from 'node:crypto';
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
  /** How this reference was represented in the outbound prompt. */
  mode: 'inline' | 'descriptor';
  /** Full readable payload identity; empty/zero for unreadable references. */
  digest: string;
  bytes: number;
  lines: number;
}

export interface AtRefExpansionOptions {
  /** Maximum cumulative full-content chars admitted to inline mode. */
  expansionBudgetChars?: number;
}

function lineCount(content: string): number {
  if (content.length === 0) return 0;
  return content.split('\n').length;
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
  options: AtRefExpansionOptions = {},
): { prompt: string; refs: AtRefExpansion[] } {
  const tokens = extractAtRefs(text);
  if (tokens.length === 0) return { prompt: text, refs: [] };
  const expanded = tokens.slice(0, AT_REF_MAX_REFS);
  const skipped = tokens.slice(AT_REF_MAX_REFS);
  const refs: AtRefExpansion[] = [];
  const blocks: string[] = [];
  const budget = options.expansionBudgetChars;
  let admittedChars = 0;
  for (const path of expanded) {
    const content = readFile(path);
    if (content === null) {
      refs.push({ path, ok: false, truncated: false, mode: 'inline', digest: '', bytes: 0, lines: 0 });
      blocks.push(`[@ref] ${path} — unreadable (missing, binary, or outside the project)`);
      continue;
    }
    const bytes = Buffer.byteLength(content, 'utf8');
    const lines = lineCount(content);
    const digest = createHash('sha256').update(content).digest('hex');
    const fitsBudget = budget === undefined || admittedChars + content.length <= Math.max(0, budget);
    if (!fitsBudget) {
      refs.push({ path, ok: true, truncated: false, mode: 'descriptor', digest, bytes, lines });
      blocks.push(`[@ref-descriptor] ${path} — ${bytes} bytes, ${lines} lines, sha256:${digest.slice(0, 12)} — read it in slices with deckent_read_file (offset/limit)`);
      continue;
    }
    admittedChars += content.length;
    const truncated = content.length > AT_REF_MAX_CHARS;
    const body = truncated ? content.slice(0, AT_REF_MAX_CHARS) : content;
    refs.push({ path, ok: true, truncated, mode: 'inline', digest, bytes, lines });
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
function deprioritizeAtWalkPath(rel: string): number {
  if (rel.startsWith('.deckent/') || rel.startsWith('.brain/') || rel.includes('/archive/')) return 1;
  return 0;
}

/**
 * Resolve a typed `@token` to a repo-relative candidate when the menu was skipped
 * (Enter submit). Basename-aware; well-known aliases (e.g. master-plan → docs/MASTER-PLAN.md).
 */
export function resolveAtRefCandidate(token: string, candidates: readonly string[]): string {
  if (candidates.includes(token)) return token;
  const lcToken = token.toLowerCase();
  const exactPath = candidates.find((c) => c.toLowerCase() === lcToken);
  if (exactPath) return exactPath;
  const base = basenameOf(token);
  const q = base.replace(/\.md$/i, '');
  const matches = filterAtPaths(candidates, q, 32);
  const basenameMatches = matches.filter((m) => basenameOf(m).toLowerCase() === base.toLowerCase());
  if (basenameMatches.length === 1) return basenameMatches[0] as string;
  if (matches.length === 1) return matches[0] as string;
  if (base.toLowerCase() === 'master-plan.md' || lcToken === 'master-plan') {
    const canonical = candidates.find((c) => c === 'docs/MASTER-PLAN.md');
    if (canonical) return canonical;
  }
  return token;
}

/** Score for one candidate against the live `@` query (lower = better). null = no match. */
export function scoreAtPathMatch(candidate: string, rawQuery: string): number | null {
  const q = rawQuery.trim().toLowerCase();
  if (q.length === 0) return null;
  const lc = candidate.toLowerCase();
  const base = basenameOf(lc);
  const deprioritize = deprioritizeAtWalkPath(candidate);

  if (q.includes('/')) {
    const pathQ = q.endsWith('/') ? q : q;
    if (lc.startsWith(pathQ)) return 0 + deprioritize;
    const qSegs = q.split('/').filter((s) => s.length > 0);
    const cSegs = lc.replace(/\/$/, '').split('/');
    let allPrefix = true;
    for (let i = 0; i < qSegs.length; i++) {
      const seg = cSegs[i];
      if (seg === undefined || !seg.startsWith(qSegs[i] as string)) {
        allPrefix = false;
        break;
      }
    }
    if (allPrefix) return 1 + qSegs.length + deprioritize;
    if (lc.includes(q)) return 4 + deprioritize;
    return null;
  }

  if (base.startsWith(q)) return 0 + deprioritize;
  if (base.includes(q)) return 1 + deprioritize;
  const segs = lc.split('/');
  if (segs.some((seg) => seg.startsWith(q))) return 2 + deprioritize;
  if (lc.startsWith(q)) return 3 + deprioritize;
  if (lc.includes(q)) return 4 + deprioritize;
  return null;
}

/** Top-level dirs + root files from the index (empty `@` query — not a hardcoded list). */
export function rootAtPathCandidates(candidates: readonly string[], limit = 8): string[] {
  const roots = new Set<string>();
  for (const candidate of candidates) {
    if (deprioritizeAtWalkPath(candidate) === 1) continue;
    const clean = candidate.endsWith('/') ? candidate.slice(0, -1) : candidate;
    const slash = clean.indexOf('/');
    if (slash < 0) roots.add(candidate);
    else roots.add(`${clean.slice(0, slash)}/`);
  }
  return [...roots]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, limit);
}

/**
 * Live `@` menu filter — query-driven only (basename, path segments, path prefix).
 * Empty query → project root entries derived from the index, not a fixed catalog.
 */
export function filterAtPaths(candidates: readonly string[], query: string, limit = 8): string[] {
  const q = query.trim();
  if (q.length === 0) return rootAtPathCandidates(candidates, limit);

  const scored: Array<{ path: string; score: number }> = [];
  for (const candidate of candidates) {
    const score = scoreAtPathMatch(candidate, q);
    if (score === null) continue;
    scored.push({ path: candidate, score });
  }
  scored.sort((a, b) =>
    a.score - b.score
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
  /** Max candidate entries kept (files + derived dirs). Default 40_000. */
  cap?: number;
  /** First `@` menu uses this smaller cap synchronously; full `cap` loads async. */
  bootstrapCap?: number;
  /** Cache lifetime per project root. Default 15s (per-REPL-boot freshness). */
  ttlMs?: number;
  /** Clock seam (tests). Default Date.now. */
  now?: () => number;
  /** Scheduler seam (tests). Default setImmediate. */
  schedule?: (task: () => void) => void;
}

export type AtRefPathProvider = ((prefix: string) => readonly string[]) & {
  /** Pre-warm the full index (non-blocking when bootstrap already cached). */
  warm(): void;
  /** True once the async full index (or a single-shot cap) is ready. */
  ready(): boolean;
};

function buildProjectPathEntries(
  walk: (rootAbs: string, visit: (fileAbs: string) => boolean) => unknown,
  root: string,
  fileCap: number,
): string[] {
  const primary: string[] = [];
  const secondary: string[] = [];
  const dirs = new Set<string>();
  const noteDir = (rel: string): void => {
    let dir = rel;
    for (;;) {
      const cut = dir.lastIndexOf('/');
      if (cut < 0) break;
      dir = dir.slice(0, cut);
      dirs.add(`${dir}/`);
    }
  };
  walk(root, (fileAbs) => {
    const rel = relative(root, fileAbs).split(sep).join('/');
    if (rel.length === 0) return true;
    noteDir(rel);
    if (deprioritizeAtWalkPath(rel) === 0) {
      primary.push(rel);
      if (primary.length >= fileCap) return false;
    } else {
      secondary.push(rel);
    }
    return true;
  });
  const cappedFiles = [...primary, ...secondary].slice(0, fileCap);
  cappedFiles.sort((a, b) => deprioritizeAtWalkPath(a) - deprioritizeAtWalkPath(b) || (a < b ? -1 : a > b ? 1 : 0));
  const dirList = [...dirs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return [...cappedFiles, ...dirList]
    .sort((a, b) => deprioritizeAtWalkPath(a) - deprioritizeAtWalkPath(b) || (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, fileCap);
}

/**
 * Cached project-path candidate lister for the `@` menu. The WALKER is
 * injected (run.tsx passes chat-tool-exec.ts's walkProjectFiles — pure-Node,
 * node_modules/.git skipped, depth-capped) so this stays hermetically
 * testable. Bootstrap index returns quickly on first `@`; the full cap loads
 * asynchronously so the REPL never freezes on a 30k+ tree walk.
 */
export function createCachedPathLister(
  walk: (rootAbs: string, visit: (fileAbs: string) => boolean) => unknown,
  resolveRoot: () => string,
  opts: PathListerOptions = {},
): AtRefPathProvider {
  const fullCap = opts.cap ?? 40_000;
  const bootstrapCap = Math.min(opts.bootstrapCap ?? 5_000, fullCap);
  const ttlMs = opts.ttlMs ?? 15_000;
  const now = opts.now ?? Date.now;
  const schedule = opts.schedule ?? ((task: () => void) => setImmediate(task));
  let cache: { at: number; root: string; entries: string[]; complete: boolean } | null = null;
  let warming = false;

  const runFullIndex = (): void => {
    if (warming || fullCap <= bootstrapCap) return;
    const root = resolveRoot();
    warming = true;
    schedule(() => {
      try {
        const entries = buildProjectPathEntries(walk, root, fullCap);
        cache = { at: now(), root, entries, complete: true };
      } finally {
        warming = false;
      }
    });
  };

  const loadEntries = (): readonly string[] => {
    const root = resolveRoot();
    const at = now();
    if (cache && cache.root === root && at - cache.at < ttlMs) return cache.entries;
    const entries = buildProjectPathEntries(walk, root, bootstrapCap);
    cache = { at, root, entries, complete: fullCap <= bootstrapCap };
    if (!cache.complete) runFullIndex();
    return cache.entries;
  };

  const provider = ((queryPrefix: string) => {
    const entries = loadEntries();
    const q = queryPrefix.trim().toLowerCase();
    if (q.length === 0) return entries;
    const narrowed: string[] = [];
    for (const candidate of entries) {
      if (scoreAtPathMatch(candidate, q) !== null) narrowed.push(candidate);
    }
    return narrowed.length > 0 ? narrowed : entries;
  }) as AtRefPathProvider;

  provider.warm = () => {
    const root = resolveRoot();
    const at = now();
    if (cache && cache.root === root && cache.complete && at - cache.at < ttlMs) return;
    if (cache && cache.root === root && at - cache.at < ttlMs && !cache.complete) {
      runFullIndex();
      return;
    }
    const entries = buildProjectPathEntries(walk, root, bootstrapCap);
    cache = { at, root, entries, complete: fullCap <= bootstrapCap };
    if (!cache.complete) runFullIndex();
  };

  provider.ready = () => cache?.complete === true;

  return provider;
}

/** 7113 typed seam. Legacy prompt bytes stay identical; no parsing of model-written markers. */
export function expandAtRefsWithAttachments(
  text: string, readFile: (rel: string) => string | null, options: AtRefExpansionOptions = {},
): { prompt: string; refs: AtRefExpansion[]; referenceAttachments: ReferenceAttachment[] } {
  const expanded = expandAtRefs(text, readFile, options);
  return { ...expanded, referenceAttachments: expanded.refs.filter(ref => ref.ok).map(ref => ({
    path: ref.path, sourceDigest: ref.digest, bytes: ref.bytes,
    disposition: ref.mode === 'descriptor' || ref.truncated ? 'digest-required' : 'inline',
  })) };
}

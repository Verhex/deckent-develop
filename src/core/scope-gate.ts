/**
 * Scope Gate — Pre-spawn scope-path validation (Dimension B).
 *
 * Mirrors the pre-spawn cost gate ({@link ./cost-gate}): a PURE evaluator that
 * classifies every task's declared `scope.filesWrite`/`filesRead` against the
 * repo's real tracked-file set BEFORE any worker is spawned, and blocks (by
 * default) when a WRITE path is a likely typo or wrong directory — the sprint-380
 * / born-573/518 failure mode where a worker "dutifully created" an orphan file
 * at a path that never existed (`src/orchestra/worker.ts` instead of the real
 * `src/agents/worker.ts`). Nothing downstream distinguished a hallucinated path
 * from a legitimate "create this new file": the `--allowedTools Write(...)` grant
 * happily permits creating a file at a nonexistent path.
 *
 * The evaluator never prompts and does no I/O — the caller supplies `trackedFiles`
 * (from `git ls-files`) and surfaces the result (CLI abort / MCP structured error),
 * exactly like the cost gate. Override with `acknowledgeScopePaths` (MCP) /
 * `--force-scope` (CLI).
 */

export interface ScopeGateTask {
  id: string;
  scope: { filesWrite?: string[]; filesRead?: string[]; directories?: string[] };
}

export type ScopePathClass = 'confirmed' | 'new-plausible' | 'suspect';

export interface ScopePathVerdict {
  taskId: string;
  path: string;
  role: 'write' | 'read';
  classification: ScopePathClass;
  /** For 'suspect' (wrong-dir): the nearest existing path with the same basename. */
  suggestion?: string;
  /** Short human-readable reason for the classification. */
  reason: string;
}

export interface ScopeGateInput {
  tasks: ScopeGateTask[];
  /** The repo's tracked files (git ls-files output, one repo-relative path per entry). */
  trackedFiles: string[];
  /**
   * If true, SUSPECT write paths do NOT block — the caller explicitly acknowledged
   * (CLI `--force-scope`, MCP `acknowledgeScopePaths: true`).
   */
  acknowledgeScopePaths?: boolean;
  /**
   * sprint-399/003 — if true, a write-suspect the gate can already prove safe (see
   * {@link ScopeResolution}) is resolved instead of blocking: only the remaining,
   * genuinely-unresolved suspects still block. Default **false** — with the flag
   * unset/false the block/suspects computation is bit-identical to the pre-399/003
   * gate (a resolvable suspect still blocks); `resolutions` is still returned as
   * advisory data either way. Flipping this on for real sprints is a Brain-wiring
   * decision, not something this evaluator decides for itself.
   */
  resolveSuggestions?: boolean;
}

/**
 * sprint-399/003 — a write-suspect the gate can resolve on its own evidence, without
 * a human override:
 * - `drop-duplicate` (born-N6 / 397-011): the suggested path is ALREADY planned as a
 *   write in the SAME task — the suspect is a redundant typo-duplicate of a write the
 *   task is already doing correctly.
 * - `auto-replace` (born-N6 / 397-007): the suggested path is the ONLY tracked file
 *   with that basename — an unambiguous wrong-directory rename.
 * A suspect with no suggestion, or with 2+ same-basename candidates, gets no resolution.
 */
export interface ScopeResolution {
  /**
   * The task whose verdict produced this resolution. Resolutions are derived from
   * TASK-LOCAL evidence (rule a: duplicate in the SAME task's filesWrite) — applying
   * one to another task that shares the typo path is wrong (advisor-confirmed
   * cross-task misapplication, sprint-399 BEFORE-done): a path ambiguous for task B
   * must keep blocking B even when task A's context resolved it.
   */
  taskId: string;
  path: string;
  action: 'drop-duplicate' | 'auto-replace';
  replacement?: string;
  reason: string;
}

export interface ScopeGatePass {
  ok: true;
  verdicts: ScopePathVerdict[];
  /**
   * Non-blocking advisories: new-plausible files + suspect READ paths + (when
   * `resolveSuggestions` is true) write-suspects that were resolved instead of blocked.
   */
  advisories: ScopePathVerdict[];
  /** Set when write-suspects existed but `acknowledgeScopePaths` bypassed the block. */
  overrideApplied?: boolean;
  /** sprint-399/003 — write-suspects the gate resolved (see {@link ScopeResolution}). */
  resolutions?: ScopeResolution[];
  /**
   * born-584 — set when the repo has NO tracked directories (fresh `deckent init`
   * greenfield, or a root-only repo like README+LICENSE): the invented-dir rule
   * is unsatisfiable for every nested path, so the gate ran advisory-only.
   */
  greenfield?: boolean;
  /** Human-readable one-line advisory for the caller to surface (CLI warn + event). */
  greenfieldNotice?: string;
}

export interface ScopeGateBlocked {
  ok: false;
  reason: 'SCOPE_GATE_SUSPECT';
  /** The WRITE-path suspects that triggered the block (post-resolution, see `resolveSuggestions`). */
  suspects: ScopePathVerdict[];
  verdicts: ScopePathVerdict[];
  /** Human-readable explanation suitable for an error message. */
  message: string;
  /** sprint-399/003 — write-suspects the gate resolved (see {@link ScopeResolution}). */
  resolutions?: ScopeResolution[];
}

export type ScopeGateResult = ScopeGatePass | ScopeGateBlocked;

/** A resolution as actually applied — `appliedAction` is what really happened. */
export type AppliedScopeResolution = ScopeResolution & { appliedAction: 'dropped' | 'replaced' };

/**
 * sprint-399 wiring — apply ONE task's OWN gate resolutions to its filesWrite (pure;
 * returns a new array). STRICTLY task-scoped: only resolutions carrying this task's
 * `taskId` are considered (a resolution is task-local evidence — see ScopeResolution).
 * Per-entry: if the `replacement` is already planned, the typo entry is dropped;
 * otherwise it is substituted. `appliedAction` reports the ACTUAL effect (an
 * auto-replace whose target already exists degrades to a drop — telemetry must not lie).
 */
export function applyScopeResolutions(
  taskId: string,
  filesWrite: readonly string[],
  resolutions: readonly ScopeResolution[],
): { filesWrite: string[]; applied: AppliedScopeResolution[] } {
  const norm = (p: string) => p.replace(/^\.\//, '').toLowerCase();
  let files = [...filesWrite];
  const applied: AppliedScopeResolution[] = [];
  for (const r of resolutions) {
    if (r.taskId !== taskId || !r.replacement) continue;
    const pathNorm = norm(r.path);
    const idx = files.findIndex(f => norm(f) === pathNorm);
    if (idx === -1) continue;
    const hasReplacement = files.some(f => norm(f) === norm(r.replacement!));
    if (hasReplacement) {
      files = files.filter((_, i) => i !== idx);
      applied.push({ ...r, appliedAction: 'dropped' });
    } else {
      files[idx] = r.replacement;
      applied.push({ ...r, appliedAction: 'replaced' });
    }
  }
  return { filesWrite: files, applied };
}

/**
 * Ubiquitous basenames that legitimately recur across many directories. A new
 * file with one of these names sharing a basename with an existing file elsewhere
 * is NOT evidence of a wrong directory (it is normal), so it is exempt from the
 * wrong-dir suspect rule to keep false positives near zero.
 */
const COMMON_BASENAMES = new Set([
  'index.ts', 'index.js', 'index.tsx', 'index.jsx',
  'types.ts', 'utils.ts', 'mod.ts', 'main.ts',
  'readme.md', '__init__.py', 'mod.rs', 'lib.rs',
]);

/**
 * Test/spec basenames legitimately recur ACROSS suites (`tests/cli/commands/history.test.ts`
 * and a new `tests/mcp/tools/history.test.ts` are parallel naming, not a wrong
 * directory) — live RUN-RENAME dilim-2 false-positive (flow-a7e3c2d2, 449-006):
 * the wrong-dir rule killed the run twice for a legitimate new mirror-named test.
 * Guards keeping the 397-007 auto-replace repair alive (that historical typo was
 * ALSO a .test.ts): the exemption needs BOTH (a) a tracked parent directory and
 * (b) TASK-LOCAL evidence — the same task also writes/reads a SOURCE module whose
 * stem matches the test name (writing src/mcp/tools/history.ts makes a new
 * history.test.ts the module's own test; a test name matching nothing the task
 * owns is exactly the wrong-dir-reference shape). Source-module basenames
 * (worker.ts) keep the full 573/518 protection: this predicate matches test
 * files only.
 */
const RECURRING_TEST_BASENAME_RE = /\.(test|spec)\.[cm]?[jt]sx?$/i;
function isRecurringTestBasename(b: string): boolean {
  return RECURRING_TEST_BASENAME_RE.test(b);
}

/** Does the task's own scope contain a non-test source file whose stem matches this test basename? */
function taskOwnsMatchingSource(testBasename: string, taskPaths: readonly string[]): boolean {
  const stem = testBasename.replace(RECURRING_TEST_BASENAME_RE, '').toLowerCase();
  return taskPaths.some(p => {
    const b = basename(p);
    if (isRecurringTestBasename(b)) return false;
    return b.toLowerCase().replace(/\.[cm]?[jt]sx?$/, '') === stem;
  });
}

// ─── glob-aware scope entries (live RUN-RENAME dilim-2, flow-63aedcaf) ──────
// The planner sometimes emits PATTERN scopes (`src/cli/commands/**/*.ts`) instead
// of concrete paths; treating the pattern as a literal path made every entry an
// invented-dir suspect and killed the run post-approval. A glob that matches ≥1
// tracked file is a scope pattern over existing content — not a typo. A glob that
// matches NOTHING keeps blocking (that is exactly a wrong-directory pattern).

const GLOB_MAGIC_RE = /[*?[]/;

/** Minimal path-glob → RegExp: `**` spans directories, `*`/`?` stay within one segment. */
function globToRegExp(glob: string): RegExp {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') { i++; out += '(?:.*/)?'; }
        else out += '.*';
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') {
      out += '[^/]';
    } else if ('\\^$.|+()[]{}'.includes(c)) {
      out += `\\${c}`;
    } else {
      out += c;
    }
  }
  return new RegExp(`^${out}$`);
}

function basename(p: string): string {
  const i = p.lastIndexOf('/');
  return i >= 0 ? p.slice(i + 1) : p;
}

function dirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i >= 0 ? p.slice(0, i) : '';
}

/** Pick the candidate sharing the longest leading path segment run with `target`. */
function pickClosest(target: string, candidates: string[]): string {
  const t = target.split('/');
  let best = candidates[0]!;
  let bestShared = -1;
  for (const c of candidates) {
    const parts = c.split('/');
    let shared = 0;
    while (shared < t.length && shared < parts.length && t[shared] === parts[shared]) shared++;
    if (shared > bestShared) { bestShared = shared; best = c; }
  }
  return best;
}

const MAX_LISTED_SUSPECTS = 20;

// ─── born-629c (407-004) — intentional-new-directory vs typo classification ──

/**
 * A write path that escapes the repo root (`..` traversal, absolute, `~`-home) —
 * always typo-class, never eligible for the intentional-new-dir carve-out below.
 */
function looksOutOfRoot(path: string): boolean {
  if (path.startsWith('/') || path.startsWith('~')) return true;
  let depth = 0;
  for (const seg of path.split('/')) {
    if (seg === '..') {
      depth--;
      if (depth < 0) return true;
    } else if (seg !== '.' && seg !== '') {
      depth++;
    }
  }
  return false;
}

/** Control characters and characters invalid/reserved on common filesystems — never a legitimate new-directory signal. */
const SUSPICIOUS_CHAR_RE = /[\x00-\x1f<>:"|?*\\]/;
function hasSuspiciousCharacters(path: string): boolean {
  return SUSPICIOUS_CHAR_RE.test(path);
}

/**
 * How many NEW (untracked) directory levels below the nearest tracked ancestor
 * still read as "a normal new subdirectory" — beyond this an invented path looks
 * too deep to be a plausible one-off addition and stays typo-class (BLOCK).
 */
const MAX_NEW_DIR_DEPTH = 2;

/**
 * How many tracked files must already live under a directory before a brand-new
 * subdirectory of it is trusted as "this is an established content root — a new
 * subfolder is a normal categorization move" (WARN, born-629c) rather than "this
 * directory barely has any content — a stray new subfolder is exactly the
 * born-573/518 hallucination pattern" (BLOCK). Deliberately well above a thin/
 * fresh directory's file count so sparse areas keep the stricter check.
 */
const MIN_ESTABLISHED_ROOT_FILES = 15;

/**
 * Nearest tracked ancestor of `dir` (itself untracked) plus how many NEW path
 * segments separate them. Returns null when NO prefix of `dir` is tracked at all
 * — a fully invented top-level tree, not merely a new subdirectory of something
 * that already exists.
 */
function findTrackedAncestor(
  dir: string,
  trackedDirs: ReadonlySet<string>,
): { ancestor: string; newDepth: number } | null {
  const segments = dir.split('/');
  for (let i = segments.length - 1; i >= 1; i--) {
    const prefix = segments.slice(0, i).join('/');
    if (trackedDirs.has(prefix)) return { ancestor: prefix, newDepth: segments.length - i };
  }
  return null;
}

/**
 * Evaluate the scope gate for a planned sprint.
 *
 * Classification per file path (checked in order):
 * 1. **confirmed** — the path is tracked (or, for a READ, is written by some task
 *    in this same plan, i.e. it will exist via a dependency).
 * 2. **suspect (wrong-dir)** — not tracked, but a file with the same (distinctive)
 *    basename exists elsewhere → almost certainly the wrong directory (573/518).
 * 3. **new-plausible** — not tracked, no basename collision, and the parent
 *    directory already contains tracked files → a legitimate brand-new file.
 * 4. **new-plausible (intentional new-dir, born-629c)** — parent directory does
 *    NOT exist yet, but its nearest tracked ancestor is an established root (many
 *    tracked files) and the path is otherwise unsuspicious (in-root, no odd
 *    characters, normal depth) → a plausible deliberate new directory, not a
 *    typo (WARN via advisories, never blocks).
 * 5. **suspect (invented-dir)** — not tracked, no basename collision, and either
 *    escapes the repo root / has a suspicious character / is too deep / has no
 *    (or too thin an) tracked ancestor → invented/typo location.
 *
 * Only WRITE-path suspects block (a suspect READ is advisory — it may be a
 * dependency artifact). Pure function: no I/O, no prompting, no side effects.
 */
export function evaluateScopeGate(input: ScopeGateInput): ScopeGateResult {
  const { tasks, trackedFiles, acknowledgeScopePaths, resolveSuggestions } = input;

  const tracked = new Set(trackedFiles);
  const byBasename = new Map<string, string[]>();
  const trackedDirs = new Set<string>();
  for (const f of trackedFiles) {
    const b = basename(f);
    let arr = byBasename.get(b);
    if (!arr) { arr = []; byBasename.set(b, arr); }
    arr.push(f);
    let d = dirname(f);
    while (d) {
      trackedDirs.add(d);
      const ni = d.lastIndexOf('/');
      d = ni >= 0 ? d.slice(0, ni) : '';
    }
  }

  // born-584 — greenfield/root-only predicate: with ZERO tracked directories the
  // invented-dir rule below is unsatisfiable for every nested path (and wrong-dir
  // self-disables via the empty byBasename map), so "suspect" would be a
  // 100%-false-positive label. Advisory-WARN posture (Alperen 2026-07-10):
  // classify such paths new-plausible and surface a visible notice instead of
  // hard-blocking a legitimate first sprint. Structural predicate, not a numeric
  // threshold — `trackedDirs.size === 0` is exactly the condition under which the
  // rule has no signal (also covers a root-only README+LICENSE repo).
  const greenfield = trackedDirs.size === 0;

  // Files any task plans to create — a READ of one of these resolves to "confirmed"
  // (it will exist by the time the reading task runs, via a dependency).
  const plannedWrites = new Set<string>();
  for (const t of tasks) for (const w of t.scope.filesWrite ?? []) plannedWrites.add(w);

  const classify = (
    taskId: string,
    path: string,
    role: 'write' | 'read',
    taskPaths: readonly string[],
    declaredDirs: readonly string[] = [],
  ): ScopePathVerdict => {
    if (tracked.has(path) || (role === 'read' && plannedWrites.has(path))) {
      return { taskId, path, role, classification: 'confirmed', reason: 'exists in the repo' };
    }
    if (GLOB_MAGIC_RE.test(path)) {
      const re = globToRegExp(path);
      const matchCount = trackedFiles.reduce((n, f) => (re.test(f) ? n + 1 : n), 0);
      if (matchCount > 0) {
        return {
          taskId, path, role,
          classification: 'confirmed',
          reason: `scope pattern matching ${matchCount} tracked file(s)`,
        };
      }
      return {
        taskId, path, role,
        classification: 'suspect',
        reason: 'glob pattern matches no tracked file — likely a wrong-directory pattern',
      };
    }
    const b = basename(path);
    const siblings = byBasename.get(b);
    const testMirrorInTrackedDir = isRecurringTestBasename(b)
      && trackedDirs.has(dirname(path))
      && taskOwnsMatchingSource(b, taskPaths);
    // sprint-500 (2026-08-10) — declared-directory carve-out. A path inside a
    // directory the task EXPLICITLY declared in `scope.directories` is a file the
    // task intends to create; it is not a typo, however closely its basename
    // matches something elsewhere. Measured: a doc task declared
    // `docs/tr/reference/` and planned to CREATE the Turkish mirrors of two
    // English pages. Both were absent (that is the task) and shared a basename
    // with their English source, so the sibling branch below called them suspect
    // and the drop-duplicate resolution then DELETED the task's only deliverables,
    // leaving it scoped to overwrite the English originals its own NO-GO clause
    // forbade touching. Every parallel tree — language mirrors, per-OS variants,
    // versioned copies — collides the same way. Same shape as the born-629c
    // carve-out below: reuse `new-plausible` so the worker-prompt scope renderer
    // keeps bucketing it, and let a declared directory outrank a basename
    // coincidence. Nothing here is a new lookup.
    if (declaredDirs.some((dir) => {
      const d = dir.replace(/^\.\//, '').replace(/\/+$/, '').toLowerCase();
      return d.length > 0 && path.replace(/^\.\//, '').toLowerCase().startsWith(`${d}/`);
    })) {
      return {
        taskId, path, role,
        classification: 'new-plausible',
        reason: 'new file inside a directory this task explicitly declared in scope',
      };
    }
    if (siblings && siblings.length > 0 && !COMMON_BASENAMES.has(b.toLowerCase()) && !testMirrorInTrackedDir) {
      const suggestion = pickClosest(path, siblings);
      return {
        taskId, path, role,
        classification: 'suspect',
        suggestion,
        reason: `no such file; a file with the same name exists at ${suggestion}`,
      };
    }
    const parent = dirname(path);
    if (parent === '' || trackedDirs.has(parent)) {
      return { taskId, path, role, classification: 'new-plausible', reason: 'new file in an existing directory' };
    }
    if (greenfield) {
      return {
        taskId, path, role,
        classification: 'new-plausible',
        reason: 'greenfield repo (no tracked directories) — path validation has no signal',
      };
    }
    // born-629c (407-004) — intentional-new-directory carve-out: a brand-new
    // subdirectory of an ESTABLISHED tracked root (many files already live there),
    // at normal depth, with no out-of-root/suspicious-character signal, reads as a
    // deliberate new directory rather than a typo/hallucinated path (the
    // docs/guides-style false positive) — classify it the same as any other
    // legitimate new file (`new-plausible`, non-blocking) instead of `suspect`.
    // Reuses the EXISTING `new-plausible` value rather than adding a 4th enum
    // value: prompt-god-template.ts's buildWriteAuthorityList (worker-prompt
    // scope rendering) buckets verdicts by classification into
    // confirmed/new-plausible/suspect only — a new value would silently vanish
    // from that worker-facing list. Typo-class (out-of-root / suspicious-char /
    // too-deep / thin-ancestor) falls through unchanged to the suspect BLOCK below.
    if (!looksOutOfRoot(path) && !hasSuspiciousCharacters(path)) {
      const ancestorInfo = findTrackedAncestor(parent, trackedDirs);
      if (ancestorInfo && ancestorInfo.newDepth <= MAX_NEW_DIR_DEPTH) {
        const ancestorPrefix = `${ancestorInfo.ancestor}/`;
        const ancestorFileCount = trackedFiles.filter(f => f.startsWith(ancestorPrefix)).length;
        if (ancestorFileCount >= MIN_ESTABLISHED_ROOT_FILES) {
          return {
            taskId, path, role,
            classification: 'new-plausible',
            reason: `new directory '${parent}' — no such directory yet, but its established tracked `
              + `ancestor '${ancestorInfo.ancestor}' (${ancestorFileCount} tracked files) makes this look `
              + 'like an intentional new directory, not a typo (WARN, not blocked)',
          };
        }
      }
    }
    return {
      taskId, path, role,
      classification: 'suspect',
      reason: `no such file and its directory '${parent}' is not in the repo`,
    };
  };

  const verdicts: ScopePathVerdict[] = [];
  for (const t of tasks) {
    const taskPaths = [...(t.scope.filesWrite ?? []), ...(t.scope.filesRead ?? [])];
    const declaredDirs = t.scope.directories ?? [];
    for (const w of t.scope.filesWrite ?? []) verdicts.push(classify(t.id, w, 'write', taskPaths, declaredDirs));
    for (const r of t.scope.filesRead ?? []) verdicts.push(classify(t.id, r, 'read', taskPaths, declaredDirs));
  }

  const writeSuspects = verdicts.filter(v => v.role === 'write' && v.classification === 'suspect');
  const advisories = verdicts.filter(
    v => v.classification === 'new-plausible' || (v.classification === 'suspect' && v.role === 'read'),
  );

  // sprint-399/003 — suggestion-adoption: resolve the write-suspects the gate can
  // already prove safe from evidence it already has (no new lookups), instead of
  // forcing every sprint containing one typo through a blanket --force-scope.
  // Computed unconditionally (`resolutions` is always advisory data); only
  // `resolveSuggestions` decides whether a resolved suspect still blocks below.
  const taskById = new Map(tasks.map(t => [t.id, t]));
  const normPath = (p: string) => p.replace(/^\.\//, '').toLowerCase();
  const resolutionByVerdict = new Map<ScopePathVerdict, ScopeResolution>();
  for (const s of writeSuspects) {
    if (!s.suggestion) continue; // invented-dir suspect — no candidate to resolve to (rule c)
    const taskWrites = taskById.get(s.taskId)?.scope.filesWrite ?? [];
    const suggestionNorm = normPath(s.suggestion);
    if (taskWrites.some(w => normPath(w) === suggestionNorm)) {
      // rule (a) — born-N6 / 397-011: suggestion already planned in the same task.
      resolutionByVerdict.set(s, {
        taskId: s.taskId,
        path: s.path,
        action: 'drop-duplicate',
        replacement: s.suggestion,
        reason: `duplicate of '${s.suggestion}', already planned as a write in the same task`,
      });
      continue;
    }
    const siblings = byBasename.get(basename(s.path));
    if (siblings && siblings.length === 1) {
      // rule (b) — born-N6 / 397-007: unambiguous, sole tracked candidate for this basename.
      resolutionByVerdict.set(s, {
        taskId: s.taskId,
        path: s.path,
        action: 'auto-replace',
        replacement: s.suggestion,
        reason: `unambiguous — '${s.suggestion}' is the only tracked file with this basename`,
      });
    }
    // else: 2+ same-basename candidates — left unresolved (rule c).
  }
  const resolutions = [...resolutionByVerdict.values()];

  const blockingWriteSuspects = resolveSuggestions
    ? writeSuspects.filter(s => !resolutionByVerdict.has(s))
    : writeSuspects;

  if (blockingWriteSuspects.length > 0 && !acknowledgeScopePaths) {
    const shown = blockingWriteSuspects.slice(0, MAX_LISTED_SUSPECTS);
    const list = shown.map(s => {
      const hint = s.suggestion ? ` → did you mean '${s.suggestion}'?` : '';
      return `  • [${s.taskId}] ${s.path} (${s.reason})${hint}`;
    }).join('\n');
    const more = blockingWriteSuspects.length > shown.length
      ? `\n  … and ${blockingWriteSuspects.length - shown.length} more`
      : '';
    return {
      ok: false,
      reason: 'SCOPE_GATE_SUSPECT',
      suspects: blockingWriteSuspects,
      verdicts,
      resolutions,
      message:
        `Scope gate: ${blockingWriteSuspects.length} write path(s) do not exist and look like a typo or wrong directory:\n${list}${more}\n` +
        `If these are intentional new files, override with acknowledgeScopePaths=true (MCP) / --force-scope (CLI). ` +
        `If a path should be an existing file, fix the DIRECTIVES scope before spawning.`,
    };
  }

  // born-584 — count the writes the greenfield gate could NOT validate (anything
  // not literally tracked). Zero ⇒ nothing to warn about (e.g. all-root writes in
  // a root-only repo that happen to be tracked).
  const greenfieldUnvalidated = greenfield
    ? verdicts.filter(v => v.role === 'write' && v.classification !== 'confirmed').length
    : 0;

  const resolvedWriteSuspects = resolveSuggestions
    ? writeSuspects.filter(s => resolutionByVerdict.has(s))
    : [];

  return {
    ok: true,
    verdicts,
    advisories: [...advisories, ...resolvedWriteSuspects],
    overrideApplied: blockingWriteSuspects.length > 0 ? true : undefined,
    resolutions,
    ...(greenfieldUnvalidated > 0
      ? {
          greenfield: true,
          greenfieldNotice:
            `Scope gate: greenfield repo (no tracked directories) — ${greenfieldUnvalidated} write path(s) ` +
            `could not be validated against tracked files; proceeding advisory-only (born-584).`,
        }
      : {}),
  };
}

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
}

export interface ScopeGatePass {
  ok: true;
  verdicts: ScopePathVerdict[];
  /** Non-blocking advisories: new-plausible files + suspect READ paths. */
  advisories: ScopePathVerdict[];
  /** Set when write-suspects existed but `acknowledgeScopePaths` bypassed the block. */
  overrideApplied?: boolean;
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
  /** The WRITE-path suspects that triggered the block. */
  suspects: ScopePathVerdict[];
  verdicts: ScopePathVerdict[];
  /** Human-readable explanation suitable for an error message. */
  message: string;
}

export type ScopeGateResult = ScopeGatePass | ScopeGateBlocked;

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
 * 4. **suspect (invented-dir)** — not tracked, no basename collision, and the
 *    parent directory is not in the repo at all → invented location.
 *
 * Only WRITE-path suspects block (a suspect READ is advisory — it may be a
 * dependency artifact). Pure function: no I/O, no prompting, no side effects.
 */
export function evaluateScopeGate(input: ScopeGateInput): ScopeGateResult {
  const { tasks, trackedFiles, acknowledgeScopePaths } = input;

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

  const classify = (taskId: string, path: string, role: 'write' | 'read'): ScopePathVerdict => {
    if (tracked.has(path) || (role === 'read' && plannedWrites.has(path))) {
      return { taskId, path, role, classification: 'confirmed', reason: 'exists in the repo' };
    }
    const b = basename(path);
    const siblings = byBasename.get(b);
    if (siblings && siblings.length > 0 && !COMMON_BASENAMES.has(b.toLowerCase())) {
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
    return {
      taskId, path, role,
      classification: 'suspect',
      reason: `no such file and its directory '${parent}' is not in the repo`,
    };
  };

  const verdicts: ScopePathVerdict[] = [];
  for (const t of tasks) {
    for (const w of t.scope.filesWrite ?? []) verdicts.push(classify(t.id, w, 'write'));
    for (const r of t.scope.filesRead ?? []) verdicts.push(classify(t.id, r, 'read'));
  }

  const writeSuspects = verdicts.filter(v => v.role === 'write' && v.classification === 'suspect');
  const advisories = verdicts.filter(
    v => v.classification === 'new-plausible' || (v.classification === 'suspect' && v.role === 'read'),
  );

  if (writeSuspects.length > 0 && !acknowledgeScopePaths) {
    const shown = writeSuspects.slice(0, MAX_LISTED_SUSPECTS);
    const list = shown.map(s => {
      const hint = s.suggestion ? ` → did you mean '${s.suggestion}'?` : '';
      return `  • [${s.taskId}] ${s.path} (${s.reason})${hint}`;
    }).join('\n');
    const more = writeSuspects.length > shown.length
      ? `\n  … and ${writeSuspects.length - shown.length} more`
      : '';
    return {
      ok: false,
      reason: 'SCOPE_GATE_SUSPECT',
      suspects: writeSuspects,
      verdicts,
      message:
        `Scope gate: ${writeSuspects.length} write path(s) do not exist and look like a typo or wrong directory:\n${list}${more}\n` +
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

  return {
    ok: true,
    verdicts,
    advisories,
    overrideApplied: writeSuspects.length > 0 ? true : undefined,
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

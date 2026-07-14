/**
 * planner-normalize.ts — PCOMP-8 U2: the deterministic OUTPUT-CONTRACT
 * completer for zero-config planner results (A5 Kaldıraç-2).
 *
 * Ground truth (A2/A3): the planner's output was never a contract — it
 * routinely shipped `filesRead: []` (the birth-place of "needed core files
 * missing from read scope"), split tests into a separate task (leaving the
 * code task test-less AND its exact-verify set empty → placeholder), and its
 * task range was a 3-5 hardcode. Nondeterminism makes prompt-side rules
 * unreliable (sınav-1 filled filesRead; sprint-442 did not) — so the contract
 * is enforced HERE, deterministically, after parse:
 *
 *   N1  mentioned-path completion — real repo paths named in the task's own
 *       title/description/goCriteria join filesRead (never filesWrite).
 *   N2  import completion — every filesWrite source file's relative imports
 *       resolve to repo paths and join filesRead (fail-soft on read errors).
 *   N3  mirror-test completion — a behavior-changing src task gains its
 *       mirror test file in filesWrite ("create-if-missing" semantics feeds
 *       resolveTargetedTestPaths → the placeholder class G5 cannot be born),
 *       UNLESS another task in the SAME plan already writes that test file
 *       (explicit separate-test-task decomposition stays legal and collision-free).
 *
 * Pure w.r.t. decisions: file reads are injected via `deps.readFile` so tests
 * are hermetic; production wires fs. Never throws — a normalization that
 * cannot complete leaves the task unchanged (the linter's W-checks remain the
 * witnesses).
 */

import { dirname, join, normalize } from 'node:path';
import type { PlannerResult, PlannerTask } from '../core/types.js';
import { mirrorTestPath } from '../core/task-builder-scope.js';

export interface NormalizeDeps {
  /** Repo-relative tracked file list (git ls-files) — the reality filter. */
  trackedFiles: readonly string[];
  /** Fail-soft file reader (repo-relative path → content or null). */
  readFile: (repoRelPath: string) => string | null;
}

const REPO_PATH_RE = /(?:src|tests|scripts|docs)\/[\w\-/.]+\.[\w]+/g;
const IMPORT_RE = /from\s+['"](\.[^'"]+)['"]|import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;

/** Resolve a relative import specifier from a repo-relative source file to a
 *  repo-relative path, mapping the ESM '.js' suffix back to the '.ts' source. */
function resolveImport(fromFile: string, spec: string): string {
  const raw = normalize(join(dirname(fromFile), spec)).replace(/\\/g, '/');
  return raw.replace(/\.js$/, '.ts');
}

function isSourceFile(p: string): boolean {
  return p.startsWith('src/') && /\.(ts|tsx|mts|cts)$/.test(p) && !/\.(test|spec)\./.test(p);
}

function isTestFile(p: string): boolean {
  return /(^|\/)tests?\//.test(p) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(p);
}

function normalizeTask(
  task: PlannerTask,
  allTasks: readonly PlannerTask[],
  deps: NormalizeDeps,
): PlannerTask {
  const tracked = new Set(deps.trackedFiles);
  const write = new Set(task.scope.filesWrite);
  const read = new Set(task.scope.filesRead ?? []);

  // N1 — mentioned real paths → filesRead (content the worker must consult).
  const ownText = `${task.title}\n${task.description}\n${task.goNogo?.goCriteria ?? ''}\n${task.goNogo?.noGoCriteria ?? ''}`;
  for (const m of ownText.matchAll(REPO_PATH_RE)) {
    const p = m[0];
    if (tracked.has(p) && !write.has(p)) read.add(p);
  }

  // N2 — imports of every written source file → filesRead.
  for (const f of task.scope.filesWrite) {
    if (!isSourceFile(f) || !tracked.has(f)) continue;
    const content = deps.readFile(f);
    if (!content) continue;
    for (const m of content.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2];
      if (!spec) continue;
      const resolved = resolveImport(f, spec);
      if (tracked.has(resolved) && !write.has(resolved)) read.add(resolved);
    }
  }

  // N3 — mirror test for behavior-changing src work (create-if-missing),
  // unless another task in this plan owns that test file.
  const writesSource = task.scope.filesWrite.some(isSourceFile);
  const writesOnlyTests = task.scope.filesWrite.length > 0 && task.scope.filesWrite.every(isTestFile);
  if (writesSource && !writesOnlyTests) {
    for (const f of task.scope.filesWrite) {
      const mirror = isSourceFile(f) ? mirrorTestPath(f) : undefined;
      if (!mirror || write.has(mirror)) continue;
      const ownedElsewhere = allTasks.some(
        (other) => other !== task && other.scope.filesWrite.includes(mirror),
      );
      if (!ownedElsewhere) write.add(mirror);
    }
  }

  return {
    ...task,
    scope: {
      ...task.scope,
      filesRead: [...read].sort(),
      filesWrite: [...write].sort(),
    },
  };
}

/** Apply the U2 output contract to a full planner result. Deterministic, total. */
export function normalizePlannerResult(plan: PlannerResult, deps: NormalizeDeps): PlannerResult {
  return { ...plan, tasks: plan.tasks.map((t) => normalizeTask(t, plan.tasks, deps)) };
}

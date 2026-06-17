# Brain-Eval + Auditor + Cross-Verify + Flow-Reporter Kernel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a finished autonomous task (`execute-dispatcher`, kind=task) pass through the SAME core Brain-Eval + Auditor + Cross-Verify that sprint mode already applies — via reusable, mode-independent kernels — and emit a rich dual-channel (human terminal + AI JSONL) flow of every orchestration step.

**Architecture:** Three thin entry→kernel adapters in one new module `backlog-eval.ts` delegate a `BacklogEntry`+`TaskResult` to the existing sprint-mode functions (`evaluateWithRubric`, the auditor scope/ADR/functional checks, `runCrossVerify`). A separate `flow-reporter.ts` emits one structured step per orchestration phase on two injected channels. The execute-dispatcher's task branch is rewired to run eval→audit→cross-verify after `waitForResult`, persist a rich verdict on `BacklogEntry.lastResult`, and fire flow steps. No new evaluation logic is invented — uniformity holds because both paths call the same kernels.

**Tech Stack:** TypeScript (ESM, Node16 resolution — `.js` import suffixes mandatory), vitest (hermetic: tmpdir + injected deps, no `spawnSync` in tests), i18n via `getMessage(key, lang)` (en/tr).

**Reuse anchors (all verified to exist):**
- `evaluateWithRubric(result, task, rubric?, projectRoot?): EvaluationResult` — `src/orchestra/result-evaluator.ts:1152` (non-deprecated; does rubric scoring + spurious-NO_GO reconciliation). `EvaluationResult = { decision, totalScore, rubricScores, retryCount }` — `src/core/task-types.ts:378`. NOTE: the older `evaluateResult` returns a bare `TaskEvaluation` enum and is `@deprecated` — do NOT use it.
- `isFileInScope(file, scope)` — `src/monitor/auditor.ts:636` (currently NOT exported — Task 1 exports it). `checkADRCompliance(projectRoot, changedFiles, sprintId?): ADRViolation[]` — `auditor.ts:2129`. `verifyWorkerResult(taskId, projectRoot, result, sprintId?): Promise<VerificationResult>` — `auditor.ts:1996`. `VerificationVerdict = 'PASS' | 'DOWNGRADE' | 'FAIL'` — `auditor.ts:1843`. `ADRViolation { adrId, adrTitle, violation, severity }` — `auditor.ts:2058`. `VerificationResult { verdict, reason, ... }` — `auditor.ts:1846`.
- `BoundaryViolation { type, agentId, detail, timestamp }` — `src/core/monitoring-types.ts:79`.
- `runCrossVerify(projectRoot, task, result, evaluation: TaskEvaluation, config, opts): Promise<CrossVerifyRunResult>` — `src/orchestra/cross-verify-runner.ts:189`. `CrossVerifyRunResult { ran, skippedReason?, advisory?, refuted }`; `CrossVerifyAdvisory { verifier, verdict: 'confirmed'|'refuted'|'unclear', reason }`; `RunCrossVerifyOptions { availableProviders?, spawnVerifier?, verifierModel?, timeoutMs? }`. Config-gated default-OFF; honest-skip → `ran:false`.
- `Task` — `src/core/task-types.ts:232`; `TaskStatus` (enum, `.DONE`) `:208`; `TaskPriority = 'CRITICAL'|'HIGH'|'NORMAL'|'LOW'` `:171`; `TaskEffort = 'low'|'normal'|'high'` `:170`; `TaskEvaluation` enum `:208`; `RubricScore { criterion, score, passed, reason }`.
- `updateStatus(path, bl, id, status, lastResult: BacklogEntry['lastResult'])` — `src/orchestra/autonomous/backlog.ts:81` (persists whatever `lastResult` shape the type allows → Task 2 widens it).
- Dispatcher DI pattern + wiring point — `src/orchestra/autonomous/execute-dispatcher.ts` (task branch lines 149-188) and `src/orchestra/autonomous/runtime-loop.ts:225` (`makeExecuteDispatcher` call).

**Binding constraints (from project memory — non-negotiable):**
- **Cross-check (Anthropic↔OpenAI) is binding** — "brain-eval tek başına yetmez". Component ③ (cross-verify) is required, not optional. It honest-skips (visibly) when no 2nd provider, never silently passes.
- **Dual-perspective** — every kernel serves both deckent dogfood AND deckent product (user/enterprise running `deckent autonomous`). Kernels are project-agnostic.
- **i18n-first** — every human-facing string via `getMessage` (en/tr). Channel-2 JSONL keys are stable machine English (not localized).
- **No-emoji rule is dashboard-scoped** — the terminal flow may use the spec's unicode markers (`▶ ✎ ⚙ 🧠 🛡 🔀 ✓ ✗ ⏸`); the JSONL channel uses plain machine keys (no emoji). Never add emoji to the dashboard.
- **TDD + hermetic + real-behavior** — watch each test fail first; no mock-only "green-but-dead" tests; tmpdir for all I/O; no `spawnSync` in tests.

---

## Task 1: Export `isFileInScope` from the auditor (boundary scope primitive)

**Files:**
- Modify: `src/monitor/auditor.ts:636`
- Test: `tests/monitor/auditor-scope-export.test.ts`

The autonomous Auditor adapter (Task 4) needs the canonical scope-membership check. The auditor already has it as a private `isFileInScope`; the `checkBoundaryViolations` wrapper around it is git-`diff --stat`-based (sprint-scan-specific). For the post-execution autonomous path the ground truth is `result.filesChanged`, so we reuse the inner primitive directly. This task only adds the `export` keyword — zero behavior change.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/monitor/auditor-scope-export.test.ts
import { describe, it, expect } from 'vitest';
import { isFileInScope } from '../../src/monitor/auditor.js';
import type { TaskScope } from '../../src/core/types.js';

const scope: TaskScope = { directories: ['src/api/'], filesRead: [], filesWrite: ['README.md'] };

describe('isFileInScope (exported auditor scope primitive)', () => {
  it('returns true for a file inside a scoped directory', () => {
    expect(isFileInScope('src/api/handler.ts', scope)).toBe(true);
  });
  it('returns false for a file outside every scoped directory', () => {
    expect(isFileInScope('src/orchestra/other.ts', scope)).toBe(false);
  });
  it('returns true for an exact filesWrite match', () => {
    expect(isFileInScope('README.md', scope)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/monitor/auditor-scope-export.test.ts`
Expected: FAIL — `isFileInScope` is not exported (`SyntaxError: The requested module ... does not provide an export named 'isFileInScope'`).

- [ ] **Step 3: Add the `export` keyword**

In `src/monitor/auditor.ts`, change line 636 from:

```typescript
function isFileInScope(filePath: string, scope: TaskScope): boolean {
```

to:

```typescript
export function isFileInScope(filePath: string, scope: TaskScope): boolean {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/monitor/auditor-scope-export.test.ts`
Expected: PASS (3/3). Then `npx tsc --noEmit` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/monitor/auditor.ts tests/monitor/auditor-scope-export.test.ts
git commit -m "feat(auditor): export isFileInScope scope primitive for mode-independent reuse"
```

---

## Task 2: Widen `BacklogEntry.lastResult` to carry the rich verdict

**Files:**
- Modify: `src/orchestra/autonomous/backlog-types.ts:48`
- Test: `tests/orchestra/autonomous/backlog-lastresult-shape.test.ts`

The rich Brain+Auditor+Cross-Verify verdict must round-trip on disk via `updateStatus`. Widen `lastResult` additively (all new fields optional → existing `{ ok, reason }` writers and back-compat are preserved).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/orchestra/autonomous/backlog-lastresult-shape.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBacklog, updateStatus } from '../../../src/orchestra/autonomous/backlog.js';
import type { BacklogEntry } from '../../../src/orchestra/autonomous/backlog-types.js';

let dir: string | undefined;
afterEach(() => { if (dir) { rmSync(dir, { recursive: true, force: true }); dir = undefined; } });

describe('BacklogEntry.lastResult rich verdict round-trip', () => {
  it('persists decision + reconciled + quality + audit + crossVerify and reloads them', () => {
    dir = mkdtempSync(join(tmpdir(), 'bl-rich-'));
    mkdirSync(join(dir, '.deckent', 'autonomous'), { recursive: true });
    const path = join(dir, '.deckent', 'autonomous', 'backlog.json');
    const entry: BacklogEntry = {
      id: 'e1', title: 't', kind: 'task', spec: { scopeDir: 'src/api/' }, policy: 'auto',
      trigger: { type: 'one-off' }, status: 'running', lastRun: null, lastResult: null,
    };
    writeFileSync(path, JSON.stringify({ _version: '1.0', entries: [entry] }), 'utf-8');

    const bl = loadBacklog(path);
    updateStatus(path, bl, 'e1', 'done', {
      ok: true,
      reason: 'decision=GO_WITH_TECH_DEBT',
      decision: 'GO_WITH_TECH_DEBT',
      reconciled: true,
      quality: 78,
      audit: { boundary: 'clean', adr: 'ok', functional: 'pass' },
      crossVerify: { ran: true, verdict: 'confirmed' },
    });

    const saved = JSON.parse(readFileSync(path, 'utf-8')).entries[0];
    expect(saved.status).toBe('done');
    expect(saved.lastResult.decision).toBe('GO_WITH_TECH_DEBT');
    expect(saved.lastResult.reconciled).toBe(true);
    expect(saved.lastResult.quality).toBe(78);
    expect(saved.lastResult.audit.functional).toBe('pass');
    expect(saved.lastResult.crossVerify.verdict).toBe('confirmed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orchestra/autonomous/backlog-lastresult-shape.test.ts`
Expected: FAIL — `npx tsc --noEmit` (and the test's TS compile) rejects the rich object: `Object literal may only specify known properties, and 'decision' does not exist in type '{ ok: boolean; reason: string; }'`.

- [ ] **Step 3: Widen the type**

In `src/orchestra/autonomous/backlog-types.ts`, replace line 48:

```typescript
  lastResult: { ok: boolean; reason: string } | null;
```

with:

```typescript
  /**
   * Outcome of the last run. CORE-UNIFORMITY (slice 1): additively widened to
   * carry the rich Brain-Eval + Auditor + Cross-Verify verdict so a finished
   * autonomous task surfaces the SAME core evaluation sprint mode produces.
   * All fields beyond `ok`/`reason` are optional — pre-existing `{ ok, reason }`
   * writers and on-disk back-compat are preserved.
   */
  lastResult: {
    ok: boolean;
    reason: string;
    /** Brain decision (rubric + reconciliation). */
    decision?: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
    /** True when the worker self-reported NO_GO but disk-verify overrode it. */
    reconciled?: boolean;
    /** Rubric quality score (totalScore). */
    quality?: number;
    /** Auditor verdict (advisory — never flips status). */
    audit?: {
      boundary: 'clean' | string[];
      adr: 'ok' | string[];
      functional: 'pass' | 'fail' | 'skipped';
    };
    /** XVER-1 cross-provider verification (advisory; honest-skip → ran:false). */
    crossVerify?: { ran: boolean; verdict?: 'confirmed' | 'refuted' | 'unclear' };
  } | null;
```

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run tests/orchestra/autonomous/backlog-lastresult-shape.test.ts`
Expected: PASS (1/1).
Run: `npx tsc --noEmit`
Expected: clean (additive optional fields break no existing writer).

- [ ] **Step 5: Commit**

```bash
git add src/orchestra/autonomous/backlog-types.ts tests/orchestra/autonomous/backlog-lastresult-shape.test.ts
git commit -m "feat(backlog): widen lastResult with rich Brain+Auditor+CrossVerify verdict (additive)"
```

---

## Task 3: Component ① — Brain-Eval adapter (`evaluateBacklogResult`)

**Files:**
- Create: `src/orchestra/autonomous/backlog-eval.ts`
- Test: `tests/orchestra/autonomous/backlog-eval.test.ts`

Build the minimal `Task` from a `BacklogEntry`+`TaskResult` (shared `buildTaskForEval`, reused by all three adapters), call the non-deprecated `evaluateWithRubric`, and map its `EvaluationResult` to `BacklogEvaluation { decision, quality, reconciled, reason }`. The `reconciled` flag is an honest derivation (the kernel overrides `decision` internally but exposes no flag).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/orchestra/autonomous/backlog-eval.test.ts
import { describe, it, expect } from 'vitest';
import {
  buildTaskForEval, mapEvaluation, evaluateBacklogResult,
} from '../../../src/orchestra/autonomous/backlog-eval.js';
import type { BacklogEntry } from '../../../src/orchestra/autonomous/backlog-types.js';
import type { TaskResult, EvaluationResult } from '../../../src/core/types.js';

const entry: BacklogEntry = {
  id: 'roles', title: 'Roles CRUD', kind: 'task',
  spec: { scopeDir: 'src/api/', description: 'add roles crud endpoints' },
  policy: 'auto', trigger: { type: 'one-off' }, status: 'running',
  lastRun: null, lastResult: null,
};

function result(over: Partial<TaskResult>): TaskResult {
  return {
    taskId: 'run-1', workerId: 'w1', filesChanged: ['src/api/roles.ts', 'tests/api/roles.test.ts'],
    linesAdded: 120, linesRemoved: 4, testsPassed: true, coverage: 92,
    selfAssessment: 'DONE', notes: 'done', ...over,
  };
}

describe('buildTaskForEval', () => {
  it('maps entry+result into a Task with JIT description, scope, and run-id', () => {
    const task = buildTaskForEval(entry, result({}));
    expect(task.id).toBe('run-1');                       // result.taskId wins
    expect(task.description).toBe('add roles crud endpoints');
    expect(task.scope.directories).toEqual(['src/api/']);
    expect(task.goNogo.goCriteria).toBe('Roles CRUD');   // summary?? title
  });
});

describe('mapEvaluation (EvaluationResult -> BacklogEvaluation)', () => {
  const rubric = (over: Partial<EvaluationResult>): EvaluationResult => ({
    decision: 'DONE', totalScore: 95,
    rubricScores: [{ criterion: 'correctness', score: 95, passed: true, reason: 'ok' }],
    retryCount: 0, ...over,
  });
  it('clean DONE → reconciled false, quality = totalScore', () => {
    const m = mapEvaluation(result({ selfAssessment: 'DONE' }), rubric({}));
    expect(m).toEqual({ decision: 'DONE', quality: 95, reconciled: false, reason: 'all criteria passed' });
  });
  it('selfAssessment NO_GO but kernel decided GO_WITH_TECH_DEBT → reconciled true', () => {
    const m = mapEvaluation(
      result({ selfAssessment: 'NO_GO' }),
      rubric({ decision: 'GO_WITH_TECH_DEBT', totalScore: 78,
        rubricScores: [{ criterion: 'test_coverage', score: 40, passed: false, reason: 'low coverage' }] }),
    );
    expect(m.decision).toBe('GO_WITH_TECH_DEBT');
    expect(m.reconciled).toBe(true);
    expect(m.quality).toBe(78);
    expect(m.reason).toBe('low coverage');               // worst failing criterion
  });
});

describe('evaluateBacklogResult (end-to-end via real evaluateWithRubric)', () => {
  it('a clean passing result decides non-NO_GO', () => {
    const e = evaluateBacklogResult(entry, result({}), '/nonexistent-root');
    expect(e.decision).not.toBe('NO_GO');
    expect(e.reconciled).toBe(false);
  });
  it('an honest NO_GO with no disk work stays NO_GO', () => {
    const e = evaluateBacklogResult(
      entry,
      result({ selfAssessment: 'NO_GO', testsPassed: false, filesChanged: [], coverage: 0 }),
      '/nonexistent-root',
    );
    expect(e.decision).toBe('NO_GO');
    expect(e.reconciled).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orchestra/autonomous/backlog-eval.test.ts`
Expected: FAIL — module `backlog-eval.js` does not exist (import error).

- [ ] **Step 3: Create the module**

```typescript
// src/orchestra/autonomous/backlog-eval.ts
// Mode-independent Brain-Eval / Auditor / Cross-Verify kernels for the autonomous
// task path (CORE-UNIFORMITY slice 1). Each export is a THIN entry->kernel adapter:
// it builds a minimal Task from a BacklogEntry + its TaskResult and delegates to the
// SAME functions sprint mode calls, so a finished autonomous task passes through the
// same core evaluation. No new evaluation logic lives here — uniformity by construction.
import type { BacklogEntry } from './backlog-types.js';
import type { Task, TaskResult, RubricScore, EvaluationResult, ProviderName } from '../../core/types.js';
import { TaskStatus } from '../../core/types.js';
import { evaluateWithRubric } from '../result-evaluator.js';

export interface BacklogEvaluation {
  decision: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
  /** Rubric quality score (EvaluationResult.totalScore). */
  quality: number;
  /** True when the worker self-reported NO_GO but the kernel decided otherwise. */
  reconciled: boolean;
  /** Most-informative rubric line (worst failing criterion, else "all criteria passed"). */
  reason: string;
}

/** Build the minimal Task the sprint-mode kernels expect from a backlog entry + its run
 *  result. Shared by every adapter so the entry->Task mapping is single-source. */
export function buildTaskForEval(entry: BacklogEntry, result: TaskResult): Task {
  return {
    id: result.taskId || entry.id,
    title: entry.title,
    description: entry.spec.description ?? entry.summary ?? entry.title,
    model: (entry.model ?? result.tokenUsage?.model ?? 'sonnet') as Task['model'],
    effort: 'normal',
    priority: 'NORMAL',
    reason: '',
    scope: { directories: [entry.spec.scopeDir ?? '.'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: entry.summary ?? entry.title, noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.DONE,
    provider: entry.provider as ProviderName | undefined,
  };
}

/** Pick the most-informative reason: the worst FAILING criterion, else "all criteria passed". */
function pickReason(scores: RubricScore[]): string {
  if (scores.length === 0) return 'no rubric scored';
  const failed = scores.filter((s) => !s.passed);
  if (failed.length === 0) return 'all criteria passed';
  return failed.reduce((a, b) => (b.score < a.score ? b : a)).reason;
}

/** Map a kernel EvaluationResult onto the compact BacklogEvaluation. Pure — `reconciled`
 *  is derived (the kernel overrides `decision` internally but exposes no flag). */
export function mapEvaluation(result: TaskResult, evaluation: EvaluationResult): BacklogEvaluation {
  return {
    decision: evaluation.decision,
    quality: evaluation.totalScore,
    reconciled: result.selfAssessment === 'NO_GO' && evaluation.decision !== 'NO_GO',
    reason: pickReason(evaluation.rubricScores),
  };
}

/** Component ①: evaluate a finished autonomous task with the SAME rubric + reconciliation
 *  sprint mode uses (disk-verify outranks a wrong self-report when projectRoot is real). */
export function evaluateBacklogResult(
  entry: BacklogEntry,
  result: TaskResult,
  projectRoot: string,
): BacklogEvaluation {
  const task = buildTaskForEval(entry, result);
  return mapEvaluation(result, evaluateWithRubric(result, task, undefined, projectRoot));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/orchestra/autonomous/backlog-eval.test.ts`
Expected: PASS (all). Run `npx tsc --noEmit` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/orchestra/autonomous/backlog-eval.ts tests/orchestra/autonomous/backlog-eval.test.ts
git commit -m "feat(autonomous): Component 1 — evaluateBacklogResult Brain-Eval adapter (reuses evaluateWithRubric)"
```

---

## Task 4: Component ② — Auditor adapter (`auditBacklogResult`)

**Files:**
- Modify: `src/orchestra/autonomous/backlog-eval.ts` (append)
- Test: `tests/orchestra/autonomous/backlog-eval.test.ts` (append a `describe`)

Post-execution, advisory audit: boundary (filesChanged vs scope, via the exported `isFileInScope`), ADR compliance (`checkADRCompliance`), functional (`verifyWorkerResult`, injected for hermetic tests). Returns `AuditVerdict`; never flips the Brain decision.

- [ ] **Step 1: Write the failing test (append)**

```typescript
// append to tests/orchestra/autonomous/backlog-eval.test.ts
import { auditBacklogResult } from '../../../src/orchestra/autonomous/backlog-eval.js';
import type { VerificationResult } from '../../../src/monitor/auditor.js';

const passFn = async (): Promise<VerificationResult> => ({ verdict: 'PASS', reason: 'ok' });
const failFn = async (): Promise<VerificationResult> => ({ verdict: 'FAIL', reason: 'broke' });

describe('auditBacklogResult (Component ② — advisory)', () => {
  it('in-scope clean result → boundary clean, adr ok, functional pass', async () => {
    const v = await auditBacklogResult(
      entry, result({ filesChanged: ['src/api/roles.ts'] }), '/nonexistent-root',
      { verifyFunctional: passFn },
    );
    expect(v.boundary).toBe('clean');
    expect(v.adr).toBe('ok');                            // no .brain/memory.db → no ADR rules
    expect(v.functional).toBe('pass');
  });
  it('out-of-scope filesChanged → boundary violation list', async () => {
    const v = await auditBacklogResult(
      entry, result({ filesChanged: ['src/orchestra/elsewhere.ts'] }), '/nonexistent-root',
      { verifyFunctional: passFn },
    );
    expect(Array.isArray(v.boundary)).toBe(true);
    expect((v.boundary as unknown[]).length).toBe(1);
  });
  it('maps a FAIL/DOWNGRADE verifyWorkerResult verdict to functional fail', async () => {
    const v = await auditBacklogResult(
      entry, result({ filesChanged: ['src/api/roles.ts'] }), '/nonexistent-root',
      { verifyFunctional: failFn },
    );
    expect(v.functional).toBe('fail');
  });
  it('skips functional when no files changed', async () => {
    const v = await auditBacklogResult(
      entry, result({ filesChanged: [] }), '/nonexistent-root', { verifyFunctional: passFn },
    );
    expect(v.functional).toBe('skipped');
  });
  it('treats scopeDir "." as unrestricted (no boundary claim)', async () => {
    const broad: typeof entry = { ...entry, spec: { ...entry.spec, scopeDir: '.' } };
    const v = await auditBacklogResult(
      broad, result({ filesChanged: ['anywhere/file.ts'] }), '/nonexistent-root',
      { verifyFunctional: passFn },
    );
    expect(v.boundary).toBe('clean');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orchestra/autonomous/backlog-eval.test.ts`
Expected: FAIL — `auditBacklogResult` is not exported.

- [ ] **Step 3: Append the adapter**

Add these imports to the top of `src/orchestra/autonomous/backlog-eval.ts`:

```typescript
import type { TaskScope } from '../../core/types.js';
import type { BoundaryViolation } from '../../core/monitoring-types.js';
import {
  isFileInScope, checkADRCompliance, verifyWorkerResult,
  type ADRViolation, type VerificationResult,
} from '../../monitor/auditor.js';
```

Append to `src/orchestra/autonomous/backlog-eval.ts`:

```typescript
export interface AuditVerdict {
  boundary: 'clean' | BoundaryViolation[];
  adr: 'ok' | ADRViolation[];
  functional: 'pass' | 'fail' | 'skipped';
}

export interface AuditDeps {
  /** Injected for hermetic tests (default = real verifyWorkerResult, which may spawn git/tsc). */
  verifyFunctional?: (taskId: string, projectRoot: string, result: TaskResult) => Promise<VerificationResult>;
  /** Injected for hermetic tests (default = real checkADRCompliance). */
  checkAdr?: (projectRoot: string, changedFiles: string[]) => ADRViolation[];
}

/** Component ②: post-execution Auditor verdict (advisory only — never flips the Brain
 *  decision, per ADR-037 V1.0). Reuses the auditor's scope primitive + ADR + functional
 *  checks against the worker's declared filesChanged (the post-hoc ground truth). */
export async function auditBacklogResult(
  entry: BacklogEntry,
  result: TaskResult,
  projectRoot: string,
  deps: AuditDeps = {},
): Promise<AuditVerdict> {
  // boundary — scopeDir "." / undefined means "no declared scope" → no boundary claim.
  const scopeDir = entry.spec.scopeDir;
  let boundary: 'clean' | BoundaryViolation[] = 'clean';
  if (scopeDir && scopeDir !== '.') {
    const scope: TaskScope = { directories: [scopeDir], filesRead: [], filesWrite: [] };
    const violations: BoundaryViolation[] = [];
    for (const f of result.filesChanged) {
      if (!isFileInScope(f, scope)) {
        violations.push({
          type: 'file_outside_scope',
          agentId: result.workerId || entry.id,
          detail: `File outside scope: ${f}`,
          timestamp: new Date().toISOString(),
        });
      }
    }
    if (violations.length > 0) boundary = violations;
  }

  // adr — hermetic by default: absent .brain/memory.db → [] → 'ok'.
  const adrViolations = (deps.checkAdr ?? checkADRCompliance)(projectRoot, result.filesChanged);
  const adr: 'ok' | ADRViolation[] = adrViolations.length === 0 ? 'ok' : adrViolations;

  // functional — nothing changed → nothing to functionally verify.
  let functional: 'pass' | 'fail' | 'skipped';
  if (result.filesChanged.length === 0) {
    functional = 'skipped';
  } else {
    const verify = deps.verifyFunctional ?? ((id, pr, r) => verifyWorkerResult(id, pr, r));
    const vr = await verify(result.taskId, projectRoot, result);
    functional = vr.verdict === 'PASS' ? 'pass' : 'fail';
  }

  return { boundary, adr, functional };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/orchestra/autonomous/backlog-eval.test.ts`
Expected: PASS (all, incl. Task 3 cases). Run `npx tsc --noEmit` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/orchestra/autonomous/backlog-eval.ts tests/orchestra/autonomous/backlog-eval.test.ts
git commit -m "feat(autonomous): Component 2 — auditBacklogResult advisory Auditor adapter"
```

---

## Task 5: Component ③ — Cross-Verify adapter (`crossVerifyBacklogResult`, BINDING)

**Files:**
- Modify: `src/orchestra/autonomous/backlog-eval.ts` (append)
- Test: `tests/orchestra/autonomous/backlog-eval.test.ts` (append a `describe`)

Wire XVER-1 (`runCrossVerify`) into the autonomous path — cross-provider, mutual, advisory. Honest-skip (`ran:false`, surfaced) when disabled or no 2nd provider. **Binding** per `feedback_cross_check_anthropic_openai` ("brain-eval tek başına yetmez"). The cross-provider spawn is injected in tests (no live 2nd-provider call).

- [ ] **Step 1: Write the failing test (append)**

```typescript
// append to tests/orchestra/autonomous/backlog-eval.test.ts
import { crossVerifyBacklogResult } from '../../../src/orchestra/autonomous/backlog-eval.js';
import type { ResolvedConfig } from '../../../src/core/config-types.js';

const passingEval = { decision: 'DONE' as const, quality: 95, reconciled: false, reason: 'ok' };

describe('crossVerifyBacklogResult (Component ③ — XVER-1 cross-provider, advisory)', () => {
  it('honest-skips (ran:false) when cross_verify is disabled (no config)', async () => {
    const xv = await crossVerifyBacklogResult(entry, result({}), '/nonexistent-root', undefined, passingEval);
    expect(xv.ran).toBe(false);
    expect(xv.verdict).toBeUndefined();
  });
  it('surfaces a refuted advisory but does NOT throw / does not block (advisory)', async () => {
    const config = { cross_verify: { enabled: true, high_stakes_only: false } } as unknown as ResolvedConfig;
    const xv = await crossVerifyBacklogResult(
      entry, result({}), '/nonexistent-root', config, passingEval,
      {
        availableProviders: ['claude', 'codex'],
        spawnVerifier: async () => 'VERDICT: refuted\nThe change does not cover the error path.',
      },
    );
    expect(xv.ran).toBe(true);
    expect(xv.verdict).toBe('refuted');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orchestra/autonomous/backlog-eval.test.ts`
Expected: FAIL — `crossVerifyBacklogResult` is not exported.

- [ ] **Step 3: Append the adapter**

Add imports to the top of `src/orchestra/autonomous/backlog-eval.ts`:

```typescript
import { TaskEvaluation } from '../../core/types.js';
import type { ResolvedConfig } from '../../core/config-types.js';
import { runCrossVerify, type RunCrossVerifyOptions } from '../cross-verify-runner.js';
```

Append to `src/orchestra/autonomous/backlog-eval.ts`:

```typescript
export interface CrossVerifyVerdict {
  /** True when a 2nd-provider verifier actually ran. False = honest-skip (disabled /
   *  no 2nd provider / not-passing) — never a silent pass. */
  ran: boolean;
  verdict?: 'confirmed' | 'refuted' | 'unclear';
}

/** Component ③ (BINDING): cross-provider verification — Anthropic's work checked by
 *  OpenAI and vice-versa. Advisory: a `refuted` verdict is surfaced + persisted but never
 *  flips the Brain decision (Brain/human decides). Honest-skip when no 2nd provider. */
export async function crossVerifyBacklogResult(
  entry: BacklogEntry,
  result: TaskResult,
  projectRoot: string,
  config: ResolvedConfig | undefined,
  evaluation: BacklogEvaluation,
  opts: RunCrossVerifyOptions = {},
): Promise<CrossVerifyVerdict> {
  const task = buildTaskForEval(entry, result);
  // EvaluationResult.decision strings equal the TaskEvaluation enum values.
  const decisionEnum = evaluation.decision as unknown as TaskEvaluation;
  const run = await runCrossVerify(projectRoot, task, result, decisionEnum, config, opts);
  return { ran: run.ran, ...(run.advisory ? { verdict: run.advisory.verdict } : {}) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/orchestra/autonomous/backlog-eval.test.ts`
Expected: PASS (all). Run `npx tsc --noEmit` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/orchestra/autonomous/backlog-eval.ts tests/orchestra/autonomous/backlog-eval.test.ts
git commit -m "feat(autonomous): Component 3 — crossVerifyBacklogResult XVER-1 cross-provider wire (binding)"
```

---

## Task 6: Component ④ — Flow-Reporter (dual-channel) + i18n labels

**Files:**
- Create: `src/orchestra/autonomous/flow-reporter.ts`
- Modify: `src/cli/helpers/messages.ts` (append flow keys to the `autonomous.*` block, near line 927)
- Test: `tests/orchestra/autonomous/flow-reporter.test.ts`

One structured step per orchestration phase, on two injected channels: channel 1 = human terminal line (i18n label + unicode icon); channel 2 = `FlowStepRecord` to an AI-consumable sink (machine-stable English keys, no emoji). Pure/injected → hermetic.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/orchestra/autonomous/flow-reporter.test.ts
import { describe, it, expect } from 'vitest';
import { makeFlowReporter, type FlowStepRecord } from '../../../src/orchestra/autonomous/flow-reporter.js';

describe('makeFlowReporter (dual-channel)', () => {
  it('emits an ordered record on the audit channel and a human line on print', () => {
    const lines: string[] = [];
    const records: FlowStepRecord[] = [];
    const flow = makeFlowReporter({
      print: (l) => lines.push(l),
      audit: (r) => records.push(r),
      lang: 'en',
      now: () => '2026-06-17T00:00:00.000Z',
    });

    flow.step('spawned', 'roles', 'taskId=run-1');
    flow.step('brain_verdict', 'roles', 'GO_WITH_TECH_DEBT q=78 (reconciled)');
    flow.step('done', 'roles', 'decision=GO_WITH_TECH_DEBT');

    // channel 2 — machine records (stable English keys, no localization, no emoji)
    expect(records.map((r) => r.step)).toEqual(['spawned', 'brain_verdict', 'done']);
    expect(records[0]).toEqual({
      step: 'spawned', entryId: 'roles', detail: 'taskId=run-1', timestamp: '2026-06-17T00:00:00.000Z',
    });
    expect(records.some((r) => /[\u{1F300}-\u{1FAFF}]/u.test(r.detail))).toBe(false);

    // channel 1 — human terminal lines carry the entry id + detail
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('roles');
    expect(lines[1]).toContain('GO_WITH_TECH_DEBT q=78 (reconciled)');
  });

  it('is a no-op-safe partial (missing channels never throw)', () => {
    const flow = makeFlowReporter({ now: () => 'T' });
    expect(() => flow.step('parked', 'x')).not.toThrow();
  });

  it('localizes the step label (tr)', () => {
    const lines: string[] = [];
    const flow = makeFlowReporter({ print: (l) => lines.push(l), lang: 'tr', now: () => 'T' });
    flow.step('cross_verify', 'roles', 'skipped');
    expect(lines[0]).toContain('Çapraz-doğrulama');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orchestra/autonomous/flow-reporter.test.ts`
Expected: FAIL — module `flow-reporter.js` does not exist.

- [ ] **Step 3: Add i18n labels**

In `src/cli/helpers/messages.ts`, immediately after the `'autonomous.audit_row'` entry (around line 927), insert:

```typescript
  // ─── autonomous flow-reporter (CORE-UNIFORMITY slice 1) ──────────────
  'autonomous.flow_line': { en: '{icon} {label} [{entryId}] {detail}', tr: '{icon} {label} [{entryId}] {detail}' },
  'autonomous.flow_picked': { en: 'picked', tr: 'seçildi' },
  'autonomous.flow_jit_detail': { en: 'JIT detail', tr: 'JIT detay' },
  'autonomous.flow_spawned': { en: 'spawned', tr: 'başlatıldı' },
  'autonomous.flow_brain_verdict': { en: 'Brain', tr: 'Brain' },
  'autonomous.flow_audit_verdict': { en: 'Auditor', tr: 'Denetçi' },
  'autonomous.flow_cross_verify': { en: 'Cross-verify', tr: 'Çapraz-doğrulama' },
  'autonomous.flow_done': { en: 'done', tr: 'tamam' },
  'autonomous.flow_failed': { en: 'failed', tr: 'başarısız' },
  'autonomous.flow_parked': { en: 'parked', tr: 'beklemede' },
```

- [ ] **Step 4: Create the module**

```typescript
// src/orchestra/autonomous/flow-reporter.ts
// Component ④ — rich dual-channel flow emitter for the autonomous orchestration path.
// Channel 1 (print): human-readable terminal debug line per step (i18n label + icon).
// Channel 2 (audit): structured FlowStepRecord for AI operators (stable English keys,
// no emoji) — wired by the composition root to the ENT-3 audit hash-chain / event stream.
// Pure + injected → hermetic; both channels optional (a missing channel is a no-op).
import { getMessage } from '../../cli/helpers/messages.js';

export type FlowStep =
  | 'picked' | 'jit_detail' | 'spawned'
  | 'brain_verdict' | 'audit_verdict' | 'cross_verify'
  | 'done' | 'failed' | 'parked';

/** Machine record (channel 2). Keys are stable English — never localized, never emoji. */
export interface FlowStepRecord {
  step: FlowStep;
  entryId: string;
  detail: string;
  timestamp: string;
}

export interface FlowReporterDeps {
  /** Channel 1 — human terminal sink. Absent → no terminal output. */
  print?: (line: string) => void;
  /** Channel 2 — AI-consumable sink. Absent → no machine record. */
  audit?: (record: FlowStepRecord) => void;
  /** UI language for channel-1 labels (en/tr). Default 'en'. */
  lang?: string;
  /** Injected clock for hermetic tests. Default = real ISO timestamp. */
  now?: () => string;
}

export interface FlowReporter {
  step(step: FlowStep, entryId: string, detail?: string): void;
}

/** Terminal-only unicode markers (channel 1). Dashboard surfaces use lucide icons — this
 *  map is never rendered there; channel-2 records carry no icon. */
const ICONS: Record<FlowStep, string> = {
  picked: '▶', jit_detail: '✎', spawned: '⚙',
  brain_verdict: '🧠', audit_verdict: '🛡', cross_verify: '🔀',
  done: '✓', failed: '✗', parked: '⏸',
};

export function makeFlowReporter(deps: FlowReporterDeps = {}): FlowReporter {
  const lang = deps.lang ?? 'en';
  const now = deps.now ?? (() => new Date().toISOString());
  return {
    step(step: FlowStep, entryId: string, detail = ''): void {
      const timestamp = now();
      if (deps.audit) deps.audit({ step, entryId, detail, timestamp });
      if (deps.print) {
        const label = getMessage(`autonomous.flow_${step}`, lang);
        deps.print(getMessage('autonomous.flow_line', lang, {
          icon: ICONS[step], label, entryId, detail,
        }));
      }
    },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/orchestra/autonomous/flow-reporter.test.ts`
Expected: PASS (3/3). Run `npx tsc --noEmit` — clean.

- [ ] **Step 6: Commit**

```bash
git add src/orchestra/autonomous/flow-reporter.ts src/cli/helpers/messages.ts tests/orchestra/autonomous/flow-reporter.test.ts
git commit -m "feat(autonomous): Component 4 — dual-channel Flow-Reporter (i18n terminal + AI JSONL)"
```

---

## Task 7: Wire eval+audit+cross-verify+flow into the execute-dispatcher task branch

**Files:**
- Modify: `src/orchestra/autonomous/execute-dispatcher.ts`
- Modify: `tests/orchestra/autonomous/execute-dispatcher-jit.test.ts` (inject eval stubs into the 2 task-branch tests)
- Test: `tests/orchestra/autonomous/execute-dispatcher-eval.test.ts` (new — real pipeline + rich persistence + flow)

After `waitForResult` (+ grace re-poll), when a `result` is present, run Brain-Eval → Auditor → Cross-Verify, set `ok` from the Brain decision, persist the rich `lastResult`, and fire flow steps. All three kernels are injectable (default = real adapters) so the dispatcher's own tests stay hermetic.

- [ ] **Step 1: Write the failing test (new file)**

```typescript
// tests/orchestra/autonomous/execute-dispatcher-eval.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeExecuteDispatcher, AUTONOMOUS_EXECUTE_ACTION } from '../../../src/orchestra/autonomous/execute-dispatcher.js';
import type { BacklogEntry } from '../../../src/orchestra/autonomous/backlog-types.js';
import type { FlowStepRecord } from '../../../src/orchestra/autonomous/flow-reporter.js';
import { makeFlowReporter } from '../../../src/orchestra/autonomous/flow-reporter.js';

let dir: string | undefined;
afterEach(() => { if (dir) { rmSync(dir, { recursive: true, force: true }); dir = undefined; } });

const entry: BacklogEntry = {
  id: 'roles', title: 'Roles', kind: 'task', spec: { scopeDir: 'src/api/' }, policy: 'auto',
  trigger: { type: 'one-off' }, status: 'pending', lastRun: null, lastResult: null,
};

function setup(): string {
  dir = mkdtempSync(join(tmpdir(), 'disp-eval-'));
  mkdirSync(join(dir, '.deckent', 'autonomous'), { recursive: true });
  const p = join(dir, '.deckent', 'autonomous', 'backlog.json');
  writeFileSync(p, JSON.stringify({ _version: '1.0', entries: [entry] }), 'utf-8');
  return p;
}

describe('execute-dispatcher — Brain+Auditor+CrossVerify wire', () => {
  it('drives the Brain verdict into the rich lastResult and fires ordered flow steps', async () => {
    const backlogPath = setup();
    const records: FlowStepRecord[] = [];
    const handler = makeExecuteDispatcher({
      projectRoot: dir!, config: {} as any, backlogPath,
      runTask: async () => ({ taskId: 'run-1' }),
      runSprint: async () => ({}),
      waitForResult: async () => ({ taskId: 'run-1', selfAssessment: 'NO_GO' } as any),
      evaluate: () => ({ decision: 'GO_WITH_TECH_DEBT', quality: 78, reconciled: true, reason: 'low coverage' }),
      audit: async () => ({ boundary: 'clean', adr: 'ok', functional: 'pass' }),
      crossVerify: async () => ({ ran: true, verdict: 'confirmed' }),
      flow: makeFlowReporter({ audit: (r) => records.push(r), now: () => 'T' }),
    });

    const res = await handler(AUTONOMOUS_EXECUTE_ACTION, { entry });
    expect(res.outcome).toBe('success');               // GO_WITH_TECH_DEBT is not NO_GO

    const saved = JSON.parse(readFileSync(backlogPath, 'utf-8')).entries[0];
    expect(saved.status).toBe('done');
    expect(saved.lastResult.decision).toBe('GO_WITH_TECH_DEBT');
    expect(saved.lastResult.reconciled).toBe(true);
    expect(saved.lastResult.quality).toBe(78);
    expect(saved.lastResult.audit).toEqual({ boundary: 'clean', adr: 'ok', functional: 'pass' });
    expect(saved.lastResult.crossVerify).toEqual({ ran: true, verdict: 'confirmed' });

    expect(records.map((r) => r.step)).toEqual(
      ['spawned', 'brain_verdict', 'audit_verdict', 'cross_verify', 'done'],
    );
  });

  it('a Brain NO_GO marks the entry failed', async () => {
    const backlogPath = setup();
    const handler = makeExecuteDispatcher({
      projectRoot: dir!, config: {} as any, backlogPath,
      runTask: async () => ({ taskId: 'run-1' }),
      runSprint: async () => ({}),
      waitForResult: async () => ({ taskId: 'run-1', selfAssessment: 'NO_GO' } as any),
      evaluate: () => ({ decision: 'NO_GO', quality: 10, reconciled: false, reason: 'tests failed' }),
      audit: async () => ({ boundary: 'clean', adr: 'ok', functional: 'fail' }),
      crossVerify: async () => ({ ran: false }),
    });
    const res = await handler(AUTONOMOUS_EXECUTE_ACTION, { entry });
    expect(res.outcome).toBe('failure');
    expect(JSON.parse(readFileSync(backlogPath, 'utf-8')).entries[0].status).toBe('failed');
  });

  it('an out-of-scope boundary violation stays advisory (still done on a GO decision)', async () => {
    const backlogPath = setup();
    const handler = makeExecuteDispatcher({
      projectRoot: dir!, config: {} as any, backlogPath,
      runTask: async () => ({ taskId: 'run-1' }),
      runSprint: async () => ({}),
      waitForResult: async () => ({ taskId: 'run-1', selfAssessment: 'DONE' } as any),
      evaluate: () => ({ decision: 'DONE', quality: 95, reconciled: false, reason: 'ok' }),
      audit: async () => ({ boundary: [{ type: 'file_outside_scope', agentId: 'w', detail: 'File outside scope: x.ts', timestamp: 'T' }], adr: 'ok', functional: 'pass' }),
      crossVerify: async () => ({ ran: false }),
    });
    const res = await handler(AUTONOMOUS_EXECUTE_ACTION, { entry });
    expect(res.outcome).toBe('success');               // advisory — does NOT flip the decision
    const saved = JSON.parse(readFileSync(backlogPath, 'utf-8')).entries[0];
    expect(saved.status).toBe('done');
    expect(saved.lastResult.audit.boundary).toEqual(['File outside scope: x.ts']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orchestra/autonomous/execute-dispatcher-eval.test.ts`
Expected: FAIL — `makeExecuteDispatcher` does not accept `evaluate`/`audit`/`crossVerify`/`flow` deps; rich `lastResult` not persisted; flow records empty.

- [ ] **Step 3: Add imports + deps to `execute-dispatcher.ts`**

After the existing import block (after line 21, the `LlmComplete` import), add:

```typescript
import {
  evaluateBacklogResult, auditBacklogResult, crossVerifyBacklogResult,
  type BacklogEvaluation, type AuditVerdict, type CrossVerifyVerdict,
} from './backlog-eval.js';
import type { FlowReporter } from './flow-reporter.js';
```

In `ExecuteDispatcherDeps`, after the `jitComplete?` field (line 74), add:

```typescript
  /**
   * CORE-UNIFORMITY (slice 1): Brain-Eval / Auditor / Cross-Verify hooks. Default to the
   * real mode-independent kernels (backlog-eval.ts); injected as deterministic stubs in
   * hermetic dispatcher tests. A finished task is evaluated by the SAME core sprint mode uses.
   */
  evaluate?: (entry: BacklogEntry, result: TaskResult, projectRoot: string) => BacklogEvaluation;
  audit?: (entry: BacklogEntry, result: TaskResult, projectRoot: string) => Promise<AuditVerdict>;
  crossVerify?: (
    entry: BacklogEntry, result: TaskResult, projectRoot: string,
    config: ResolvedConfig, evaluation: BacklogEvaluation,
  ) => Promise<CrossVerifyVerdict>;
  /** Rich dual-channel flow emitter (human terminal + AI JSONL). Absent → no flow. */
  flow?: FlowReporter;
```

- [ ] **Step 4: Remove the now-dead `isSuccess` helper**

Delete the `isSuccess` function (lines 77-82) — the task branch no longer uses `selfAssessment`-only success; the Brain decision replaces it. (Removing it keeps `tsc` clean of an unused symbol.)

Delete:

```typescript
/** Determine whether a TaskResult represents success (mirrors run.ts:320). */
function isSuccess(result: TaskResult | null): boolean {
  if (!result) return false;
  const a = result.selfAssessment ?? 'NO_GO';
  return a === 'DONE' || a === 'GO_WITH_TECH_DEBT';
}
```

- [ ] **Step 5: Add a `richResult` accumulator + JIT-detail flow step**

In the `job` function, change the success-state declarations (lines 114-115) from:

```typescript
        let ok = false;
        let reason = '';
```

to:

```typescript
        let ok = false;
        let reason = '';
        // Rich Brain+Auditor+CrossVerify verdict (task branch only). null → fall back to
        // the plain { ok, reason } for sprint/capability/process branches.
        let richResult: BacklogEntry['lastResult'] = null;
```

In the JIT block, after the `saveBacklogFile(deps.backlogPath, blJit);` line (line 109), add a flow step inside the `if (idx >= 0)`:

```typescript
          if (idx >= 0) {
            blJit.entries[idx] = { ...blJit.entries[idx]!, spec: live.spec };
            saveBacklogFile(deps.backlogPath, blJit);
            deps.flow?.step('jit_detail', entry.id, `detail generated (${(live.spec.description ?? '').length} chars)`);
          }
```

- [ ] **Step 6: Rewire the task branch result handling**

Replace the task-branch block that currently reads (lines 166-187, from `const taskId = r?.taskId;` through the `else { ok = false; reason = 'runTask returned no taskId ...' }`):

```typescript
          const taskId = r?.taskId;
          if (taskId) {
            // Gap F: wait for real done/failed (not just launched)
            let result = await deps.waitForResult(deps.projectRoot, taskId, timeoutMs);
            if (!result) {
              // false-FAILURE fix: a real worker (docker + JIT detail + verify) can
              // write its .result seconds after the window closes — observed 9s past
              // a 600s timeout (2026-06-17 dogfood). Disk-verify outranks the timeout,
              // so grace re-poll once for a late result before declaring failure
              // (the Spurious-NO_GO reconciliation pattern, applied to the autonomous task path).
              result = await deps.waitForResult(deps.projectRoot, taskId, GRACE_RESULT_MS);
            }
            ok = isSuccess(result);
            reason = result
              ? `selfAssessment=${result.selfAssessment ?? 'NO_GO'}`
              : 'timeout — no result within limit (incl. grace re-poll)';
          } else {
            // runTask returned no taskId — cannot track completion; treat as failure
            // to avoid false-done (the "wiring-% vs user-working" trap).
            ok = false;
            reason = 'runTask returned no taskId — completion not trackable';
          }
```

with:

```typescript
          const taskId = r?.taskId;
          if (taskId) {
            deps.flow?.step('spawned', entry.id, `taskId=${taskId}`);
            // Gap F: wait for real done/failed (not just launched)
            let result = await deps.waitForResult(deps.projectRoot, taskId, timeoutMs);
            if (!result) {
              // false-FAILURE fix: a real worker can write its .result seconds after the
              // window closes — observed 9s past a 600s timeout (2026-06-17 dogfood).
              // Grace re-poll once before failing (disk-verify outranks the timeout).
              result = await deps.waitForResult(deps.projectRoot, taskId, GRACE_RESULT_MS);
            }

            if (result) {
              // CORE-UNIFORMITY: a finished autonomous task passes through the SAME
              // Brain-Eval + Auditor + Cross-Verify sprint mode applies (mode-independent
              // kernels). The Auditor + cross-verify verdicts are ADVISORY (never flip the
              // Brain decision, per ADR-037 V1.0); the rich verdict is persisted + flow-reported.
              const evaluate = deps.evaluate ?? evaluateBacklogResult;
              const audit = deps.audit ?? auditBacklogResult;
              const crossVerify = deps.crossVerify ?? crossVerifyBacklogResult;

              const evaluation = evaluate(live, result, deps.projectRoot);
              deps.flow?.step('brain_verdict', entry.id,
                `${evaluation.decision} q=${evaluation.quality}${evaluation.reconciled ? ' (reconciled)' : ''}`);

              const verdict = await audit(live, result, deps.projectRoot);
              const boundaryNote = verdict.boundary === 'clean' ? 'clean' : `${verdict.boundary.length} violation(s)`;
              const adrNote = verdict.adr === 'ok' ? 'ok' : `${verdict.adr.length} issue(s)`;
              deps.flow?.step('audit_verdict', entry.id, `boundary ${boundaryNote} · ADR ${adrNote} · fn ${verdict.functional}`);

              const xv = await crossVerify(live, result, deps.projectRoot, deps.config, evaluation);
              deps.flow?.step('cross_verify', entry.id, xv.ran ? `verdict=${xv.verdict}` : 'skipped (no 2nd provider / disabled)');

              ok = evaluation.decision !== 'NO_GO';
              reason = evaluation.reason || `decision=${evaluation.decision}`;
              richResult = {
                ok,
                reason,
                decision: evaluation.decision,
                reconciled: evaluation.reconciled,
                quality: evaluation.quality,
                audit: {
                  boundary: verdict.boundary === 'clean' ? 'clean' : verdict.boundary.map((v) => v.detail),
                  adr: verdict.adr === 'ok' ? 'ok' : verdict.adr.map((v) => `${v.adrId}: ${v.violation}`),
                  functional: verdict.functional,
                },
                crossVerify: { ran: xv.ran, ...(xv.verdict ? { verdict: xv.verdict } : {}) },
              };
            } else {
              ok = false;
              reason = 'timeout — no result within limit (incl. grace re-poll)';
            }
          } else {
            // runTask returned no taskId — cannot track completion; treat as failure
            // to avoid false-done (the "wiring-% vs user-working" trap).
            ok = false;
            reason = 'runTask returned no taskId — completion not trackable';
          }
```

- [ ] **Step 7: Persist the rich verdict + emit the terminal flow step**

Replace the final writeback (lines 190-194) from:

```typescript
        // Gap B — final writeback (re-load to avoid clobbering concurrent changes)
        const blFinal: BacklogFile = loadBacklog(deps.backlogPath);
        updateStatus(deps.backlogPath, blFinal, entry.id, ok ? 'done' : 'failed', { ok, reason });

        return ok ? { outcome: 'success' } : { outcome: 'failure', error: reason };
```

with:

```typescript
        // Gap B — final writeback (re-load to avoid clobbering concurrent changes).
        // Task branch carries the rich Brain+Auditor+CrossVerify verdict; other kinds
        // keep the plain { ok, reason } (sprint already evaluates + cross-verifies).
        const blFinal: BacklogFile = loadBacklog(deps.backlogPath);
        updateStatus(deps.backlogPath, blFinal, entry.id, ok ? 'done' : 'failed', richResult ?? { ok, reason });
        deps.flow?.step(ok ? 'done' : 'failed', entry.id, reason);

        return ok ? { outcome: 'success' } : { outcome: 'failure', error: reason };
```

- [ ] **Step 8: Update the 2 pre-existing task-branch tests in `execute-dispatcher-jit.test.ts`**

Those tests use minimal `{ taskId, selfAssessment }` results that the real `evaluateWithRubric` schema-rejects. They test JIT-detail + grace-repoll, NOT evaluation, so inject a deterministic `evaluate` stub (and `crossVerify` honest-skip) to isolate them.

In `tests/orchestra/autonomous/execute-dispatcher-jit.test.ts`, in the FIRST test (`generates + persists the description before running a planned task`), add these two deps to the `makeExecuteDispatcher({...})` call (alongside `jitComplete`):

```typescript
      evaluate: () => ({ decision: 'DONE', quality: 100, reconciled: false, reason: 'ok' }),
      crossVerify: async () => ({ ran: false }),
```

In the SECOND test (`reconciles a late result after the initial waitForResult timeout (false-FAILURE fix)`), add the same two deps to its `makeExecuteDispatcher({...})` call:

```typescript
      evaluate: () => ({ decision: 'DONE', quality: 100, reconciled: false, reason: 'ok' }),
      crossVerify: async () => ({ ran: false }),
```

(The third test — `fails a process entry` — is unaffected; the process branch does not evaluate.)

- [ ] **Step 9: Run both dispatcher test files to verify they pass**

Run: `npx vitest run tests/orchestra/autonomous/execute-dispatcher-eval.test.ts tests/orchestra/autonomous/execute-dispatcher-jit.test.ts`
Expected: PASS (all — 3 new eval tests + the 3 jit tests). Run `npx tsc --noEmit` — clean (no unused `isSuccess`).

- [ ] **Step 10: Commit**

```bash
git add src/orchestra/autonomous/execute-dispatcher.ts tests/orchestra/autonomous/execute-dispatcher-eval.test.ts tests/orchestra/autonomous/execute-dispatcher-jit.test.ts
git commit -m "feat(autonomous): wire Brain+Auditor+CrossVerify+Flow into execute-dispatcher task branch"
```

---

## Task 8: Forward the flow-reporter through the runtime-loop + live-wire the autonomous command

**Files:**
- Modify: `src/orchestra/autonomous/runtime-loop.ts` (`BuildEngineRuntimeOptions` + `makeExecuteDispatcher` call)
- Modify: `src/cli/commands/autonomous.ts` (`makeAutonomousFlowReporter` + `handleStart` wire)
- Test: `tests/cli/autonomous-flow-wire.test.ts` (new)

Forward an optional `flow` from `buildEngineRuntime` into the dispatcher, and in the live `autonomous start` build a real `FlowReporter` whose channel-2 sink writes to the ENT-3 audit hash-chain (`writeAuditEvent`). This makes the autonomous terminal show the live debug flow and lets an AI operator collect it as JSONL.

- [ ] **Step 1: Write the failing test (new file)**

```typescript
// tests/cli/autonomous-flow-wire.test.ts
import { describe, it, expect } from 'vitest';
import { makeAutonomousFlowReporter } from '../../src/cli/commands/autonomous.js';
import type { FlowStepRecord } from '../../src/orchestra/autonomous/flow-reporter.js';

describe('makeAutonomousFlowReporter (live autonomous flow wire)', () => {
  it('routes a step to both the print sink and the audit sink', () => {
    const lines: string[] = [];
    const records: FlowStepRecord[] = [];
    const flow = makeAutonomousFlowReporter('/tmp/does-not-matter', 'en', {
      print: (l) => lines.push(l),
      audit: (r) => records.push(r),
      now: () => 'T',
    });

    flow.step('brain_verdict', 'roles', 'DONE q=95');

    expect(records).toHaveLength(1);
    expect(records[0].step).toBe('brain_verdict');
    expect(records[0].entryId).toBe('roles');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('roles');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli/autonomous-flow-wire.test.ts`
Expected: FAIL — `makeAutonomousFlowReporter` is not exported from `autonomous.js`.

- [ ] **Step 3: Forward `flow` through the runtime-loop**

In `src/orchestra/autonomous/runtime-loop.ts`, add the import near the other autonomous imports (after the `makeExecuteDispatcher` import at line 50):

```typescript
import type { FlowReporter } from './flow-reporter.js';
```

In `BuildEngineRuntimeOptions`, after the `jitComplete?` field (line 156), add:

```typescript
  /**
   * CORE-UNIFORMITY (slice 1): rich dual-channel flow emitter forwarded to the
   * execute-dispatcher so the autonomous terminal shows the live Brain+Auditor+
   * CrossVerify flow (and an AI operator collects it as JSONL). Absent → no flow.
   */
  flow?: FlowReporter;
```

In the `makeExecuteDispatcher({...})` call (lines 225-235), add `flow: opts.flow,` after `jitComplete: opts.jitComplete,`:

```typescript
    makeExecuteDispatcher({
      projectRoot: opts.projectRoot,
      config: opts.config,
      runTask: opts.runTask,
      runSprint: opts.runSprint,
      backlogPath: opts.backlogPath,
      waitForResult: opts.waitForResult,
      resultTimeoutMs: opts.resultTimeoutMs,
      jitComplete: opts.jitComplete,
      flow: opts.flow,
      capabilityRegistry,
    }),
```

- [ ] **Step 4: Add `makeAutonomousFlowReporter` to `autonomous.ts`**

First confirm the imports exist at the top of `src/cli/commands/autonomous.ts`. Add if missing:

```typescript
import { makeFlowReporter, type FlowReporter, type FlowStepRecord } from '../../orchestra/autonomous/flow-reporter.js';
import { writeAuditEvent } from '../../core/audit-writer.js';
```

Then add this exported factory near `makeTickReporter` (after line 714):

```typescript
export interface AutonomousFlowDeps {
  print?: (line: string) => void;
  audit?: (record: FlowStepRecord) => void;
  now?: () => string;
}

/**
 * Build the live autonomous FlowReporter. Channel 1 = the CLI print helper (human
 * terminal debug flow). Channel 2 = the ENT-3 audit hash-chain (writeAuditEvent), so an
 * AI operator collects the full orchestration flow as durable JSONL. Sinks are injectable
 * for hermetic tests; defaults wire the real surfaces.
 */
export function makeAutonomousFlowReporter(
  root: string,
  lang: string,
  deps: AutonomousFlowDeps = {},
): FlowReporter {
  const auditSink = deps.audit ?? ((record: FlowStepRecord): void => {
    writeAuditEvent(root, 'autonomous', {
      tenantId: 'local',
      actor: 'system',
      action: `flow.${record.step}`,
      target: record.entryId,
      metadata: { detail: record.detail, timestamp: record.timestamp },
    });
  });
  return makeFlowReporter({
    print: deps.print ?? print,
    audit: auditSink,
    lang,
    ...(deps.now ? { now: deps.now } : {}),
  });
}
```

- [ ] **Step 5: Wire the reporter into `handleStart`**

In `src/cli/commands/autonomous.ts`, the `const { deps } = buildEngineRuntime({...})` call inside `handleStart` is at line 394, and `root` (line 235) + `lang` (line 234) are already in scope. Add `flow: makeAutonomousFlowReporter(root, lang),` as the last option, right after the existing `jitComplete: realPlannerComplete('sonnet'),` line (line 417):

```typescript
    // Task 8: goal-planner Phase 2 — dispatched `planned` entries get JIT detail
    // generated by the real provider before they run (title-only fallback on failure).
    jitComplete: realPlannerComplete('sonnet'),
    // CORE-UNIFORMITY (slice 1): live Brain+Auditor+CrossVerify flow on the autonomous
    // terminal (channel 1) + ENT-3 audit JSONL for AI operators (channel 2).
    flow: makeAutonomousFlowReporter(root, lang),
  });
```

- [ ] **Step 6: Run the wire test + typecheck**

Run: `npx vitest run tests/cli/autonomous-flow-wire.test.ts`
Expected: PASS (1/1). Run `npx tsc --noEmit` — clean.

- [ ] **Step 7: Run the full autonomous + dispatcher + cross-verify suites (regression)**

Run: `npx vitest run tests/orchestra/autonomous/ tests/cli/autonomous-command.test.ts tests/cli/autonomous-flow-wire.test.ts tests/monitor/auditor-scope-export.test.ts`
Expected: PASS (all — no regression in the existing autonomous/dispatcher tests).

- [ ] **Step 8: Commit**

```bash
git add src/orchestra/autonomous/runtime-loop.ts src/cli/commands/autonomous.ts tests/cli/autonomous-flow-wire.test.ts
git commit -m "feat(autonomous): forward Flow-Reporter through runtime-loop + live-wire autonomous start"
```

- [ ] **Step 9: Live proof-of-function (Tier-1 — run-proven, after a build)**

This slice changes the live autonomous surface, so close it with a real-binary run (a unit test alone is GO_WITH_TECH_DEBT for a user-surface change). After `npm run build:all` + `/mcp restart` (USER runs these — build is forbidden mid-sprint and the MCP cache must be cleared):

```
Smoke: deckent autonomous plan "src/cli'ye küçük bir --help satırı ekle" --dry-run   # plan still works
       deckent autonomous enable && deckent autonomous backlog add --kind task --policy auto --scopeDir src/cli/ "stale-comment süpür"
       deckent autonomous start
  → terminal shows the live flow: "⚙ spawned [..]" → "🧠 Brain: GO_WITH_TECH_DEBT ..." →
    "🛡 Auditor: boundary clean · ADR ok · fn pass" → "🔀 Cross-verify: skipped (no 2nd provider / disabled)" → "✓ done"
  → backlog entry lastResult carries decision + reconciled + quality + audit + crossVerify
    (verify: deckent autonomous backlog list, or inspect .deckent/autonomous/backlog.json)
```

Record the observed terminal flow + the persisted `lastResult` in the task notes. If the flow does not appear or `lastResult` lacks the rich fields, the task is GO_WITH_TECH_DEBT (not DONE) — diagnose before closing.

---

## Final verification (after all tasks)

- [ ] `npx tsc --noEmit` — clean.
- [ ] `npx vitest run tests/orchestra/autonomous/ tests/monitor/auditor-scope-export.test.ts tests/cli/autonomous-flow-wire.test.ts tests/cli/autonomous-command.test.ts` — all green.
- [ ] `npm run test:ci-sim` (hermetic reproducer — fresh-checkout assumption) on the new test files — green.
- [ ] Dual-perspective confirmed: the kernels are project-agnostic (a USER/ENTERPRISE running `deckent autonomous` gets the same Brain + Auditor + cross-provider trust + flow) AND deckent's own dogfood autonomous runs gain core uniformity.
- [ ] Cross-check honored: Component ③ wired + honest-skips visibly when no 2nd provider (never a silent pass).

---

## Notes for the implementer

- **ESM:** every relative import MUST end in `.js` (Node16 resolution) — even for `.ts` source.
- **Hermetic tests:** all file I/O under `os.tmpdir()` + cleaned in `afterEach`; never read `.deckent/config.json` or `.brain/memory.db` (gitignored — absent in CI). The real `evaluateWithRubric`/`checkADRCompliance` are hermetic against a nonexistent/tmp `projectRoot` (no `.brain/memory.db` → no ADR rules → `adr:'ok'`); the heavy `verifyWorkerResult` is injected in unit tests.
- **Advisory discipline (ADR-037 V1.0):** the Auditor + cross-verify verdicts are recorded + surfaced but NEVER flip the Brain decision or block. Only `evaluation.decision === 'NO_GO'` fails a task. A boundary violation or `refuted` cross-verify on an otherwise-GO task stays `done`, flagged in the flow + `lastResult` for human/AI review.
- **Reuse, don't reinvent:** no new evaluation/audit/verification logic — every adapter delegates to the existing sprint-mode function. If you find yourself writing scoring/reconciliation/git-diff logic, stop: it already exists in the anchor.
- **Scope boundaries (separate spec→plan cycles, NOT this slice):** the Lifecycle kernel (retro/decay/cleanup + per-item `.tasks/` hygiene between autonomous items), the modularization layers (core/base/ext/cust), and hard Auditor enforcement (ADR-037 V2). Do not pull these in.
```

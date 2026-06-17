# Brain-Eval + Auditor + Flow-Reporter Kernel — Design Spec

- **Date:** 2026-06-17
- **Status:** Approved (brainstorming) — ready for implementation plan
- **Arc:** CORE-UNIFORMITY, first slice (see memory `project_autonomous_first_dogfood_grand_vision`)
- **Author:** Alperen + CC (Opus 4.8)

## 1. Context & Motivation

deckent's core orchestration functions — Brain evaluation, Auditor verification, and the
lifecycle (retro/decay/cleanup) — only run in the full **sprint** lifecycle (`sprint-controller`).
The **autonomous task path** (`execute-dispatcher`, kind=task) bypasses them: it judges a finished
worker with a raw `isSuccess(result)` selfAssessment check and nothing else.

The 2026-06-17 live dogfood exposed the cost: an autonomous task wrote a valid `DONE` result ~9s
after its `waitForResult` window closed, and the orchestrator marked it `failed` (a synthetic
failure) because no Brain evaluation / reconciliation ran on the autonomous path. A grace re-poll
patched that one symptom, but the real gap is structural: **deckent's core features must run
uniformly no matter which mode (task / sprint / process) is triggered, from wherever (flow / start /
autonomous).**

Two product principles frame this work:
- **AI-operated, human-informed.** The thing that actually drives this tool is an AI (an LLM, or a
  more advanced model) running deckent as an agentic OS. The human is informed, asked for approval,
  or kept up to date in the autonomous flow. Outputs serve both: a human reading the terminal AND an
  AI collecting flow data.
- **Modularization is the destination.** Once every feature is functional + wired + parametric,
  deckent splits into layers (core / base / ext / cust → deckent-hub). A clean, mode-independent
  core kernel is the prerequisite — you cannot modularize a core that is tangled into one lifecycle.

This spec is the **first slice** of CORE-UNIFORMITY: wire the (already-existing) Brain-Eval and
Auditor logic into the autonomous task path as reusable, mode-independent kernels, and add a rich
dual-channel Flow-Reporter. The remaining slices (Lifecycle kernel: retro/decay/cleanup/.tasks
hygiene; the modularization layers) are separate spec→plan cycles (§10).

## 2. Goal & Non-Goals

**Goal:** Make a finished autonomous task pass through the same core evaluation + audit that sprint
mode already applies — via reusable kernels callable from any trigger path — and emit a rich,
debug-style flow (human terminal + AI-consumable JSONL) of every orchestration step.

**Non-Goals (this slice):**
- The Lifecycle kernel (retro / decay / cleanup / per-item `.tasks/` hygiene). Separate slice.
- The modularization layer split (core/base/ext/cust). Later phase.
- Changing sprint mode's evaluation/audit — it already calls these functions; we reuse them, we do
  not refactor the sprint path.
- Hard-enforcing Auditor verdicts (boundary/ADR violations stay **advisory**, per ADR-037 V1.0 —
  they surface in the verdict + flow, they do not block).

## 3. Architecture — two kernels + a flow-reporter, all mode-independent

```
execute-dispatcher (autonomous, kind=task)        sprint-controller (EVALUATE) — already calls evaluateResult
   │  after waitForResult (+ grace re-poll)
   ▼
   ① Brain-Eval kernel   = evaluateResult(result, task, …, projectRoot)   [EXISTS — result-evaluator.ts]
   │     via evaluateBacklogResult(entry, result, projectRoot) adapter
   │     → TaskEvaluation { decision: GO|NO_GO|GO_WITH_TECH_DEBT, reconciled, rubricScores, reason }
   ▼
   ② Auditor kernel      = checkBoundaryViolations + checkADRCompliance + verifyWorkerResult  [EXIST — monitor/auditor.ts]
   │     via auditBacklogResult(entry, result, projectRoot)
   │     → AuditVerdict { boundary: clean|violation[], adr: ok|issues, functional: pass|fail }  (advisory)
   ▼
   ③ Flow-Reporter       = structured step emitter
         ├─ channel 1: terminal (human-readable debug flow)
         └─ channel 2: JSONL audit-event / event-stream (AI-consumable data)
   ▼
   persist rich verdict → backlog.lastResult { ok, reason, decision, reconciled, quality, audit }
```

Both kernels already exist and are mode-independent; this slice **wires** them into the autonomous
task path (the gap) and adds the flow-reporter. Sprint already runs them, so uniformity holds by
construction — the kernels are the single source for both paths.

## 4. Component ① — Brain-Eval kernel + adapter

- **Kernel (reuse, unchanged):** `evaluateResult(result, task, vitestJsonOutput?, coverageThreshold=90, projectRoot?): TaskEvaluation` in `result-evaluator.ts`. It already does spurious-NO_GO reconciliation (`reconcileSpuriousNoGo`, disk-verify), TIMEOUT_WITH_WORK handling, rubric quality scoring, and the GO/NO_GO/GO_WITH_TECH_DEBT decision.
- **New adapter:** `evaluateBacklogResult(entry: BacklogEntry, result: TaskResult, projectRoot: string): TaskEvaluation` (new module `src/orchestra/autonomous/backlog-eval.ts`). Builds a minimal `Task` from the entry:
  - `id` = `result.taskId` (the run-id) || `entry.id`
  - `description` = `entry.spec.description` (JIT detail) ?? `entry.summary` ?? `entry.title`
  - `scope` = `{ directories: [entry.spec.scopeDir ?? '.'], filesRead: [], filesWrite: [] }`
  - `goNogo` = `{ goCriteria: entry.summary ?? entry.title, noGoCriteria: '', techDebtAcceptable: '' }` (the planner emits no explicit goNogo; the decision is driven by selfAssessment + reconciliation + disk-verify, not goNogo text)
  - `provider`/`model` from `entry`/`result`
  Then calls `evaluateResult(result, task, undefined, /*coverage*/ 90, projectRoot)` and returns the `TaskEvaluation`.
- **Why reconciliation matters:** a worker that self-reported NO_GO/TIMEOUT but whose git diff shows real work is reconciled to GO_WITH_TECH_DEBT — "Brain understands the worker correctly." This subsumes the grace re-poll's intent properly (the grace re-poll catches the late *write*; reconciliation catches the wrong *self-report*; both are kept and complementary).

## 5. Component ② — Auditor kernel (post-execution, advisory)

- **Reuse (unchanged):** `checkBoundaryViolations` (detects `file_outside_scope`), `checkADRCompliance`, `verifyWorkerResult` in `monitor/auditor.ts`.
- **New adapter:** `auditBacklogResult(entry: BacklogEntry, result: TaskResult, projectRoot: string): AuditVerdict` — lives in the SAME new module `src/orchestra/autonomous/backlog-eval.ts` alongside `evaluateBacklogResult` (both are thin entry→kernel adapters; one focused module). Runs:
  - **boundary** — are `result.filesChanged` within `entry.spec.scopeDir`? Reuse `checkBoundaryViolations` against the entry's scope. Out-of-scope writes → `violation[]`.
  - **adr** — `checkADRCompliance` on the result/task.
  - **functional** — `verifyWorkerResult` (when applicable; async).
  Returns `AuditVerdict { boundary: 'clean' | BoundaryViolation[], adr: 'ok' | string[], functional: 'pass' | 'fail' | 'skipped' }`.
- **Advisory only** (ADR-037 V1.0): the audit verdict is recorded + surfaced in the flow, but does NOT flip the Brain decision or block dispatch. A boundary violation on an otherwise-GO task stays GO with the violation noted (the human/AI sees it).

## 6. Component ③ — Flow-Reporter (rich debug flow, dual-channel)

A structured step emitter `makeFlowReporter({ print, audit, projectRoot })` producing one event per
orchestration step, on two channels:
- **Channel 1 — terminal (human):** a readable debug line per step, e.g.
  `▶ picked add-cli-version-flag (task/auto)` · `✎ JIT detail generated (480 chars)` ·
  `⚙ worker spawned (docker)` · `🧠 Brain: GO_WITH_TECH_DEBT (reconciled from NO_GO, quality 78)` ·
  `🛡 Auditor: boundary clean · ADR ok` · `✓ done → next: sweep-stale-comments`.
- **Channel 2 — JSONL / event-stream (AI-data):** each step also written as a structured record via
  `writeAuditEvent` (the ENT-3 hash-chain) and/or the autonomous event stream the dashboard already
  tails (`/api/events`), so an AI operator can collect the full flow as training/observability data.

Step vocabulary (one `FlowStep` type): `picked`, `jit_detail`, `spawned`, `brain_verdict`,
`audit_verdict`, `done`, `failed`, `parked`. The emitter is injected into the execute-dispatcher (and
fed from the loop's `onTick` for pick/park) so the autonomous terminal shows the live flow instead of
the current near-silence. i18n: human-facing step labels go through `getMessage` (en/tr); the JSONL
keys are stable machine identifiers (English, not localized).

## 7. Persistence — rich verdict on the backlog

`BacklogEntry.lastResult` (currently `{ ok, reason }`) is extended additively to carry the Brain +
Auditor verdict:

```ts
lastResult: {
  ok: boolean;
  reason: string;
  decision?: 'GO' | 'NO_GO' | 'GO_WITH_TECH_DEBT';   // Brain
  reconciled?: boolean;                               // was self-report overridden by disk-verify
  quality?: number;                                   // rubric/quality score
  audit?: { boundary: 'clean' | string[]; adr: 'ok' | string[]; functional: 'pass' | 'fail' | 'skipped' };
} | null
```

Mapping to backlog status: `GO` / `GO_WITH_TECH_DEBT` → `done`; `NO_GO` → `failed`. `backlog list` /
status surface the decision + reconciled + quality + audit so "Brain analyzed the work and the
worker" is visible.

## 8. The wire (execute-dispatcher, task branch)

After `waitForResult` (+ the existing grace re-poll), when a `result` is present:
1. `flow.step('brain_verdict', …)` → `const evaluation = evaluateBacklogResult(live, result, projectRoot)`.
2. `flow.step('audit_verdict', …)` → `const audit = await auditBacklogResult(live, result, projectRoot)`.
3. `ok = evaluation.decision !== 'NO_GO'`; `reason = evaluation.reason`.
4. `updateStatus(..., ok ? 'done' : 'failed', { ok, reason, decision, reconciled, quality, audit })`.
5. `flow.step(ok ? 'done' : 'failed', …)`.
Capability/process/sprint branches keep their current behavior (sprint already evaluates; capability
uses the broker audit). The flow-reporter still emits `picked`/`spawned`/`done` for all kinds.

## 9. Testing (TDD, hermetic)

- **Brain-Eval adapter (`backlog-eval.ts`):** entry→Task mapping; `evaluateBacklogResult` with a
  result whose selfAssessment is NO_GO but with disk work → reconciled GO_WITH_TECH_DEBT → success;
  clean DONE → GO; genuine NO_GO (no work) → failure. Inject/stub the disk-verify where needed.
- **Auditor adapter:** `auditBacklogResult` flags an out-of-scope `filesChanged` as a boundary
  violation; an in-scope clean result → `boundary: 'clean'`.
- **Flow-Reporter:** emits the expected ordered step records on both channels (capture via an
  injected `print` + `audit` sink).
- **execute-dispatcher integration:** a finished task drives the Brain+Auditor verdict into `ok` +
  the rich `lastResult`, and the flow steps fire. Reuse the existing hermetic dispatcher test setup
  (`execute-dispatcher-jit.test.ts`).

## 10. Scope boundaries / follow-ups (separate spec→plan cycles)

- **Lifecycle kernel** — mode-independent retro / decay / cleanup + per-item `.tasks/` hygiene
  between autonomous items (the user's ".tasks boşalt + retro/decay/cleanup sistematiğe" directive).
- **Modularization layers** — core / base / ext / cust split + deckent-hub. Later phase; this kernel
  work establishes the mode-independent core boundary it depends on.
- **Hard Auditor enforcement** — flipping boundary/ADR from advisory to blocking is ADR-037 V2
  (post-GA), out of scope here.

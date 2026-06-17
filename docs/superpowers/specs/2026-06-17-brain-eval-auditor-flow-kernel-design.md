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
   ③ Cross-Verify hook   = runCrossVerify (XVER-1)   [EXISTS — cross-verify-runner.ts; sprint-only today]
   │     cross-provider: Anthropic worker → OpenAI verifier (mutual); ADVISORY (never a downgrade);
   │     honest-skip when no 2nd provider; config.cross_verify gated
   │     → CrossVerifyAdvisory { verdict: confirmed|refuted|unclear }
   ▼
   ④ Flow-Reporter       = structured step emitter (reports brain + audit + cross-verify)
         ├─ channel 1: terminal (human-readable debug flow)
         └─ channel 2: JSONL audit-event / event-stream (AI-consumable data)
   ▼
   persist rich verdict → backlog.lastResult { ok, reason, decision, reconciled, quality, audit, crossVerify }
```

**Binding cross-check rule (memory `feedback_cross_check_anthropic_openai`):** Anthropic's work is
verified by OpenAI and vice-versa — "brain-eval alone is not enough." XVER-1 exists but is wired ONLY
into sprint mode; this slice extends it to the autonomous/task path (the rule's explicit "task-moduna
gerçek-wire et"). Component ③ is therefore not optional polish — it is a binding requirement.

**Dual-perspective (memory `feedback_dual_perspective_dogfood_product`):** every component serves BOTH
(a) deckent dogfood — deckent's own autonomous runs gain core uniformity — AND (b) deckent product —
a USER/ENTERPRISE running `deckent autonomous` gets the same Brain + Auditor + cross-provider trust +
rich flow. The kernels are project-agnostic; the Flow-Reporter's dual channel (human terminal + AI
JSONL) is the agentic-OS enterprise surface. No MVP — god-level on both faces.

Both kernels already exist and are mode-independent; this slice **wires** them into the autonomous
task path (the gap) and adds the flow-reporter. Sprint already runs them, so uniformity holds by
construction — the kernels are the single source for both paths.

## 4. Component ① — Brain-Eval kernel + adapter

- **Kernel (reuse, unchanged):** `evaluateWithRubric(result, task, rubric?, projectRoot?): EvaluationResult` in `result-evaluator.ts`. This is the **non-deprecated** evaluation path sprint mode uses; it already does rubric quality scoring (`totalScore` + `rubricScores`), spurious-NO_GO reconciliation (`reconcileRubricNoGo` + `reconcileSpuriousNoGo`, disk-verify), OOM-kill recovery, and the GO/NO_GO/GO_WITH_TECH_DEBT decision. (The older `evaluateResult` returns a bare `TaskEvaluation` enum and is `@deprecated` — do NOT use it; it would discard the quality + reconciliation surfacing this slice needs.) `EvaluationResult = { decision: 'DONE'|'GO_WITH_TECH_DEBT'|'NO_GO'; totalScore: number; rubricScores: RubricScore[]; retryCount: number }`.
- **New adapter:** `evaluateBacklogResult(entry: BacklogEntry, result: TaskResult, projectRoot: string): BacklogEvaluation` (new module `src/orchestra/autonomous/backlog-eval.ts`). Builds a minimal `Task` from the entry (shared `buildTaskForEval(entry, result)` helper, reused by all three adapters):
  - `id` = `result.taskId` (the run-id) || `entry.id`
  - `description` = `entry.spec.description` (JIT detail) ?? `entry.summary` ?? `entry.title`
  - `scope` = `{ directories: [entry.spec.scopeDir ?? '.'], filesRead: [], filesWrite: [] }`
  - `goNogo` = `{ goCriteria: entry.summary ?? entry.title, noGoCriteria: '', techDebtAcceptable: '' }` (the planner emits no explicit goNogo; the decision is driven by selfAssessment + reconciliation + disk-verify, not goNogo text)
  - `provider`/`model` from `entry`/`result`; remaining required `Task` fields filled with neutral defaults (`effort:'normal'`, `priority:'NORMAL'`, `status:'DONE'`, `dependencies:[]`, `reason:''`, `title:entry.title`).
  Then calls `evaluateWithRubric(result, task, undefined, projectRoot)` and maps the `EvaluationResult` to `BacklogEvaluation = { decision, quality: totalScore, reconciled, reason }` where:
  - `quality` = `evaluation.totalScore`
  - `reconciled` = `result.selfAssessment === 'NO_GO' && evaluation.decision !== 'NO_GO'` (derived — the kernel overrides `decision` internally on reconciliation but does not expose a flag; this honest derivation surfaces it)
  - `reason` = the lowest-scoring rubric criterion's `reason` (most-informative line), or `'all criteria passed'` when none failed.
- **Why reconciliation matters:** a worker that self-reported NO_GO/TIMEOUT but whose git diff shows real work is reconciled to GO_WITH_TECH_DEBT — "Brain understands the worker correctly." This subsumes the grace re-poll's intent properly (the grace re-poll catches the late *write*; reconciliation catches the wrong *self-report*; both are kept and complementary).

## 5. Component ② — Auditor kernel (post-execution, advisory)

- **Reuse (unchanged):** `checkBoundaryViolations` (detects `file_outside_scope`), `checkADRCompliance`, `verifyWorkerResult` in `monitor/auditor.ts`.
- **New adapter:** `auditBacklogResult(entry, result, projectRoot, deps?): Promise<AuditVerdict>` — lives in the SAME new module `src/orchestra/autonomous/backlog-eval.ts` alongside `evaluateBacklogResult` (both are thin entry→kernel adapters; one focused module). Runs:
  - **boundary** — are `result.filesChanged` within `entry.spec.scopeDir`? Reuse the auditor's canonical scope primitive `isFileInScope` (newly `export`ed from `monitor/auditor.ts`) over `result.filesChanged` — the worker's declared changes are the post-hoc ground truth. (The `checkBoundaryViolations` wrapper is git-`diff --stat`-based and sprint-scan-specific; reusing its inner `isFileInScope` is the faithful, hermetic adaptation for the post-execution autonomous path.) Out-of-scope files → `BoundaryViolation[]`.
  - **adr** — `checkADRCompliance(projectRoot, result.filesChanged)` → `ADRViolation[]` (hermetic by default: absent `.brain/memory.db` → `[]` → `adr:'ok'`).
  - **functional** — `verifyWorkerResult(taskId, projectRoot, result)` (async). Injected via `deps.verifyFunctional` (default = real `verifyWorkerResult`) so unit tests stay hermetic. Map `VerificationVerdict`: `'PASS'→'pass'`, `'FAIL'→'fail'`, `'DOWNGRADE'→'fail'`.
  Returns `AuditVerdict { boundary: 'clean' | BoundaryViolation[], adr: 'ok' | ADRViolation[], functional: 'pass' | 'fail' | 'skipped' }`.
- **Advisory only** (ADR-037 V1.0): the audit verdict is recorded + surfaced in the flow, but does NOT flip the Brain decision or block dispatch. A boundary violation on an otherwise-GO task stays GO with the violation noted (the human/AI sees it).

## 5b. Component ③ — Cross-Verify hook (XVER-1, cross-provider — BINDING)

- **Reuse (unchanged):** `runCrossVerify` in `src/orchestra/cross-verify-runner.ts` (XVER-1, ADR-074). It dispatches a SECOND-provider verifier with an adversarial "try to refute" prompt, reads the verifier's verdict, and merges an advisory `crossVerify` field into the task's `.result` — `CrossVerifyAdvisory { verdict: 'confirmed' | 'refuted' | 'unclear' }`. NEVER a downgrade (Brain/human decides). Today it is called only from `sprint-phases.ts`.
- **New adapter:** `crossVerifyBacklogResult(entry, result, projectRoot, config)` (in `backlog-eval.ts`). Builds the Task-for-eval (same as the Brain adapter) and calls `runCrossVerify`, returning the `CrossVerifyRunResult { ran, advisory?, refuted }`.
- **Cross-provider, mutual:** the worker provider is Anthropic (claude) → the verifier is OpenAI (codex); an OpenAI worker → an Anthropic verifier. Gated by `config.cross_verify.enabled` (default-off today — this slice activates it for the autonomous path) and `high_stakes_only`. **Honest-skip** when no second provider is configured/available (`ran: false` surfaced in the flow — never a silent pass).
- **Advisory only:** the `crossVerify` verdict is recorded + flow-reported; a `refuted` verdict does NOT flip the Brain decision or block — it flags the result for Brain/human review (per the memory: "advisory; Brain/insan decides"). `refuted` is surfaced prominently in the flow + persisted.
- **Why binding:** memory `feedback_cross_check_anthropic_openai` — "brain-eval tek başına yetmez"; same-family models cannot audit their own blind spots. Cross-provider verification is required for a while, and this is the wire that brings it to the autonomous/task path (not just sprint).

## 6. Component ④ — Flow-Reporter (rich debug flow, dual-channel)

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
  crossVerify?: { ran: boolean; verdict?: 'confirmed' | 'refuted' | 'unclear' };  // XVER-1 cross-provider (advisory)
} | null
```

Mapping to backlog status: `GO` / `GO_WITH_TECH_DEBT` → `done`; `NO_GO` → `failed`. The Auditor and
cross-verify verdicts are ADVISORY — they are surfaced + persisted but never flip the status (a
`refuted` cross-verify or a boundary violation on an otherwise-GO task stays `done`, flagged for
review). `backlog list` / status surface decision + reconciled + quality + audit + crossVerify so
"Brain analyzed the work and the worker, and a second provider cross-checked it" is visible.

## 8. The wire (execute-dispatcher, task branch)

After `waitForResult` (+ the existing grace re-poll), when a `result` is present, in order:
1. `flow.step('brain_verdict', …)` → `const evaluation = evaluateBacklogResult(live, result, projectRoot)`.
2. `flow.step('audit_verdict', …)` → `const audit = await auditBacklogResult(live, result, projectRoot)`.
3. `flow.step('cross_verify', …)` → `const xv = await crossVerifyBacklogResult(live, result, projectRoot, config)` (honest-skip → `ran:false`).
4. `ok = evaluation.decision !== 'NO_GO'`; `reason = evaluation.reason`.
5. `updateStatus(..., ok ? 'done' : 'failed', { ok, reason, decision, reconciled, quality, audit, crossVerify })`.
6. `flow.step(ok ? 'done' : 'failed', …)` (a `refuted` cross-verify or a boundary violation is included in the line so the human/AI sees it even on a `done`).
Capability/process/sprint branches keep their current behavior (sprint already evaluates +
cross-verifies; capability uses the broker audit). The flow-reporter still emits `picked`/`spawned`/
`done` for all kinds.

## 9. Testing (TDD, hermetic)

- **Brain-Eval adapter (`backlog-eval.ts`):** entry→Task mapping; `evaluateBacklogResult` with a
  result whose selfAssessment is NO_GO but with disk work → reconciled GO_WITH_TECH_DEBT → success;
  clean DONE → GO; genuine NO_GO (no work) → failure. Inject/stub the disk-verify where needed.
- **Auditor adapter:** `auditBacklogResult` flags an out-of-scope `filesChanged` as a boundary
  violation; an in-scope clean result → `boundary: 'clean'`.
- **Cross-Verify adapter:** `crossVerifyBacklogResult` returns `ran:false` (honest-skip) when no
  second provider is configured; with a stubbed `runCrossVerify`, a `refuted` advisory is surfaced +
  persisted but does NOT flip the status (stays `done`). Reuse the existing cross-verify-runner test
  patterns; the cross-provider spawn is mocked (no live second-provider call in unit tests).
- **Flow-Reporter:** emits the expected ordered step records (`picked`→`spawned`→`brain_verdict`→
  `audit_verdict`→`cross_verify`→`done`) on both channels (capture via an injected `print` + `audit` sink).
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

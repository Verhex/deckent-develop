# LAST-STANDING Campaign Closeout Findings — Sprint-343

**Date:** 2026-06-27  
**Sprint:** sprint-343  
**Author:** independent disk-verify (task 343-011)  
**Discipline:** only confirmed `.result` files (selfAssessment=DONE) are marked DONE; all
other items are marked with their actual status. No over-claiming. No silent debt.

---

## Summary Table

| Task | Item | Status |
|------|------|--------|
| 343-001 | A14 verify-delta downgrade + A9 ADR-compliance gate (flag-gated, default-off) | NOT DONE — startup marker only |
| 343-002 | B1 worker `enforceRbac` hard-deny honoring | **DONE** |
| 343-003 | B6 cumulative-spend warn-gate at PRE-SPAWN (flag-gated, default-off) | NOT DONE — startup marker only |
| 343-004 | R4 dead `evaluateResult` removal | NOT DONE — startup marker only |
| 343-005 | VS Code extension stub consolidation | **DONE** |
| 343-006 | native-chat `/provider` switch rebuilds the adapter | NOT DONE — startup marker only |
| 343-007 | routing-affinity (ADR-075) enablement + observability module | NOT DONE — startup marker only |
| 343-008 | skill-sandbox honest-fail sentinel | **DONE** |
| 343-009 | `getMessage` deduplicated prod-warn | **DONE** |
| 343-010 | ADR-094: flag-gated enforcement-vein architecture record | **DONE** |
| 343-011 | LAST-STANDING closeout findings note (this file) | **DONE** |
| — | 4 dead modules (multi-agent/brain-context/capability-realizer/pattern-recorder/reader) | DEFERRED — WIRE-vs-KES |
| — | Two verify-collapsed items (cache_warm, resume-skips-completed) | Already done — pre-confirmed |

---

## Confirmed DONE Landings

### 343-002 — B1: Worker `enforceRbac` Hard-Deny Honoring

- **Evidence:** `.tasks/task-343-002.result` — selfAssessment=DONE, testsPassed=true
- **What landed:** `src/orchestra/sprint-runtime.ts` (+113 lines, -2). The stale comment at
  line 9 ("enforce_rbac is not yet declared on ResolvedConfig") was corrected — the flag IS
  declared at `config-types.ts:921`. The actual `checkWorkerAuthority` hard-deny path
  (`worker.ts:600-603`) was confirmed ALREADY LANDED in sprint-325 (commit `476a77ac`): when
  `opts.enforceRbac === true` and path is out of scope, it returns `false` (deny). The task
  verified and documented this; no logic change needed, stale comment fixed.
- **Tests:** `tests/agents/worker-authority-enforce.test.ts` NEW (5 tests): enforceRbac-on +
  out-of-scope → false (deny); enforceRbac-on + in-scope → true; enforceRbac-off + out-of-scope
  → true (soft default preserved). Plus regression: 6/6 worker-authority + 12/12 ent1-rbac-enforce
  = 23/23 all GREEN. tsc --noEmit 0 errors.
- **Files:** `src/orchestra/sprint-runtime.ts`, `tests/agents/worker-authority-enforce.test.ts`
- **NOT touched:** authority-matrix.ts, sprint-spawner.ts, config-types.ts

---

### 343-005 — VS Code Extension Stub Consolidation

- **Evidence:** `.tasks/task-343-005.result` — selfAssessment=DONE, testsPassed=true
- **What landed:**
  - DELETED stub tree: `src/extensions/vscode/extension.ts` + `src/extensions/vscode/package.json`
    (Sprint-049 placeholder commands — deckent.start/status/explain stubs)
  - DELETED stub-only test: `tests/extensions/vscode/extension.test.ts`
  - Empty directories removed: `src/extensions/vscode/`, `src/extensions/`, `tests/extensions/vscode/`
  - HARDENED canonical `extensions/vscode/src/extension.ts` (+32 lines): added `StatusBarItem`
    interface, made `window.createStatusBarItem?` optional in `VsCodeApi`, added status-bar creation in
    `activate()` with text/tooltip/show + pushed to `context.subscriptions`.
  - NEW test `tests/extensions/vscode-extension.test.ts` (7 tests): registerCommand (startSprint +
    showDashboard) + createStatusBarItem + subscriptions.length===3.
- **Tests:** 7/7 new + 43/43 existing extension tests PASS. tsc 0 errors.
- **NOT touched:** root `package.json`, `tsconfig.json` (glob include already covered the path)

---

### 343-008 — Skill-Sandbox Honest-Fail Sentinel

- **Evidence:** `.tasks/task-343-008.result` — selfAssessment=DONE, testsPassed=true
- **What landed:** `src/core/marketplace/skill-sandbox.ts` — line 78 `return []` (silent no-op
  when TypeScript is not installed) replaced with
  `return ['__SANDBOX_UNAVAILABLE__:typescript-not-installed']`. This sentinel propagates through
  the caller loop in `validateSkillSafety` into `SafetyReport.issues`, making `safe:false` —
  so "scanner unavailable" is unmistakably distinct from "scanned clean". Return type `string[]`
  unchanged; happy path (TS present) byte-for-byte.
- **Tests:** `tests/core/skill-sandbox-honest-fail.test.ts` NEW (8 tests) + 45 existing PASS =
  53 total. tsc 0 errors.

---

### 343-009 — `getMessage` Deduplicated Prod-Warn

- **Evidence:** `.tasks/task-343-009.result` — selfAssessment=DONE, testsPassed=true
- **What landed:** `src/cli/helpers/messages.ts` (+9 lines): module-level `Set<string>`
  (`_missingKeyWarnedInProd`) before `getMessage`. In the missing-key branch, production now emits
  one `process.stderr.write` warning per unique key; non-production dev-warn unchanged. Fallback
  return value (`key`) unchanged. No throw, no API change, no message-catalog edit.
- **Tests:** `tests/cli/get-message-missing-key-warn.test.ts` NEW (5 tests): missing key warns
  ONCE in prod + second call does NOT warn (dedup); present key never warns; non-prod dev-warn
  preserved. Existing `tests/cli/messages.test.ts` 20/20 GREEN.
- **Note:** tokenUsage fields all 0 in .result (orchestrator fills real values post-task). Self-
  assessment DONE is valid.

---

### 343-010 — ADR-094: Flag-Gated Enforcement Vein

- **Evidence:** `.tasks/task-343-010.result` — selfAssessment=DONE, testsPassed=true
- **What landed:** `docs/adr/094-flag-gated-enforcement-vein.md` — new ADR following the ADR-093
  template. Status: accepted, Date: 2026-06-27, Sprint: sprint-343. Documents all four gates:
  - B1 RBAC `enforceRbac` (worker.ts hard-deny, flag-gated under config top-level)
  - B6 cumulative spend warn-gate (`cost_limits.enforce_spend_gate`, pre-spawn warn-only)
  - A9 ADR-compliance gate (`gate.enforce_adr_compliance`, fail-open preserved per
    `enforceAdrCompliance:634-659`)
  - A14 tech-debt-ratio downgrade (`gate.verify_delta_downgrade`)
  Cross-references ADR-037 (RBAC advisory) and DESIGN-ENFORCEMENT-VEIN.md. No over-claim of
  decisions not made (hard-flip remains deferred post-GA-V2).
- **Lint:** `npm run lint:adr` PASS (82 ADRs validated, 0 errors). `npm run lint:link` — broken
  links are all pre-existing outside this file's scope (worktrees, .github, docs/cookbook,
  docs/reference/enterprise-integrations.md). No new broken links introduced.
- **NOT touched:** any other ADR, source file, MASTER-PLAN.md, DECKENT-TRIAGE-PLAN.md

---

## Not Landed — Startup Markers Only (partialMarker=true, need re-dispatch)

All five of the following tasks wrote only a startup safety marker before the container was
interrupted. No `.result` file exists; code may or may not be on disk. None are marked DONE.

### 343-001 — A14 Verify-Delta Downgrade + A9 ADR-Compliance Gate (flag-gated)

- **Status:** NOT DONE. `.tasks/task-343-001.partial-result` is a startup marker (0-token).
- **Scope:** `src/core/config-types.ts`, `src/core/config.ts`, `src/orchestra/sprint-phases.ts`,
  `tests/orchestra/evaluate-enforcement-gates.test.ts`
- **What was planned:** add `verify_delta_downgrade?` and `enforce_adr_compliance?` to `GateConfig`;
  wire them into `runEvaluatePhase` per-task loop — (A14) calling `computeVerifyDelta` +
  `applyTechDebtDowngrade` when flag-on; (A9) calling `enforceAdrCompliance` (fail-open per `:634-659`)
  when flag-on. Both default-off (product byte-identical when flags absent).
- **Gap:** flagged as open. Needs re-dispatch.

---

### 343-003 — B6 Cumulative-Spend Warn-Gate at PRE-SPAWN (flag-gated)

- **Status:** NOT DONE. `.tasks/task-343-003.partial-result` is a startup marker (0-token).
- **Scope:** `src/core/cost-gate.ts`, `src/cli/commands/start.ts`, `src/mcp/tools/start.ts`,
  `tests/core/spend-gate-prespawn.test.ts`
- **What was planned:** new pure helper `evaluateSpendWarnAtSpawn(...)` in `cost-gate.ts` that,
  when `costConfig.enforce_spend_gate === true`, projects rolling daily/monthly spend and emits a
  `COST_LIMIT_WARN` advisory (warn-only, never blocks). Wire at the two pre-spawn sites
  (`start.ts:388`, `mcp/tools/start.ts:194`) AFTER the existing estimate gate. Hard-block is an
  explicit `TODO(phase2)` (post-beta).
- **Gap:** flagged as open. Needs re-dispatch.

---

### 343-004 — R4: Dead `evaluateResult` Removal

- **Status:** NOT DONE. `.tasks/task-343-004.partial-result` is a startup marker (0-token).
- **Scope:** `src/orchestra/result-evaluator.ts`, `tests/orchestra/evaluate-result-consolidation.test.ts`
- **What was planned:** verify zero prod callers for `@deprecated async evaluateResult` at
  `result-evaluator.ts:121`, then DELETE the dead function. Every phase-driven evaluation already
  uses `evaluateWithRubric` (`:985`); CLI finalize uses `evaluateResultSync`. `evaluateWithRubric`,
  `reconcileEvaluationSpuriousNoGo`, `applyTechDebtDowngrade` untouched (Task 1 reads the last one).
- **Gap:** flagged as open. Needs re-dispatch.

---

### 343-006 — Native-Chat `/provider` Switch Wire

- **Status:** NOT DONE. `.tasks/task-343-006.partial-result` is a startup marker (0-token).
- **Scope:** `src/cli/commands/chat-native.ts`, `tests/cli/chat-native-provider-switch.test.ts`
- **What was planned:** `/provider <name>` currently calls `opts.switchProvider?.(arg)` but no
  caller passes `switchProvider` (silent no-op). Fix: construct provider through
  `createSwitchableProvider` and pass its `switchProvider` into `runChatNativeLoop` so the adapter
  actually rebuilds. Unknown provider → honest error (no claude fallback). Session without switch
  capability → honest "unavailable" message. `chat.ts` / `entry.ts` NOT touched (off-surface).
- **Gap:** flagged as open. Needs re-dispatch.

---

### 343-007 — Routing-Affinity (ADR-075) Enablement + Observability

- **Status:** NOT DONE. `.tasks/task-343-007.partial-result` is a startup marker (0-token).
- **Scope:** `src/orchestra/sprint-planner.ts`, `src/orchestra/task-mode-runner.ts`,
  `src/mcp/tools/run.ts`, `src/cli/commands/run.ts`,
  `src/core/routing-affinity-observability.ts` (NEW), `tests/orchestra/routing-affinity-enable.test.ts`
- **What was planned:** thread `skillAgentAffinity: config.routing?.skill_agent_affinity ?? false`
  into `RoutingOptions` at all four `routeTaskV2` call-sites (flag-off → byte-identical). New pure
  module `routing-affinity-observability.ts` with `recordAgentSelection` + `summarizeAgentDistribution`
  for non-blocking JSONL sink. Product default stays OFF; deckent-dev gitignored config enables it
  (host-side). `routing-engine.ts` / `activation-engine.ts` / `config-types.ts` NOT touched (flag
  already wired there, just unused).
- **Gap:** flagged as open. Needs re-dispatch.

---

## Two Verify-Collapsed Items (Already Done — Not Redone)

These were pre-confirmed to be already fixed BEFORE sprint-343 was planned. They are recorded
here as evidence of prior completion; this sprint did NOT re-implement them.

### cache_warm: Already Removed

- **Evidence:** `grep -r cache_warm src/` returns **0 matches** (confirmed empty on disk).
- **`evaluateCacheGate` survives (report-only):** the function is present in
  `src/core/limit-ledger-report.ts:383`, `src/cli/commands/usage.ts:25/209`,
  `src/mcp/tools/usage.ts:17/106`, and `src/orchestra/sprint-reporter.ts:450/585` — but it is a
  read-only reporting function, not a blocking enforcement gate. The `cache_warm` enforcement
  flag/behaviour is gone; `evaluateCacheGate` is the reporting-only remnant (correct, by design).
- **Action:** NONE required. Verified done.

### Resume Already Skips Completed Tasks

- **Evidence:** `src/orchestra/sprint-checkpoint.ts`:
  - **Line 654:** `for (const id of cp.completedTasks ?? []) taskIds.add(id);` — completed tasks
    are loaded into the task-set to be available for EVALUATE but they are never re-dispatched
    (they carry DONE status; the EVALUATE loop processes them by their existing result, not by
    re-running the worker).
  - **Line 732:** `const action: RestoreAction = !hasPending && !hasActiveWorkers ? 'complete' : 'resume-evaluate';`
    — if the only remaining tasks are completed (no pending, no active workers), the restore action
    is `'complete'` and the sprint closes immediately. Resume only continues when genuinely
    pending/active work remains.
- **Action:** NONE required. Verified done.

---

## Explicitly Remaining Open (No Silent Debt)

The following items were EXPLICITLY tracked as open going into this campaign sprint, remain open
after it, and are recorded here so no silent debt accumulates.

### Host-Side Config Flag-Flips for Dogfood Hard-Mode

These `.deckent/config.json` flips are NOT code changes — they are gitignored local config that
Alperen applies manually to dogfood the flag-gated enforcement paths:

| Flag | Required Task | Prerequisite |
|------|--------------|--------------|
| `enforce_rbac: true` | 343-002 (DONE) | Ready to flip when Alperen chooses |
| `verify_delta_downgrade: true` | 343-001 (NOT DONE) | Task must land first |
| `enforce_adr_compliance: true` | 343-001 (NOT DONE) | Task must land first |
| `enforce_spend_gate: true` | 343-003 (NOT DONE) | Task must land first |
| `skill_agent_affinity: true` | 343-007 (NOT DONE) | Task must land + multi-sprint balance obs first |

**Status:** host-side action — NOT a code task, NOT closeable by a sprint worker.

---

### Cost-Gate HARD-Block (Post-Beta)

The current B6 implementation (if landed) is warn-only by design. The HARD-block variant (block
sprint start unless acknowledged when projected spend exceeds limit) carries a `TODO(phase2)` note
and is explicitly deferred post-GA-V2. No sprint task may close this prematurely.

---

### Routing-Affinity Multi-Sprint Balance Observation Before Default-On

Even after 343-007 lands, the product default for `routing.skill_agent_affinity` stays `false`.
A multi-sprint balance observation (via `summarizeAgentDistribution`) is required to confirm no
agent imbalance before flipping the product default on. Timeline: Alperen decides after observing
data. **This is NOT a sprint-closeable item.**

---

### Bucket-D 80-ADR Re-Review (Alperen-Alone)

The remaining ~80 ADRs scheduled for the "Bucket-D" re-review session require Alperen's judgment
on each. This is explicitly an Alperen-solo task, not delegatable to a sprint worker. **Status:
deferred — separate track.**

---

### Enterprise-Layer / MOD-SPLIT (Separate Track)

The enterprise-layer architecture work (multi-tenant RBAC at API boundary, MOD-SPLIT module
isolation) is a separate architectural track with its own planning. **Status: deferred — separate
track, not LAST-STANDING scope.**

---

### Routing Agent-Cache Wire (routing-v2 Follow-Up)

The routing engine's agent-cache warming wire is a routing-v2 follow-up item. Not in this
campaign's scope. **Status: deferred to routing-v2.**

---

### 4 "Dead" Modules — DEFERRED as WIRE-vs-KES

The four modules tentatively identified as "dead" during TRIAGE:
- `multi-agent` controller module
- `brain-context` module
- `capability-realizer` module
- `pattern-recorder` / `pattern-reader` modules

The TRIAGE directive explicitly states **"fabrike-sil YASAK"** (do not delete fabricated-seeming
modules) — these require a design-pass to determine whether they are genuine dead code (KES =
delete) or unfinished wires (WIRE = complete). They were **NOT deleted in this sprint** and must
NOT be deleted without that analysis. **Status: deferred to a dedicated WIRE-vs-KES design pass.**

---

## Sprint-343 Closeout Verdict

| Category | Count | Notes |
|----------|-------|-------|
| DONE (confirmed .result) | 5 | 343-002, 005, 008, 009, 010 |
| NOT DONE (startup marker, need re-dispatch) | 5 | 343-001, 003, 004, 006, 007 |
| DEFERRED (not scheduled) | 1 cluster | 4 dead modules — WIRE-vs-KES |
| Already-done (verify-collapsed, pre-confirmed) | 2 | cache_warm, resume-skips |
| Explicitly open (no sprint workercan close) | 5 | host-config, cost-hard-block, affinity-default-on, Bucket-D, enterprise/MOD-SPLIT |

The five NOT-DONE tasks (343-001/003/004/006/007) are all startup-interrupted workers. Brain
re-dispatch is recommended. ADR-094 (343-010) documents the enforcement-vein architecture and
is valid regardless — it describes the design intent that the code tasks will realize.

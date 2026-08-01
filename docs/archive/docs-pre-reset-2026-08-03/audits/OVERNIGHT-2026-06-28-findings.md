# Sprint-334 Campaign Findings — 2026-06-28

Independent disk-verify findings note. Only confirmed `.result` files (selfAssessment=DONE) are
marked DONE. All other claims are attributed to observed code-on-disk or explicit absence.
MASTER-PLAN.md / DECKENT-TRIAGE-PLAN.md / the 06-27 findings are not touched.

---

## Context

Sprint-334 was the campaign sprint that targeted the P0 TOKEN-REAL-CAPTURE gap (heuristic→session-
store real usage), plus AS-2 security phase-2 (dynamic credential scrub), lifecycle P0-C (orphan
terminate at normal finalize), A20 IPC honoring, F1-013 event-parity, Telegram KPI dispatch, and
KPI CLI breach surface. 11 tasks total (334-001..011); docs tasks 009/010 and infra task 011 were
queued after the code wave.

Sprint started at approximately 09:51 UTC on 2026-06-27. Workers 001–008 spawned concurrently.
All heartbeats froze at sequence=25, timestamps ~09:56–09:57 UTC (~5 minutes into the sprint).
Sprint was interrupted before completion. 2/11 tasks wrote terminal `.result` files before
interruption; the rest have only startup-marker `.partial-result` files or no result at all.

---

## Confirmed DONE Landings (disk-verified .result, selfAssessment=DONE)

### Task 334-004 — A20: `handleWorkerQuestion` honors `suggestedAction` (flag-gated, default-off)
- **Source:** `.tasks/task-334-004.result` — selfAssessment=DONE
- **What landed:** `src/orchestra/ipc-registry.ts` (+45 lines, -10). New optional
  `HandleWorkerQuestionOptions { honorWorkerQuestionAction?: boolean }` threaded as a 3rd param to
  `handleWorkerQuestion` and 4th to `checkWorkerQuestions`. When the flag is ON AND
  `question.suggestedAction` is present, that action (`abort`/`retry`/`skip`/`continue`) is written
  into `BrainAnswer.action`; when flag is OFF or no `suggestedAction` → historical `'continue'`
  byte-for-byte. Default unchanged (off). `task-types.ts` was NOT modified (Task 1's SOLE-owner
  constraint honored).
- **Tests:** 61 passed — 9 new A20 tests (including the pre-fix RED: flag-on→always-'continue')
  + 28 ipc-registry + 24 result-collector all GREEN. `tsc --noEmit` 0 errors.
- **New file on disk:** `tests/orchestra/ipc-worker-question-action.test.ts` (untracked).
- **Boundary:** in-scope (`ipc-registry.ts` + test). No other files modified by this task.
- **Gap note:** production wiring of `config.honor_worker_question_action` → option param is a
  future caller-side step (result-collector.ts, out of this task's scope). Stays default-off
  until wired.

### Task 334-007 — KPI Faz-2: `deckent kpi` CLI breach advisory section
- **Source:** `.tasks/task-334-007.result` — selfAssessment=DONE
- **What landed:** `src/cli/commands/kpi.ts` (+8 lines, +2 imports: `buildKpiBreachAdvisory` +
  `ScorecardLang`). After scorecard table renders, calls `buildKpiBreachAdvisory(views, lang)` and
  prints the result as a "KPI Breaches" section. All-healthy or empty → no section (honest no-op).
  `breach-advisor.ts` / `messages.ts` untouched (OFF-LIMITS as specified). Scorecard table
  byte-for-byte. JSON mode unchanged (returns before table render path).
- **Tests:** 6/6 new tests GREEN (`tests/cli/kpi-breach-surface.test.ts`). Existing
  kpi-no-arg-fallback 8/8 GREEN, tests/kpi 187/187 GREEN.
- **New file on disk:** `tests/cli/kpi-breach-surface.test.ts` (untracked).
- **Boundary:** in-scope (`kpi.ts` + test). `messages.ts` untouched per task-007 constraint.

---

## In-Flight — Code Written, No Terminal .result

These tasks wrote code to disk but the worker did not flush a `.result` file before the sprint was
interrupted. The `.partial-result` files are startup markers (partialMarker=true, 0-token — NOT
real results). **None of these are marked DONE.**

### Task 334-001 — P0 TOKEN-REAL-CAPTURE (session-store reader)
- **Status:** EXECUTING (hb frozen at sequence=25, 09:56 UTC). No `.result`.
- **Code on disk (disk-verified):**
  - `src/providers/session-usage-store.ts` — NEW untracked file (new provider-native usage reader).
  - `src/orchestra/token-counter.ts` — modified (+42 lines in git diff).
  - `src/core/task-types.ts` — modified (+18 lines; additive `cacheCreationTokens?` and `source?`
    fields on `TokenUsage` — backward-compatible optional additions).
- **Not yet confirmed:** whether the test files (`tests/providers/session-usage-store.test.ts`,
  `tests/orchestra/token-counter-real-usage.test.ts`) are on disk and GREEN.
- **Gap:** No `.result` → cannot assert DONE. The P0 fix code exists on disk but is unverified
  (tests not confirmed passing, `tsc --noEmit` not confirmed 0-new-errors). cacheCreation capture
  and `source='session-store'` flow are the claimed outcomes — disk-readable in code but not
  proved via test run.
- **Cost-calculator note:** once real `cacheCreationTokens` flows, the EXISTING
  `cost-calculator.ts` (`RegimeCostUsage.cacheCreationTokens` → pricing) handles it with no
  cost-calculator edit (by-design).

### Task 334-002 — F1-014 Phase-2: dynamic cross-provider credential scrub
- **Status:** EXECUTING (hb frozen at sequence=25, ~09:57 UTC). No `.result`.
- **Code on disk (disk-verified):**
  - `src/providers/cross-provider-keys.ts` — NEW untracked file (shared resolver for static base
    set ∪ config `apiKeyEnv` providers).
  - `src/providers/subprocess.ts` — modified (replaces inline static set with shared resolver call).
- **Not yet confirmed:** `spawn-backend-docker.ts` changes (in scope.filesWrite) and test file
  `tests/providers/cross-provider-keys-scrub.test.ts`.
- **Gap:** No `.result` → cannot assert DONE. The scrub unification code is on disk but unverified.

### Task 334-005 — F1-013 Phase-2: SCOPE_INSUFFICIENT event-stream emission parity
- **Status:** EXECUTING (hb present). No `.result`.
- **Code on disk (disk-verified):**
  - `src/agents/http-agentic-worker.ts` — modified (+51 lines in git diff). Scope-reject site
    now also emits a scope-violation event (in addition to the model-facing error feed).
- **Not yet confirmed:** test file `tests/agents/http-agentic-scope-event.test.ts` and test run.
- **Gap:** No `.result` → cannot assert DONE.

### Task 334-008 — Cookbook: multi-provider and cost/KPI recipe
- **Status:** EXECUTING. No `.result`.
- **Code on disk (disk-verified):**
  - `docs/cookbook/multi-provider-and-cost-en.md` — NEW untracked file exists on disk.
- **Gap:** No `.result` → cannot assert DONE. File exists but was not confirmed against
  goCriteria (lint:link GREEN, no invented commands) before interruption.

---

## Not Landed — No Code or No .result

### Task 334-003 — P0-C: orphan terminate at NORMAL finalize (not only --force)
- **Status:** EXECUTING (hb frozen). No `.result`. Only `.partial-result` startup marker.
- **Disk check:** `src/cli/commands/finalize.ts` is NOT in `git diff --stat` — the file was not
  modified. Code was not written to disk before interruption.
- **Gap:** The orphan-at-normal-finalize bug (sprint-333 27-min linger) is NOT fixed in this
  sprint. Needs re-dispatch.

### Task 334-006 — Telegram KPI dispatch (wired without connector-bootstrap.ts)
- **Status:** EXECUTING (hb frozen). No `.result`. Only `.partial-result` startup marker.
- **Disk check:** `src/connectors/kpi-summary-dispatch.ts` (new module), `src/cli/commands/start.ts`,
  `src/cli/commands/autonomous.ts`, `src/orchestra/sprint-runner-entry.ts` — NONE appear in
  `git diff --stat src/` or `git status --short`. Code not written to disk.
- **Gap:** Telegram KPI dispatch wiring not landed. The `buildKpiSprintSummary` function (sprint-332)
  and `kpiSummaryFn` hook (connector-notify-adapter.ts) still exist but are unwired in the caller
  sites. Blocked on connector-bootstrap.ts constraint (design correct: caller-site approach), but
  code not written. Needs re-dispatch.

### Task 334-010 — ADR-093: real token/cost capture architecture record
- **Status:** PENDING (never started). No `.result`, no `.partial-result`, no `.hb`.
- **Disk check:** `docs/adr/093-real-token-usage-capture.md` does NOT exist on disk.
- **Gap:** ADR not written. Will be needed alongside Task 1 confirmation to close the architecture
  record.

### Task 334-011 — F11 REPL skill-dispatch (parity slice)
- **Status:** PENDING (never started). No `.result`, no `.partial-result`.
- **Disk check:** `src/cli/repl/native-tool-registry.ts` NOT in `git diff --stat` — no changes.
- **Gap:** REPL skill-dispatch not wired. Native tool registry still missing skill-dispatch tool.

---

## Boundary Observations (sprint-334 ground truth)

- **`src/cli/commands/chat-tool-bridge.ts` (+6) + `tests/cli/chat-tool-bridge.test.ts` (+3):**
  Modified but NOT in any sprint-334 task's `scope.filesWrite`. The pre-sprint baseline (06-27
  findings, Sprint-334 monitor Poll 0) noted "prior cookbook/bot-agentic work" in the dirty tree —
  these changes are most likely pre-sprint-334 (from bot-agentic social-identity work). Attribution
  is ambiguous; filed as observation, not a confirmed 334-boundary violation.
- **`src/cli/helpers/messages.ts` (+6):** Modified. Task-007 explicitly listed messages.ts as
  OFF-LIMITS and its `.result` notes "messages.ts untouched". The change predates task-007's
  completion or comes from another in-flight worker. Not attributed to task-007. Needs Brain
  attribution.
- **`src/connectors/bot-agentic.ts` (+23):** Confirmed pre-sprint dirty tree (social-identity
  Faz-3, noted in 06-27 findings baseline). NOT a sprint-334 boundary violation.

---

## Explicitly Open Items (No Silent Debt)

These items were carried over from sprint-333 as genuinely open and remain open after sprint-334:

| Item | Status | Reason |
|------|--------|--------|
| avg-tool-call + output/accepted-PR KPIs | Phase2 | Needs agentic-worker off-limits instrumentation OR Task-1-derived counter — blocked |
| REPL web-search parity | Phase2 | Needs in-session permission-gate UI (task-334-011 explicitly excluded it with TODO(phase2)) |
| R7 SSE (streaming server-sent events) | Deferred | Not surgical — deferred since sprint-331 |
| F1-010 mid-flight overflow (multi-worker) | Phase2 | TODO(phase2) in provider-overflow-gate.ts (sprint-333-002) |
| B-MIRROR finalize-side-effect | Watch | Non-blocking observation; no confirmed recurrence post-sprint-333 |
| Telemetry wire | Design-first | Architectural decision required before implementation |
| Cost-gate HARD enforcement | Post-beta | Current warn-only advisory (sprint-333-005); flip to hard gate is post-GA |
| KPI Faz-3 multi-tenant RBAC + custom-KPI + SLO/error-budget | Post-beta | Planned post-GA |

---

## Summary

| Task | Title | Result |
|------|-------|--------|
| 334-001 | P0 TOKEN-REAL-CAPTURE | In-flight (code on disk, no .result — NOT DONE) |
| 334-002 | F1-014 phase-2 dynamic scrub | In-flight (code on disk, no .result — NOT DONE) |
| 334-003 | P0-C orphan at normal finalize | Not landed (finalize.ts not modified, no .result) |
| 334-004 | A20 ipc suggestedAction flag-gated | **DONE** (disk-verified .result) |
| 334-005 | F1-013 SCOPE_INSUFFICIENT event parity | In-flight (http-agentic-worker.ts modified, no .result) |
| 334-006 | Telegram KPI dispatch | Not landed (no code on disk, no .result) |
| 334-007 | KPI CLI breach advisory section | **DONE** (disk-verified .result) |
| 334-008 | Cookbook: multi-provider + cost/KPI | In-flight (file on disk, no .result — NOT DONE) |
| 334-009 | This findings note | DONE (this file) |
| 334-010 | ADR-093 real token/cost capture | Not started (PENDING, no file) |
| 334-011 | F11 REPL skill-dispatch parity | Not started (PENDING, no file) |

Sprint-334 **did not complete** before interruption (~09:56-09:57 UTC). 2/11 tasks are confirmed
DONE; 4 have in-flight code on disk (unverified); 5 are not landed or not started. Brain
re-dispatch recommended for tasks 001, 002, 003, 005, 006, 008, 010, 011.

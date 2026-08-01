# Sprint-362 Debt-Note Close-Out (363-007)

Reads the 4 debt-notes named by 363-007's task description out of
`.brain/archive/sprint-362-tasks/` result files, closes what falls inside this task's
write-authority, and lists everything else as a concrete file+line+recommendation
followup. Write-authority for 363-007 is the **approval-history family** only
(`src/api/approval-history-endpoint.ts`, `tests/api/approval-history-endpoint.test.ts`).

## In-authority: already closed (verified, not re-done)

**362-005 (the "+1" note)** — `APRHIST-DEBT-CLOSE`, closing `debt-360-013` — is the only one
of the 4 debt-notes inside this task's write-authority (approval-history family). Re-verified
disk state before writing anything:

- `src/api/approval-history-endpoint.ts` and `tests/api/approval-history-endpoint.test.ts`
  read in full: 362-005 already delivered the hermetic 13-test suite over
  `buildApprovalHistoryPage`/`parseApprovalHistoryQuery` plus the stale-comment fix
  ("NOT wired into server.ts" → "wired in server.ts (360-013)"). Nothing left to change.
- Before/after (this task made **zero** source edits — confirmed already-clean, not re-fixed):
  - `npx tsc --noEmit` → clean (0 errors), both before and after.
  - `npx vitest run tests/api/approval-history-endpoint.test.ts tests/api/approval-history-wire.test.ts`
    → 19/19 passed, both before and after.
- The one open item this family still has (`docs/reference/api-surface.md` doc gap, below) sits
  in a file outside this task's write list, so it is documented as a followup rather than edited.

## Out-of-authority followups

Each item below traces to one of the 4 debt-notes, was disk-verified (grep/read, not inferred
from the old notes alone), and is out of 363-007's write scope.

### 1. `debt-357-015-fix` chain — evaluator ruleset mismatch is a LIVE, reproducible gap

**Traces to:** "001-zinciri" (`362-001` → `362-001-fix`).

**File:** `src/orchestra/rubric-registry.ts:127-166` (`isAuditTask`, `isDocumentWriteTask`,
`detectTaskType`).

**Finding:** 362-001-fix's notes recommended "the result-evaluator select a DOC ruleSet for
doc-writer/documentation origins" as future work, as if the mechanism didn't exist yet. It
already does — `DOC_WRITE_RUBRIC` (`rubric-registry.ts:80-96`) was added in sprint-154/155
(commit `81b1cb57`), well before sprint-357. The real defect is narrower and still live:
`isDocumentWriteTask`/`isAuditTask` both require **non-empty** `scope.filesWrite`
(`rubric-registry.ts:129` `writes.length !== 1`, `rubric-registry.ts:150`
`writes.length === 0`) before checking anything about `docs/`. `357-015-fix`'s own task JSON
(`.brain/archive/sprint-357-tasks/task-357-015-fix.json`) has `"scope": {"filesWrite": []}` —
the priority-fix template left it empty — so `detectTaskType` silently falls through to the
`code-development` default and CODE_RUBRIC applies, reproducing the exact "coverage=null on a
doc task → depressed score" failure mode DOC_WRITE_RUBRIC was built to prevent. This will
recur for any priority-fix task whose scope-builder leaves `filesWrite` empty, regardless of
`assignedAgent`.

**Recommendation:** In `detectTaskType` (or upstream in the priority-fix task-builder that
produces `357-015-fix`-shaped tasks), fall back to `task.scope.directories` when
`filesWrite` is empty before defaulting to `code-development` — e.g. treat an
all-`docs/`-directories scope with empty `filesWrite` as `document-write` rather than silently
defaulting to code. Add a regression test asserting `detectTaskType` on a fix-task shape with
`filesWrite: []` and `directories: ['docs/']`.

**Finding 2 — the chain never reaches an honest DB closure.** `debt-357-015-fix` is still
`active` in `.brain/exports/debt.md`'s Active Technical Debt table (verified live, not from the
old notes). Root cause, confirmed by direct read:
- `src/orchestra/sprint-planner.ts:950` reads `item.class === 'verified-no-result'` as the
  honest-closure skip signal, but `grep -rn "class:\s*'verified-no-result'" src/` returns
  **zero** producers anywhere in the codebase — nothing ever sets this classification.
- `injectCriticalDebtTasks`'s `skipped` return value (`sprint-planner.ts:913`) also has **zero**
  callers (`grep -n "\.skipped\b" src/orchestra/sprint-planner.ts` → no hits) — even a skip
  never triggers `resolveDebt`, so a skipped debt row stays `active` forever and keeps
  re-injecting every sprint.
- Separately, `src/orchestra/sprint-phases.ts:1788-1791` (EVALUATE phase) still does
  single-parent-only `resolveDebt(`debt-${task.fixForTaskId}`)` — the exact bug class
  362-001-fix fixed, but only in the FIX phase's chain-walk (`sprint-phases.ts:2453-2458`). A
  fix-of-a-fix that completes via the EVALUATE path (not FIX) will still fail to resolve a
  multi-hop debt chain's root.

**Recommendation:** (a) add a producer that sets `class: 'verified-no-result'` when a fix
worker/evaluator determines the underlying deliverable was already complete pre-fix (e.g. a
`resolveDebt` call site wired to the `skipped` array from `injectCriticalDebtTasks`); (b) apply
the same ancestor chain-walk from `sprint-phases.ts:2453-2458` to the EVALUATE-phase call site
at `sprint-phases.ts:1788-1791` so both phases resolve the chain root, not just the immediate
parent. Recommend a dedicated Brain-scoped task — both files are `src/orchestra/*`, outside
363-007's write authority.

### 2. `debt-361-002` (via 362-004) — CLI wiring still missing

**Traces to:** "004".

**File:** `src/cli/commands/limits.ts:44-64` (`LimitGateConfig`, `readRawLimitGateBlock`),
`src/cli/commands/limits.ts:110-119` (`resolveLimitGateThresholds`).

**Finding:** Confirmed by direct read — `LimitGateConfig` still only has `enabled`,
`session_max_pct`, `weekly_max_pct` (no `session_warn_pct`/`weekly_warn_pct`), and
`resolveLimitGateThresholds` still hardcodes `warnPct` as
`Math.min(DEFAULT_LIMIT_GATE_THRESHOLDS.warnPct, block)` per window — exactly what 362-004's
notes described as still-open. 362-004 built the reusable primitive
(`resolveWindowedLimitGateThresholds`/`evaluateLimitGateByWindow` in
`src/core/limit-preflight.ts`) but nothing in `src/cli/commands/limits.ts` calls it yet.

**Recommendation:** Add `session_warn_pct`/`weekly_warn_pct` to `LimitGateConfig`, parse them
in `readRawLimitGateBlock` with the existing `isValidPct` guard
(`src/cli/commands/limits.ts:50`), and replace the hand-rolled per-window logic in
`resolveLimitGateThresholds`/`evaluateWindowedLimitGate` with a call into
`resolveWindowedLimitGateThresholds`/`evaluateLimitGateByWindow` from `core/limit-preflight.ts`.
Out of 363-007's write authority (`src/cli/` not in scope).

### 3. `debt-362-008` "brain-debt" — stale MASTER-PLAN row + evaluator anomaly

**Traces to:** "008-brain-debt".

**File:** `docs/MASTER-PLAN.md:52` (Sıra-54, TERM-RPC row).

**Finding:** 362-008's own docImpact note said this row should record that
`session.list`/`run.status` ride the terminal-session surface (`PtySessionManager`), not a
REPL-process session-registry, because importing `src/cli/helpers/session-registry.ts` into
`src/api/server.ts` would violate ADR-D-004 C3. Current row text (line 52) already mentions
"362-008/009: RPC HTTP-endpoint (4 read-metot, auth-arkası) + REPL local-transport çift-tüketici
KANITI" but does not yet name the `PtySessionManager` substitution or its two documented
narrowing gaps (`lastActivityAt` mirrors `createdAt`; `run.status.finishedAt` always `null`).

**Recommendation:** Append a short clause to the MASTER-PLAN.md:52 row (or its detail cell)
naming the `PtySessionManager` substitution and the two narrowing gaps, so a future reader
doesn't reintroduce a `cli/`→`api/` import trying to "fix" `lastActivityAt`/`finishedAt`. Out of
363-007's write authority (`docs/MASTER-PLAN.md` not in scope).

**Separate anomaly worth flagging (not a docImpact, an evaluator-scoring oddity):** 362-008's
`.result` has `selfAssessment: "DONE"` but `brainEvaluation: "GO_WITH_TECH_DEBT"` with
`brainEvaluationReason: "rubric total 100 → GO_WITH_TECH_DEBT"` — a rubric total of 100
producing a GO_WITH_TECH_DEBT verdict (rather than DONE) is internally inconsistent with e.g.
362-002/362-013, which also scored 100 and got `DONE`. This is a `result-evaluator.ts`/
`sprint-phases.ts` decision-mapping question (why does an identical top score produce two
different verdicts across tasks in the same sprint), not something resolvable from the
approval-history family. Recommend a dedicated audit of `toAuditDecision`/the DONE-vs-GWTD
branch for a rubric-total-100 case — out of 363-007's write authority.

### 4. `docs/reference/api-surface.md` — GET /api/approvals/history undocumented

**Traces to:** "+1" (362-005), and the family this task's write-authority sits in.

**File:** `docs/reference/api-surface.md` — no insertion point exists yet;
`grep -ni "approval" docs/reference/api-surface.md` shows zero HTTP-route mentions for either
`GET /api/approvals` (356-002, live since sprint 356) or `GET /api/approvals/history`
(359-013/360-013/362-005, live since sprint 360). Confirmed via disk read: the doc's `### APR —
Approval Contract → EventStream Chain` section (lines 545-608) documents the core *modules*
(broker/relay/masking/store/policy/etc.) but not their HTTP consumers, and the top-level
`## HTTP API Endpoints` section (line 7) only documents the 2 auth routes — so this is a
pre-existing partial-coverage pattern for the whole doc, not a regression unique to
approval-history.

**Recommendation:** Add a short "HTTP consumers" paragraph at the end of the APR section
(after line 601, before the `### TERM` heading at line 611) documenting both
`GET /api/approvals` and `GET /api/approvals/history[?status=&limit=&offset=]` — request/query
params, response shape (point at `ApprovalHistoryResponse` in
`src/api/approval-history-endpoint.ts:73-76`), and the auth-gate inheritance already covered by
`tests/api/approval-history-wire.test.ts`. Out of 363-007's write authority
(`docs/reference/api-surface.md` not in scope — only `docs/analysis/debt-close-362.md` is).
